-- 003_booking_and_payment_rpcs.sql
-- MatchMate v3.1 Core Booking, Expiration/Waitlist Promotion, and SePay Payment RPCs

CREATE OR REPLACE FUNCTION public.expire_and_promote(p_match_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_match public.matches%ROWTYPE;
  v_reg RECORD;
  v_candidate RECORD;
  v_already_allocated int;
  v_refundable int;
  v_slots_taken int;
  v_remaining int;
  v_hold_interval interval;
  v_expires_at timestamptz;
BEGIN
  SELECT * INTO v_match
  FROM public.matches
  WHERE id = p_match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- 1. Expire timed-out pending_payment rows
  FOR v_reg IN
    SELECT *
    FROM public.registrations
    WHERE match_id = p_match_id
      AND status = 'pending_payment'
      AND expires_at IS NOT NULL
      AND expires_at <= now()
    FOR UPDATE
  LOOP
    UPDATE public.registrations
    SET status = 'expired'
    WHERE id = v_reg.id;

    SELECT COALESCE(SUM(amount), 0)::int
    INTO v_already_allocated
    FROM public.refunds
    WHERE registration_id = v_reg.id
      AND status IN ('pending', 'pending_review', 'done');

    v_refundable := GREATEST(v_reg.amount_paid - v_already_allocated, 0);

    IF v_refundable > 0 THEN
      INSERT INTO public.refunds (registration_id, amount, reason, status, account_info)
      VALUES (v_reg.id, v_refundable, 'underpaid_expired', 'pending', v_reg.refund_account_info);
    END IF;
  END LOOP;

  -- 2. Auto-finish past matches and expire remaining waitlisted rows
  IF v_match.status IN ('open', 'locked') AND v_match.starts_at <= now() THEN
    UPDATE public.matches
    SET status = 'finished'
    WHERE id = p_match_id;

    v_match.status := 'finished';

    UPDATE public.registrations
    SET status = 'expired'
    WHERE match_id = p_match_id
      AND status = 'waitlisted';
  END IF;

  -- 3. Auto-lock past lock_at deadline
  IF v_match.status = 'open' AND v_match.lock_at <= now() AND v_match.starts_at > now() THEN
    UPDATE public.matches
    SET status = 'locked'
    WHERE id = p_match_id;

    v_match.status := 'locked';
  END IF;

  -- Recompute occupied slots
  SELECT COALESCE(SUM(slots), 0)::int
  INTO v_slots_taken
  FROM public.registrations
  WHERE match_id = p_match_id
    AND (status = 'confirmed' OR (status = 'pending_payment' AND expires_at > now()));

  -- 4. FIFO waitlist promotion (skip-if-doesn't-fit)
  IF v_match.status = 'open' AND now() < v_match.lock_at AND now() < v_match.starts_at THEN
    v_remaining := v_match.max_slots - v_slots_taken;

    IF v_remaining > 0 THEN
      FOR v_candidate IN
        SELECT *
        FROM public.registrations
        WHERE match_id = p_match_id
          AND status = 'waitlisted'
        ORDER BY created_at ASC
        FOR UPDATE
      LOOP
        IF v_candidate.slots <= v_remaining THEN
          v_hold_interval := CASE
            WHEN now() > v_match.starts_at - (v_match.cancel_cutoff_hours || ' hours')::interval
              THEN interval '10 minutes'
            ELSE (v_match.hold_minutes || ' minutes')::interval
          END;
          v_expires_at := LEAST(now() + v_hold_interval, v_match.starts_at - interval '1 minute');

          UPDATE public.registrations
          SET status = 'pending_payment',
              expires_at = v_expires_at,
              promoted_at = now()
          WHERE id = v_candidate.id;

          v_remaining := v_remaining - v_candidate.slots;
          EXIT WHEN v_remaining <= 0;
        END IF;
      END LOOP;
    END IF;
  END IF;

  -- 5. Recompute matches.slots_taken from live source sum
  UPDATE public.matches
  SET slots_taken = (
    SELECT COALESCE(SUM(slots), 0)::int
    FROM public.registrations
    WHERE match_id = p_match_id
      AND (status = 'confirmed' OR (status = 'pending_payment' AND expires_at > now()))
  )
  WHERE id = p_match_id;
END;
$$;

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

  -- Sanitize inputs (strip bidi overrides; NUL bytes are already rejected by Postgres text & stripped in JS)
  v_name := trim(regexp_replace(COALESCE(p_name, ''), '[' || chr(8237) || chr(8238) || ']', '', 'g'));
  v_contact := trim(regexp_replace(COALESCE(p_contact, ''), '[' || chr(8237) || chr(8238) || ']', '', 'g'));

  IF v_name = '' OR char_length(v_name) > 60 THEN
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

  IF p_slots < 1 OR p_slots > 4 THEN
    RAISE EXCEPTION 'invalid_slots' USING ERRCODE = 'P0001';
  END IF;

  v_norm_contact := public.normalize_contact(v_contact);
  v_norm_ip := public.normalize_ip(p_ip);

  -- Per-match cap (active slots for same contact in this match)
  SELECT COALESCE(SUM(r.slots), 0)::int
  INTO v_existing_match_slots
  FROM public.registrations r
  WHERE r.match_id = p_match_id
    AND public.normalize_contact(r.contact) = v_norm_contact
    AND (
      r.status IN ('confirmed', 'waitlisted')
      OR (r.status = 'pending_payment' AND r.expires_at > now())
    );

  IF (v_existing_match_slots + p_slots) > 4 THEN
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

CREATE OR REPLACE FUNCTION public.apply_payment(
  p_txn_id text,
  p_amount int,
  p_content text,
  p_raw jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_payment_id uuid;
  v_norm_content text;
  v_extracted_code text;
  v_reg_id uuid;
  v_match_id uuid;
  v_match public.matches%ROWTYPE;
  v_reg public.registrations%ROWTYPE;
  v_already_allocated int;
  v_net_available int;
  v_occupied int;
  v_result text;
  v_surplus int;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_payment_amount' USING ERRCODE = 'P0001';
  END IF;

  -- Step 1: Idempotent payment insert
  INSERT INTO public.payments (sepay_transaction_id, amount, content, raw)
  VALUES (p_txn_id, p_amount, p_content, p_raw)
  ON CONFLICT (sepay_transaction_id) DO NOTHING
  RETURNING id INTO v_payment_id;

  IF v_payment_id IS NULL THEN
    RETURN jsonb_build_object('result', 'duplicate');
  END IF;

  -- Step 2: Normalize content and regex-extract KEO[A-Z0-9]{6}
  v_norm_content := regexp_replace(upper(COALESCE(p_content, '')), '\s+', '', 'g');
  v_extracted_code := substring(v_norm_content FROM '(KEO[A-Z0-9]{6})');

  IF v_extracted_code IS NULL THEN
    UPDATE public.payments
    SET result = 'unmatched'
    WHERE id = v_payment_id;
    RETURN jsonb_build_object('result', 'unmatched', 'payment_id', v_payment_id);
  END IF;

  -- Step 3: Read registration id, match_id unlocked
  SELECT r.id, r.match_id
  INTO v_reg_id, v_match_id
  FROM public.registrations r
  WHERE r.payment_code = v_extracted_code;

  IF NOT FOUND THEN
    UPDATE public.payments
    SET result = 'unmatched'
    WHERE id = v_payment_id;
    RETURN jsonb_build_object('result', 'unmatched', 'payment_id', v_payment_id);
  END IF;

  -- Step 4: Lock matches BEFORE expire_and_promote and registrations
  SELECT * INTO v_match
  FROM public.matches
  WHERE id = v_match_id
  FOR UPDATE;

  PERFORM public.expire_and_promote(v_match_id);

  SELECT * INTO v_reg
  FROM public.registrations
  WHERE id = v_reg_id
  FOR UPDATE;

  -- Step 5: Credit registration and link payment
  UPDATE public.registrations
  SET amount_paid = amount_paid + p_amount,
      payment_method = 'sepay'
  WHERE id = v_reg_id
  RETURNING * INTO v_reg;

  UPDATE public.payments
  SET registration_id = v_reg_id
  WHERE id = v_payment_id;

  -- Step 6: Compute already_allocated & net_available
  SELECT COALESCE(SUM(rf.amount), 0)::int
  INTO v_already_allocated
  FROM public.refunds rf
  WHERE rf.registration_id = v_reg_id
    AND rf.status IN ('pending', 'pending_review', 'done');

  v_net_available := v_reg.amount_paid - v_already_allocated;

  IF v_reg.status = 'pending_payment' THEN
    IF v_net_available = v_reg.amount_due THEN
      UPDATE public.registrations
      SET status = 'confirmed',
          expires_at = NULL
      WHERE id = v_reg_id;
      v_result := 'exact';
    ELSIF v_net_available < v_reg.amount_due THEN
      v_result := 'underpaid';
    ELSE
      v_surplus := v_net_available - v_reg.amount_due;
      UPDATE public.registrations
      SET status = 'confirmed',
          expires_at = NULL
      WHERE id = v_reg_id;
      INSERT INTO public.refunds (registration_id, amount, reason, status, account_info)
      VALUES (v_reg_id, v_surplus, 'overpaid', 'pending', v_reg.refund_account_info);
      v_result := 'overpaid';
    END IF;

  ELSIF v_reg.status = 'expired' THEN
    SELECT COALESCE(SUM(r.slots), 0)::int
    INTO v_occupied
    FROM public.registrations r
    WHERE r.match_id = v_match_id
      AND (r.status = 'confirmed' OR (r.status = 'pending_payment' AND r.expires_at > now()));

    SELECT * INTO v_match FROM public.matches WHERE id = v_match_id;

    IF v_match.status IN ('open', 'locked')
      AND now() < v_match.starts_at
      AND (v_occupied + v_reg.slots) <= v_match.max_slots
      AND v_net_available >= v_reg.amount_due
    THEN
      UPDATE public.registrations
      SET status = 'confirmed',
          expires_at = NULL
      WHERE id = v_reg_id;

      IF v_net_available > v_reg.amount_due THEN
        v_surplus := v_net_available - v_reg.amount_due;
        INSERT INTO public.refunds (registration_id, amount, reason, status, account_info)
        VALUES (v_reg_id, v_surplus, 'overpaid', 'pending', v_reg.refund_account_info);
      END IF;
    ELSE
      -- Full OR underpaid on expired hold: never confirm, refund p_amount (bounded by refundable)
      v_surplus := LEAST(p_amount, GREATEST(v_net_available, 0));
      IF v_surplus > 0 THEN
        INSERT INTO public.refunds (registration_id, amount, reason, status, account_info)
        VALUES (v_reg_id, v_surplus, 'late_slot_lost', 'pending', v_reg.refund_account_info);
      END IF;
    END IF;
    v_result := 'late';

  ELSIF v_reg.status = 'waitlisted' THEN
    v_surplus := LEAST(p_amount, GREATEST(v_net_available, 0));
    IF v_surplus > 0 THEN
      INSERT INTO public.refunds (registration_id, amount, reason, status, account_info)
      VALUES (v_reg_id, v_surplus, 'paid_while_waitlisted', 'pending', v_reg.refund_account_info);
    END IF;
    v_result := 'overpaid';

  ELSE
    -- cancelled or already confirmed
    v_surplus := LEAST(p_amount, GREATEST(v_net_available, 0));
    IF v_surplus > 0 THEN
      INSERT INTO public.refunds (registration_id, amount, reason, status, account_info)
      VALUES (v_reg_id, v_surplus, 'duplicate_payment', 'pending', v_reg.refund_account_info);
    END IF;
    v_result := 'overpaid';
  END IF;

  UPDATE public.payments
  SET result = v_result
  WHERE id = v_payment_id;

  -- Step 7: Recompute matches.slots_taken
  UPDATE public.matches
  SET slots_taken = (
    SELECT COALESCE(SUM(r.slots), 0)::int
    FROM public.registrations r
    WHERE r.match_id = v_match_id
      AND (r.status = 'confirmed' OR (r.status = 'pending_payment' AND r.expires_at > now()))
  )
  WHERE id = v_match_id;

  RETURN jsonb_build_object(
    'result', v_result,
    'payment_id', v_payment_id,
    'registration_id', v_reg_id
  );
END;
$$;

-- Mandatory Function Privileges
REVOKE ALL ON FUNCTION public.book_slots(uuid, text, text, int, text, inet) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_payment(text, int, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.expire_and_promote(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.book_slots(uuid, text, text, int, text, inet) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_payment(text, int, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.expire_and_promote(uuid) TO service_role;
