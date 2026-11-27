-- 004_cancel_and_host_rpcs.sql
-- MatchMate v3.1 Player Cancellation, Refund Account, and Host Management RPCs

CREATE OR REPLACE FUNCTION public.cancel_registration(
  p_registration_id uuid,
  p_access_token text,
  p_pin text,
  p_refund_account_info text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_match_id uuid;
  v_match public.matches%ROWTYPE;
  v_reg public.registrations%ROWTYPE;
  v_account_info text;
  v_already_allocated int;
  v_refundable int;
  v_new_fail_count int;
  v_locked_until timestamptz;
  v_reason text;
  v_refund_status text;
BEGIN
  SELECT match_id INTO v_match_id
  FROM public.registrations
  WHERE id = p_registration_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  -- Lock matches BEFORE expire_and_promote and registrations
  SELECT * INTO v_match
  FROM public.matches
  WHERE id = v_match_id
  FOR UPDATE;

  PERFORM public.expire_and_promote(v_match_id);

  SELECT * INTO v_reg
  FROM public.registrations
  WHERE id = p_registration_id
  FOR UPDATE;

  SELECT * INTO v_match
  FROM public.matches
  WHERE id = v_match_id;

  IF v_reg.access_token IS DISTINCT FROM p_access_token THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  IF v_reg.pin_locked_until IS NOT NULL AND v_reg.pin_locked_until > now() THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'pin_locked',
      'pin_locked_until', v_reg.pin_locked_until
    );
  END IF;

  IF COALESCE(p_pin, '') !~ '^[0-9]{4}$'
    OR extensions.crypt(p_pin, v_reg.pin_hash) IS DISTINCT FROM v_reg.pin_hash
  THEN
    v_new_fail_count := v_reg.pin_fail_count + 1;
    IF v_new_fail_count >= 5 THEN
      v_locked_until := now() + LEAST(
        interval '15 minutes' * power(2, GREATEST(v_new_fail_count - 5, 0)),
        interval '24 hours'
      );
    ELSE
      v_locked_until := NULL;
    END IF;

    UPDATE public.registrations
    SET pin_fail_count = v_new_fail_count,
        pin_locked_until = v_locked_until
    WHERE id = p_registration_id;

    RETURN jsonb_build_object(
      'ok', false,
      'error', CASE WHEN v_locked_until IS NOT NULL THEN 'pin_locked' ELSE 'invalid_pin' END,
      'pin_fail_count', v_new_fail_count,
      'pin_locked_until', v_locked_until
    );
  END IF;

  IF now() >= v_match.starts_at THEN
    RETURN jsonb_build_object('ok', false, 'error', 'match_started');
  END IF;

  IF v_reg.status IN ('cancelled', 'expired') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_closed');
  END IF;

  -- Save refund_account_info FIRST so newly created refund rows inherit it immediately
  v_account_info := COALESCE(
    NULLIF(trim(COALESCE(p_refund_account_info, '')), ''),
    v_reg.refund_account_info
  );

  IF v_account_info IS NOT NULL AND char_length(v_account_info) > 200 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_refund_account');
  END IF;

  UPDATE public.registrations
  SET refund_account_info = v_account_info,
      status = 'cancelled',
      expires_at = NULL,
      cancelled_at = now(),
      pin_fail_count = 0,
      pin_locked_until = NULL
  WHERE id = p_registration_id;

  -- Update any existing pending/pending_review refunds with new account info too
  IF v_account_info IS NOT NULL THEN
    UPDATE public.refunds
    SET account_info = v_account_info
    WHERE registration_id = p_registration_id
      AND status IN ('pending', 'pending_review');
  END IF;

  SELECT COALESCE(SUM(amount), 0)::int
  INTO v_already_allocated
  FROM public.refunds
  WHERE registration_id = p_registration_id
    AND status IN ('pending', 'pending_review', 'done');

  v_refundable := GREATEST(v_reg.amount_paid - v_already_allocated, 0);

  IF v_refundable > 0 THEN
    IF v_reg.status = 'pending_payment'
      OR v_reg.status = 'waitlisted'
      OR (v_reg.status = 'confirmed' AND now() <= v_match.starts_at - (v_match.cancel_cutoff_hours || ' hours')::interval)
    THEN
      v_reason := 'cancelled_in_time';
      v_refund_status := 'pending';
    ELSE
      v_reason := 'resold_after_cutoff';
      v_refund_status := 'pending_review';
    END IF;

    INSERT INTO public.refunds (registration_id, amount, reason, status, account_info)
    VALUES (p_registration_id, v_refundable, v_reason, v_refund_status, v_account_info);
  END IF;

  PERFORM public.expire_and_promote(v_match_id);

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'cancelled',
    'refund_amount', v_refundable
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_refund_account(
  p_registration_id uuid,
  p_access_token text,
  p_account_info text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_clean text;
  v_reg public.registrations%ROWTYPE;
BEGIN
  v_clean := trim(regexp_replace(COALESCE(p_account_info, ''), '[' || chr(8237) || chr(8238) || ']', '', 'g'));
  IF v_clean = '' OR char_length(v_clean) > 200 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_refund_account');
  END IF;

  SELECT * INTO v_reg
  FROM public.registrations
  WHERE id = p_registration_id
  FOR UPDATE;

  IF NOT FOUND OR v_reg.access_token IS DISTINCT FROM p_access_token THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  UPDATE public.registrations
  SET refund_account_info = v_clean
  WHERE id = p_registration_id;

  UPDATE public.refunds
  SET account_info = v_clean
  WHERE registration_id = p_registration_id
    AND status IN ('pending', 'pending_review');

  RETURN jsonb_build_object('ok', true, 'refund_account_info', v_clean);
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_unmatched_payment(
  p_payment_id uuid,
  p_registration_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_reg public.registrations%ROWTYPE;
  v_match public.matches%ROWTYPE;
  v_already_allocated int;
  v_net_available int;
  v_occupied int;
  v_result text;
  v_surplus int;
  v_old_status text;
  v_old_paid int;
BEGIN
  SELECT * INTO v_reg
  FROM public.registrations
  WHERE id = p_registration_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'registration_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.is_match_host(v_reg.match_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_match
  FROM public.matches
  WHERE id = v_reg.match_id
  FOR UPDATE;

  PERFORM public.expire_and_promote(v_reg.match_id);

  SELECT * INTO v_reg
  FROM public.registrations
  WHERE id = p_registration_id
  FOR UPDATE;

  SELECT * INTO v_payment
  FROM public.payments
  WHERE id = p_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'payment_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF v_payment.registration_id IS NOT NULL OR v_payment.result <> 'unmatched' THEN
    RAISE EXCEPTION 'payment_already_assigned' USING ERRCODE = 'P0001';
  END IF;

  v_old_status := v_reg.status;
  v_old_paid := v_reg.amount_paid;

  UPDATE public.registrations
  SET amount_paid = amount_paid + v_payment.amount,
      payment_method = 'sepay'
  WHERE id = p_registration_id
  RETURNING * INTO v_reg;

  UPDATE public.payments
  SET registration_id = p_registration_id
  WHERE id = p_payment_id;

  SELECT COALESCE(SUM(rf.amount), 0)::int
  INTO v_already_allocated
  FROM public.refunds rf
  WHERE rf.registration_id = p_registration_id
    AND rf.status IN ('pending', 'pending_review', 'done');

  v_net_available := v_reg.amount_paid - v_already_allocated;

  IF v_reg.status = 'pending_payment' THEN
    IF v_net_available = v_reg.amount_due THEN
      UPDATE public.registrations SET status = 'confirmed', expires_at = NULL WHERE id = p_registration_id;
      v_result := 'exact';
    ELSIF v_net_available < v_reg.amount_due THEN
      v_result := 'underpaid';
    ELSE
      v_surplus := v_net_available - v_reg.amount_due;
      UPDATE public.registrations SET status = 'confirmed', expires_at = NULL WHERE id = p_registration_id;
      INSERT INTO public.refunds (registration_id, amount, reason, status, account_info)
      VALUES (p_registration_id, v_surplus, 'overpaid', 'pending', v_reg.refund_account_info);
      v_result := 'overpaid';
    END IF;
  ELSIF v_reg.status = 'expired' THEN
    SELECT COALESCE(SUM(r.slots), 0)::int
    INTO v_occupied
    FROM public.registrations r
    WHERE r.match_id = v_reg.match_id
      AND (r.status = 'confirmed' OR (r.status = 'pending_payment' AND r.expires_at > now()));

    SELECT * INTO v_match FROM public.matches WHERE id = v_reg.match_id;

    IF v_match.status IN ('open', 'locked')
      AND now() < v_match.starts_at
      AND (v_occupied + v_reg.slots) <= v_match.max_slots
      AND v_net_available >= v_reg.amount_due
    THEN
      UPDATE public.registrations SET status = 'confirmed', expires_at = NULL WHERE id = p_registration_id;
      IF v_net_available > v_reg.amount_due THEN
        v_surplus := v_net_available - v_reg.amount_due;
        INSERT INTO public.refunds (registration_id, amount, reason, status, account_info)
        VALUES (p_registration_id, v_surplus, 'overpaid', 'pending', v_reg.refund_account_info);
      END IF;
    ELSE
      v_surplus := LEAST(v_payment.amount, GREATEST(v_net_available, 0));
      IF v_surplus > 0 THEN
        INSERT INTO public.refunds (registration_id, amount, reason, status, account_info)
        VALUES (p_registration_id, v_surplus, 'late_slot_lost', 'pending', v_reg.refund_account_info);
      END IF;
    END IF;
    v_result := 'late';
  ELSIF v_reg.status = 'waitlisted' THEN
    v_surplus := LEAST(v_payment.amount, GREATEST(v_net_available, 0));
    IF v_surplus > 0 THEN
      INSERT INTO public.refunds (registration_id, amount, reason, status, account_info)
      VALUES (p_registration_id, v_surplus, 'paid_while_waitlisted', 'pending', v_reg.refund_account_info);
    END IF;
    v_result := 'overpaid';
  ELSE
    v_surplus := LEAST(v_payment.amount, GREATEST(v_net_available, 0));
    IF v_surplus > 0 THEN
      INSERT INTO public.refunds (registration_id, amount, reason, status, account_info)
      VALUES (p_registration_id, v_surplus, 'duplicate_payment', 'pending', v_reg.refund_account_info);
    END IF;
    v_result := 'overpaid';
  END IF;

  UPDATE public.payments SET result = v_result WHERE id = p_payment_id;

  UPDATE public.matches
  SET slots_taken = (
    SELECT COALESCE(SUM(r.slots), 0)::int
    FROM public.registrations r
    WHERE r.match_id = v_reg.match_id
      AND (r.status = 'confirmed' OR (r.status = 'pending_payment' AND r.expires_at > now()))
  )
  WHERE id = v_reg.match_id;

  INSERT INTO public.audit_log (actor_id, actor_role, action, target_table, target_id, before, after)
  VALUES (
    auth.uid(),
    'host',
    'payment_assigned',
    'payments',
    p_payment_id,
    jsonb_build_object('registration_status', v_old_status, 'amount_paid', v_old_paid, 'payment_result', 'unmatched'),
    jsonb_build_object('registration_id', p_registration_id, 'amount_paid', v_reg.amount_paid, 'payment_result', v_result)
  );

  RETURN jsonb_build_object('ok', true, 'result', v_result);
END;
$$;

CREATE OR REPLACE FUNCTION public.host_cancel_match(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_match public.matches%ROWTYPE;
  v_reg RECORD;
  v_already_allocated int;
  v_refundable int;
  v_cancelled_count int := 0;
BEGIN
  IF NOT public.is_match_host(p_match_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_match
  FROM public.matches
  WHERE id = p_match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF v_match.status NOT IN ('open', 'locked') OR now() >= v_match.starts_at THEN
    RAISE EXCEPTION 'match_cannot_be_cancelled' USING ERRCODE = 'P0001';
  END IF;

  FOR v_reg IN
    SELECT *
    FROM public.registrations
    WHERE match_id = p_match_id
      AND status IN ('confirmed', 'pending_payment', 'waitlisted')
    FOR UPDATE
  LOOP
    UPDATE public.registrations
    SET status = 'cancelled',
        expires_at = NULL,
        cancelled_at = now()
    WHERE id = v_reg.id;

    v_cancelled_count := v_cancelled_count + 1;

    SELECT COALESCE(SUM(rf.amount), 0)::int
    INTO v_already_allocated
    FROM public.refunds rf
    WHERE rf.registration_id = v_reg.id
      AND rf.status IN ('pending', 'pending_review', 'done');

    v_refundable := GREATEST(v_reg.amount_paid - v_already_allocated, 0);

    IF v_refundable > 0 THEN
      IF v_reg.payment_method = 'cash' THEN
        INSERT INTO public.refunds (registration_id, amount, reason, status, account_info, note)
        VALUES (v_reg.id, v_refundable, 'host_cancelled', 'pending_review', v_reg.refund_account_info, 'Cash payment — refund in person');
      ELSE
        INSERT INTO public.refunds (registration_id, amount, reason, status, account_info)
        VALUES (v_reg.id, v_refundable, 'host_cancelled', 'pending', v_reg.refund_account_info);
      END IF;
    END IF;
  END LOOP;

  UPDATE public.matches
  SET status = 'cancelled',
      slots_taken = 0
  WHERE id = p_match_id;

  INSERT INTO public.audit_log (actor_id, actor_role, action, target_table, target_id, before, after)
  VALUES (
    auth.uid(),
    'host',
    'match_cancelled',
    'matches',
    p_match_id,
    jsonb_build_object('status', v_match.status, 'slots_taken', v_match.slots_taken),
    jsonb_build_object('status', 'cancelled', 'slots_taken', 0, 'cancelled_registrations', v_cancelled_count)
  );

  RETURN jsonb_build_object('ok', true, 'cancelled_registrations', v_cancelled_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.host_lock_match(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_match public.matches%ROWTYPE;
BEGIN
  IF NOT public.is_match_host(p_match_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_match
  FROM public.matches
  WHERE id = p_match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF v_match.status <> 'open' THEN
    RAISE EXCEPTION 'match_not_open' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.matches
  SET status = 'locked'
  WHERE id = p_match_id;

  INSERT INTO public.audit_log (actor_id, actor_role, action, target_table, target_id, before, after)
  VALUES (
    auth.uid(),
    'host',
    'match_locked',
    'matches',
    p_match_id,
    jsonb_build_object('status', v_match.status),
    jsonb_build_object('status', 'locked')
  );

  RETURN jsonb_build_object('ok', true, 'status', 'locked');
END;
$$;

CREATE OR REPLACE FUNCTION public.host_mark_cash_paid(p_registration_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_reg public.registrations%ROWTYPE;
  v_match public.matches%ROWTYPE;
  v_already_allocated int;
  v_net_paid int;
  v_remaining int;
BEGIN
  SELECT * INTO v_reg
  FROM public.registrations
  WHERE id = p_registration_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'registration_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.is_match_host(v_reg.match_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_match
  FROM public.matches
  WHERE id = v_reg.match_id
  FOR UPDATE;

  PERFORM public.expire_and_promote(v_reg.match_id);

  SELECT * INTO v_reg
  FROM public.registrations
  WHERE id = p_registration_id
  FOR UPDATE;

  IF v_reg.status NOT IN ('pending_payment', 'confirmed') THEN
    RAISE EXCEPTION 'invalid_registration_status' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(SUM(rf.amount), 0)::int
  INTO v_already_allocated
  FROM public.refunds rf
  WHERE rf.registration_id = p_registration_id
    AND rf.status IN ('pending', 'pending_review', 'done');

  v_net_paid := v_reg.amount_paid - v_already_allocated;
  v_remaining := GREATEST(v_reg.amount_due - v_net_paid, 0);

  IF v_remaining > 0 THEN
    INSERT INTO public.payments (sepay_transaction_id, registration_id, amount, content, result)
    VALUES (NULL, p_registration_id, v_remaining, 'CASH', 'exact');
  END IF;

  UPDATE public.registrations
  SET amount_paid = amount_paid + v_remaining,
      payment_method = CASE WHEN payment_method = 'sepay' THEN 'sepay' ELSE 'cash' END,
      status = 'confirmed',
      expires_at = NULL
  WHERE id = p_registration_id;

  UPDATE public.matches
  SET slots_taken = (
    SELECT COALESCE(SUM(r.slots), 0)::int
    FROM public.registrations r
    WHERE r.match_id = v_reg.match_id
      AND (r.status = 'confirmed' OR (r.status = 'pending_payment' AND r.expires_at > now()))
  )
  WHERE id = v_reg.match_id;

  INSERT INTO public.audit_log (actor_id, actor_role, action, target_table, target_id, before, after)
  VALUES (
    auth.uid(),
    'host',
    'cash_payment',
    'registrations',
    p_registration_id,
    jsonb_build_object('status', v_reg.status, 'amount_paid', v_reg.amount_paid),
    jsonb_build_object('status', 'confirmed', 'amount_paid', v_reg.amount_paid + v_remaining, 'cash_added', v_remaining)
  );

  RETURN jsonb_build_object('ok', true, 'cash_added', v_remaining);
END;
$$;

CREATE OR REPLACE FUNCTION public.host_remove_registration(
  p_registration_id uuid,
  p_no_refund_override bool
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_reg public.registrations%ROWTYPE;
  v_match public.matches%ROWTYPE;
  v_already_allocated int;
  v_refundable int;
  v_refund_created int := 0;
BEGIN
  SELECT * INTO v_reg
  FROM public.registrations
  WHERE id = p_registration_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'registration_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.is_match_host(v_reg.match_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_match
  FROM public.matches
  WHERE id = v_reg.match_id
  FOR UPDATE;

  SELECT * INTO v_reg
  FROM public.registrations
  WHERE id = p_registration_id
  FOR UPDATE;

  IF v_reg.status IN ('cancelled', 'expired') THEN
    RAISE EXCEPTION 'already_closed' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(SUM(rf.amount), 0)::int
  INTO v_already_allocated
  FROM public.refunds rf
  WHERE rf.registration_id = p_registration_id
    AND rf.status IN ('pending', 'pending_review', 'done');

  v_refundable := GREATEST(v_reg.amount_paid - v_already_allocated, 0);

  UPDATE public.registrations
  SET status = 'cancelled',
      expires_at = NULL,
      cancelled_at = now()
  WHERE id = p_registration_id;

  IF v_refundable > 0 AND NOT COALESCE(p_no_refund_override, false) THEN
    INSERT INTO public.refunds (registration_id, amount, reason, status, account_info, note)
    VALUES (
      p_registration_id,
      v_refundable,
      'host_cancelled',
      'pending_review',
      v_reg.refund_account_info,
      CASE WHEN v_reg.payment_method = 'cash' THEN 'Cash payment — refund in person' ELSE 'Removed by host' END
    );
    v_refund_created := v_refundable;
  END IF;

  PERFORM public.expire_and_promote(v_reg.match_id);

  INSERT INTO public.audit_log (actor_id, actor_role, action, target_table, target_id, before, after)
  VALUES (
    auth.uid(),
    'host',
    'player_removed',
    'registrations',
    p_registration_id,
    jsonb_build_object('status', v_reg.status, 'amount_paid', v_reg.amount_paid),
    jsonb_build_object('status', 'cancelled', 'no_refund_override', COALESCE(p_no_refund_override, false), 'refund_created', v_refund_created)
  );

  RETURN jsonb_build_object('ok', true, 'refund_created', v_refund_created);
END;
$$;

CREATE OR REPLACE FUNCTION public.host_mark_refund_done(
  p_refund_id uuid,
  p_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_refund public.refunds%ROWTYPE;
  v_reg public.registrations%ROWTYPE;
  v_match public.matches%ROWTYPE;
  v_clean_note text;
BEGIN
  v_clean_note := trim(COALESCE(p_note, ''));
  IF v_clean_note = '' OR char_length(v_clean_note) > 200 THEN
    RAISE EXCEPTION 'note_required' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_refund
  FROM public.refunds
  WHERE id = p_refund_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'refund_not_found' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_reg
  FROM public.registrations
  WHERE id = v_refund.registration_id;

  IF NOT public.is_match_host(v_reg.match_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_match
  FROM public.matches
  WHERE id = v_reg.match_id
  FOR UPDATE;

  SELECT * INTO v_refund
  FROM public.refunds
  WHERE id = p_refund_id
  FOR UPDATE;

  IF v_refund.status <> 'pending' THEN
    RAISE EXCEPTION 'refund_not_pending' USING ERRCODE = 'P0001';
  END IF;

  -- Block cancelled_in_time rows older than starts_at + 24h without escalation tag
  IF v_refund.reason = 'cancelled_in_time'
    AND now() > (v_match.starts_at + interval '24 hours')
    AND position('[ESCALATED]' IN upper(v_clean_note)) = 0
  THEN
    RAISE EXCEPTION 'refund_sla_escalation_required' USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.refunds
  SET status = 'done',
      done_at = now(),
      note = v_clean_note
  WHERE id = p_refund_id;

  INSERT INTO public.audit_log (actor_id, actor_role, action, target_table, target_id, before, after)
  VALUES (
    auth.uid(),
    'host',
    'refund_done',
    'refunds',
    p_refund_id,
    jsonb_build_object('status', v_refund.status, 'amount', v_refund.amount),
    jsonb_build_object('status', 'done', 'amount', v_refund.amount, 'has_note', true)
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.host_review_refund(
  p_refund_id uuid,
  p_approve bool,
  p_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_refund public.refunds%ROWTYPE;
  v_reg public.registrations%ROWTYPE;
  v_clean_note text;
  v_next_status text;
BEGIN
  v_clean_note := NULLIF(trim(COALESCE(p_note, '')), '');
  IF v_clean_note IS NOT NULL AND char_length(v_clean_note) > 200 THEN
    RAISE EXCEPTION 'note_too_long' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_refund
  FROM public.refunds
  WHERE id = p_refund_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'refund_not_found' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_reg
  FROM public.registrations
  WHERE id = v_refund.registration_id;

  IF NOT public.is_match_host(v_reg.match_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_refund
  FROM public.refunds
  WHERE id = p_refund_id
  FOR UPDATE;

  IF v_refund.status <> 'pending_review' THEN
    RAISE EXCEPTION 'refund_not_pending_review' USING ERRCODE = 'P0001';
  END IF;

  v_next_status := CASE WHEN COALESCE(p_approve, false) THEN 'pending' ELSE 'rejected' END;

  UPDATE public.refunds
  SET status = v_next_status,
      note = COALESCE(v_clean_note, note)
  WHERE id = p_refund_id;

  INSERT INTO public.audit_log (actor_id, actor_role, action, target_table, target_id, before, after)
  VALUES (
    auth.uid(),
    'host',
    'refund_reviewed',
    'refunds',
    p_refund_id,
    jsonb_build_object('status', v_refund.status, 'amount', v_refund.amount),
    jsonb_build_object('status', v_next_status, 'amount', v_refund.amount)
  );

  RETURN jsonb_build_object('ok', true, 'status', v_next_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.host_toggle_checkin(p_registration_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_reg public.registrations%ROWTYPE;
BEGIN
  SELECT * INTO v_reg
  FROM public.registrations
  WHERE id = p_registration_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'registration_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.is_match_host(v_reg.match_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.registrations
  SET checked_in = NOT checked_in
  WHERE id = p_registration_id
  RETURNING * INTO v_reg;

  RETURN jsonb_build_object('ok', true, 'checked_in', v_reg.checked_in);
END;
$$;

CREATE OR REPLACE FUNCTION public.host_promote_waitlist(p_registration_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_reg public.registrations%ROWTYPE;
  v_match public.matches%ROWTYPE;
  v_occupied int;
  v_hold_interval interval;
  v_expires_at timestamptz;
BEGIN
  SELECT * INTO v_reg
  FROM public.registrations
  WHERE id = p_registration_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'registration_not_found' USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.is_match_host(v_reg.match_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_match
  FROM public.matches
  WHERE id = v_reg.match_id
  FOR UPDATE;

  PERFORM public.expire_and_promote(v_reg.match_id);

  SELECT * INTO v_reg
  FROM public.registrations
  WHERE id = p_registration_id
  FOR UPDATE;

  SELECT * INTO v_match
  FROM public.matches
  WHERE id = v_reg.match_id;

  IF v_reg.status <> 'waitlisted' THEN
    RAISE EXCEPTION 'not_waitlisted' USING ERRCODE = 'P0001';
  END IF;

  IF v_match.status NOT IN ('open', 'locked') OR now() >= v_match.starts_at THEN
    RAISE EXCEPTION 'match_not_promotable' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(SUM(r.slots), 0)::int
  INTO v_occupied
  FROM public.registrations r
  WHERE r.match_id = v_reg.match_id
    AND (r.status = 'confirmed' OR (r.status = 'pending_payment' AND r.expires_at > now()));

  IF (v_occupied + v_reg.slots) > v_match.max_slots THEN
    RAISE EXCEPTION 'not_enough_slots' USING ERRCODE = 'P0001';
  END IF;

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
  WHERE id = p_registration_id;

  UPDATE public.matches
  SET slots_taken = (
    SELECT COALESCE(SUM(r.slots), 0)::int
    FROM public.registrations r
    WHERE r.match_id = v_reg.match_id
      AND (r.status = 'confirmed' OR (r.status = 'pending_payment' AND r.expires_at > now()))
  )
  WHERE id = v_reg.match_id;

  RETURN jsonb_build_object('ok', true, 'expires_at', v_expires_at);
END;
$$;

-- Mandatory Function Privileges
REVOKE ALL ON FUNCTION public.set_refund_account(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_registration(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_unmatched_payment(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.host_cancel_match(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.host_lock_match(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.host_mark_cash_paid(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.host_remove_registration(uuid, bool) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.host_mark_refund_done(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.host_review_refund(uuid, bool, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.host_toggle_checkin(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.host_promote_waitlist(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.set_refund_account(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_registration(uuid, text, text, text) TO service_role;

GRANT EXECUTE ON FUNCTION public.assign_unmatched_payment(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.host_cancel_match(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.host_lock_match(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.host_mark_cash_paid(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.host_remove_registration(uuid, bool) TO authenticated;
GRANT EXECUTE ON FUNCTION public.host_mark_refund_done(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.host_review_refund(uuid, bool, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.host_toggle_checkin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.host_promote_waitlist(uuid) TO authenticated;
