-- 006_group_booking_and_flexible_slots.sql
-- Allows group bookings with 1 shared phone number, multiple member names in display_name,
-- and flexible slot counts up to the match's max_slots.

ALTER TABLE public.registrations
  DROP CONSTRAINT IF EXISTS registrations_display_name_check;

ALTER TABLE public.registrations
  ADD CONSTRAINT registrations_display_name_check
  CHECK (char_length(display_name) BETWEEN 1 AND 300);

CREATE OR REPLACE FUNCTION public.book_slots(
  p_match_id uuid,
  p_name text,
  p_contact text,
  p_slots int,
  p_pin text,
  p_ip inet
)
RETURNS TABLE (
  id uuid,
  access_token text,
  payment_code text,
  status text,
  amount_due int,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_match public.matches%ROWTYPE;
  v_name text;
  v_contact text;
  v_digits text;
  v_norm_contact text;
  v_norm_ip inet;
  v_existing_match_slots int;
  v_concurrent_count int;
  v_waitlist_count int;
  v_expired_recent_count int;
  v_ip_hold_count int;
  v_occupied_slots int;
  v_amount_due int;
  v_pin_hash text;
  v_hold_interval interval;
  v_expires_at timestamptz;
  v_status text;
  v_code text;
  v_chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_attempt int := 0;
  v_reg_id uuid;
  v_access_token text;
  i int;
BEGIN
  -- Lock match first, then expire & promote
  SELECT * INTO v_match
  FROM public.matches
  WHERE matches.id = p_match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_found' USING ERRCODE = 'P0001';
  END IF;

  PERFORM public.expire_and_promote(p_match_id);

  -- Re-read match after expire_and_promote
  SELECT * INTO v_match
  FROM public.matches
  WHERE matches.id = p_match_id;

  -- Sanitize inputs
  v_name := trim(regexp_replace(COALESCE(p_name, ''), '[' || chr(8237) || chr(8238) || ']', '', 'g'));
  v_contact := trim(regexp_replace(COALESCE(p_contact, ''), '[' || chr(8237) || chr(8238) || ']', '', 'g'));

  IF v_name = '' OR char_length(v_name) > 300 THEN
    RAISE EXCEPTION 'invalid_name' USING ERRCODE = 'P0001';
  END IF;

  v_digits := regexp_replace(v_contact, '[^0-9]', '', 'g');
  IF char_length(v_digits) < 9 OR char_length(v_digits) > 11 OR char_length(v_contact) > 30 THEN
    RAISE EXCEPTION 'invalid_phone' USING ERRCODE = 'P0001';
  END IF;

  IF COALESCE(p_pin, '') !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'invalid_pin' USING ERRCODE = 'P0001';
  END IF;

  IF v_match.status <> 'open' THEN
    RAISE EXCEPTION 'match_not_open' USING ERRCODE = 'P0001';
  END IF;

  IF now() >= v_match.lock_at THEN
    RAISE EXCEPTION 'match_locked' USING ERRCODE = 'P0001';
  END IF;

  IF now() >= v_match.starts_at THEN
    RAISE EXCEPTION 'match_started' USING ERRCODE = 'P0001';
  END IF;

  IF p_slots < 1 OR p_slots > v_match.max_slots THEN
    RAISE EXCEPTION 'invalid_slots' USING ERRCODE = 'P0001';
  END IF;

  v_norm_contact := public.normalize_contact(v_contact);
  v_norm_ip := public.normalize_ip(p_ip);

  -- Per-match cap (active slots for same contact cannot exceed match max_slots)
  SELECT COALESCE(SUM(r.slots), 0)::int
  INTO v_existing_match_slots
  FROM public.registrations r
  WHERE r.match_id = p_match_id
    AND public.normalize_contact(r.contact) = v_norm_contact
    AND (
      r.status IN ('confirmed', 'waitlisted')
      OR (r.status = 'pending_payment' AND r.expires_at > now())
    );

  IF (v_existing_match_slots + p_slots) > v_match.max_slots THEN
    RAISE EXCEPTION 'per_match_cap' USING ERRCODE = 'P0001';
  END IF;

  -- Cross-match concurrent cap (upcoming open/locked matches only)
  SELECT COUNT(*)::int
  INTO v_concurrent_count
  FROM public.registrations r
  JOIN public.matches m ON m.id = r.match_id
  WHERE public.normalize_contact(r.contact) = v_norm_contact
    AND m.status IN ('open', 'locked')
    AND m.starts_at > now()
    AND (
      (r.status = 'pending_payment' AND r.expires_at > now())
      OR r.status = 'waitlisted'
    );

  IF v_concurrent_count >= 2 THEN
    RAISE EXCEPTION 'concurrent_cap' USING ERRCODE = 'P0001';
  END IF;

  -- Cross-match waitlist cap (upcoming open/locked matches only)
  SELECT COUNT(*)::int
  INTO v_waitlist_count
  FROM public.registrations r
  JOIN public.matches m ON m.id = r.match_id
  WHERE public.normalize_contact(r.contact) = v_norm_contact
    AND m.status IN ('open', 'locked')
    AND m.starts_at > now()
    AND r.status = 'waitlisted';

  IF v_waitlist_count >= 2 THEN
    RAISE EXCEPTION 'waitlist_cap' USING ERRCODE = 'P0001';
  END IF;

  -- Unpaid expiration cooldown (last 1 hour)
  SELECT COUNT(*)::int
  INTO v_expired_recent_count
  FROM public.registrations r
  WHERE public.normalize_contact(r.contact) = v_norm_contact
    AND r.status = 'expired'
    AND r.expires_at IS NOT NULL
    AND r.expires_at >= now() - interval '1 hour';

  IF v_expired_recent_count >= 2 THEN
    RAISE EXCEPTION 'cooldown' USING ERRCODE = 'P0001';
  END IF;

  -- Per-IP unpaid hold cap for same match
  SELECT COUNT(*)::int
  INTO v_ip_hold_count
  FROM public.registrations r
  WHERE r.match_id = p_match_id
    AND r.booking_ip IS NOT NULL
    AND public.normalize_ip(r.booking_ip) = v_norm_ip
    AND r.status = 'pending_payment'
    AND r.expires_at > now();

  IF v_ip_hold_count >= 3 THEN
    RAISE EXCEPTION 'ip_hold_cap' USING ERRCODE = 'P0001';
  END IF;

  -- Server-side pricing and PIN hashing
  v_amount_due := p_slots * v_match.fee_per_slot;
  v_pin_hash := extensions.crypt(p_pin, extensions.gen_salt('bf', 10));

  -- Live occupied slots
  SELECT COALESCE(SUM(r.slots), 0)::int
  INTO v_occupied_slots
  FROM public.registrations r
  WHERE r.match_id = p_match_id
    AND (r.status = 'confirmed' OR (r.status = 'pending_payment' AND r.expires_at > now()));

  IF (v_occupied_slots + p_slots) <= v_match.max_slots THEN
    v_status := 'pending_payment';
    v_hold_interval := CASE
      WHEN now() > v_match.starts_at - (v_match.cancel_cutoff_hours || ' hours')::interval
        THEN interval '10 minutes'
      ELSE (v_match.hold_minutes || ' minutes')::interval
    END;
    v_expires_at := LEAST(now() + v_hold_interval, v_match.starts_at - interval '1 minute');
  ELSE
    v_status := 'waitlisted';
    v_expires_at := NULL;
  END IF;

  -- Insert with 5-attempt unique_violation retry for payment_code
  LOOP
    v_attempt := v_attempt + 1;
    v_code := 'KEO';
    FOR i IN 1..6 LOOP
      v_code := v_code || substr(v_chars, (get_byte(extensions.gen_random_bytes(1), 0) % length(v_chars)) + 1, 1);
    END LOOP;

    BEGIN
      INSERT INTO public.registrations (
        match_id,
        display_name,
        contact,
        slots,
        status,
        payment_code,
        amount_due,
        expires_at,
        pin_hash,
        booking_ip
      )
      VALUES (
        p_match_id,
        v_name,
        v_contact,
        p_slots,
        v_status,
        v_code,
        v_amount_due,
        v_expires_at,
        v_pin_hash,
        p_ip
      )
      RETURNING registrations.id, registrations.access_token
      INTO v_reg_id, v_access_token;

      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_attempt >= 5 THEN
        RAISE EXCEPTION 'payment_code_generation_failed' USING ERRCODE = 'P0001';
      END IF;
    END;
  END LOOP;

  -- Recompute matches.slots_taken
  UPDATE public.matches
  SET slots_taken = (
    SELECT COALESCE(SUM(r.slots), 0)::int
    FROM public.registrations r
    WHERE r.match_id = p_match_id
      AND (r.status = 'confirmed' OR (r.status = 'pending_payment' AND r.expires_at > now()))
  )
  WHERE matches.id = p_match_id;

  RETURN QUERY SELECT v_reg_id, v_access_token, v_code, v_status, v_amount_due, v_expires_at;
END;
$$;

REVOKE ALL ON FUNCTION public.book_slots(uuid, text, text, int, text, inet) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.book_slots(uuid, text, text, int, text, inet) TO service_role;
