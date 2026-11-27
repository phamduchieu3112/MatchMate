-- acceptance_tests.sql
-- Run in Supabase SQL Editor to verify Section 12 SQL acceptance criteria.
-- Wrapped in BEGIN ... ROLLBACK so zero test data persists.

BEGIN;

DO $$
DECLARE
  v_host_id uuid := gen_random_uuid();
  v_other_user uuid := gen_random_uuid();
  v_match_id uuid;
  v_match2_id uuid;
  v_match3_id uuid;
  v_past_match_id uuid;
  v_reg RECORD;
  v_reg2 RECORD;
  v_reg3 RECORD;
  v_reg_late RECORD;
  v_reg_wait RECORD;
  v_res jsonb;
  v_refund_sum int;
  v_count int;
  v_err text;
BEGIN
  -- -------------------------------------------------------------------------
  -- Setup Host JWT claims and sample matches
  -- -------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', v_host_id::text,
    'role', 'authenticated',
    'app_metadata', json_build_object('role', 'host')
  )::text, true);

  INSERT INTO public.matches (
    short_code, host_id, sport, title, starts_at, location_name,
    fee_per_slot, max_slots, lock_at, cancel_cutoff_hours, hold_minutes
  ) VALUES (
    'TST001', v_host_id, 'badminton', 'Test Match 1',
    now() + interval '2 days', 'Court A',
    100000, 4, now() + interval '1 day', 12, 15
  ) RETURNING id INTO v_match_id;

  INSERT INTO public.matches (
    short_code, host_id, sport, title, starts_at, location_name,
    fee_per_slot, max_slots, lock_at, cancel_cutoff_hours, hold_minutes
  ) VALUES (
    'TST002', v_host_id, 'badminton', 'Test Match 2',
    now() + interval '3 days', 'Court B',
    100000, 4, now() + interval '2 days', 12, 15
  ) RETURNING id INTO v_match2_id;

  INSERT INTO public.matches (
    short_code, host_id, sport, title, starts_at, location_name,
    fee_per_slot, max_slots, lock_at, cancel_cutoff_hours, hold_minutes
  ) VALUES (
    'TST003', v_host_id, 'badminton', 'Test Match 3',
    now() + interval '4 days', 'Court C',
    100000, 4, now() + interval '3 days', 12, 15
  ) RETURNING id INTO v_match3_id;

  -- Past finished match (should NOT block cross-match concurrent cap #9)
  INSERT INTO public.matches (
    short_code, host_id, sport, title, starts_at, location_name,
    fee_per_slot, max_slots, lock_at, cancel_cutoff_hours, hold_minutes, status
  ) VALUES (
    'PST001', v_host_id, 'badminton', 'Past Match',
    now() - interval '2 days', 'Court Old',
    100000, 4, now() - interval '3 days', 12, 15, 'finished'
  ) RETURNING id INTO v_past_match_id;

  -- Insert an old pending_payment row in past match (does not count toward cap #9)
  INSERT INTO public.registrations (
    match_id, display_name, contact, slots, status, payment_code, amount_due, pin_hash
  ) VALUES (
    v_past_match_id, 'Old Player', '0912345678', 1, 'waitlisted', 'KEOPST001', 100000, 'hash'
  );

  -- -------------------------------------------------------------------------
  -- Criterion #1, #2, #3, #4, #5: Privilege & RLS enforcement
  -- -------------------------------------------------------------------------
  -- Check anon cannot execute privileged RPCs
  IF has_function_privilege('anon', 'public.book_slots(uuid, text, text, int, text, inet)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.apply_payment(text, int, text, jsonb)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.expire_and_promote(uuid)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.cancel_registration(uuid, text, text, text)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.get_my_registration(uuid, text)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.set_refund_account(uuid, text, text)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'FAIL #1: anon has EXECUTE on restricted RPC';
  END IF;

  -- Check anon cannot select host_id on matches, nor contact on registrations, nor request_log
  IF has_column_privilege('anon', 'public.matches', 'host_id', 'SELECT') THEN
    RAISE EXCEPTION 'FAIL #2: anon can select host_id from matches';
  END IF;
  IF has_table_privilege('anon', 'public.registrations', 'SELECT')
    OR has_table_privilege('anon', 'public.request_log', 'SELECT')
  THEN
    RAISE EXCEPTION 'FAIL #3a: anon can select registrations or request_log';
  END IF;

  -- Check authenticated (Host) cannot read access_token, pin_hash, refund_account_info
  IF has_column_privilege('authenticated', 'public.registrations', 'access_token', 'SELECT')
    OR has_column_privilege('authenticated', 'public.registrations', 'pin_hash', 'SELECT')
    OR has_column_privilege('authenticated', 'public.registrations', 'refund_account_info', 'SELECT')
  THEN
    RAISE EXCEPTION 'FAIL #3b: authenticated can select sensitive registration columns';
  END IF;

  -- Check authenticated cannot directly UPDATE registrations or matches.status
  IF has_table_privilege('authenticated', 'public.registrations', 'UPDATE')
    OR has_column_privilege('authenticated', 'public.matches', 'status', 'UPDATE')
  THEN
    RAISE EXCEPTION 'FAIL #5: authenticated has direct UPDATE on registrations or matches.status';
  END IF;

  -- Check self-registered authenticated user without host role sees 0 rows in registrations/payments
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', v_other_user::text,
    'role', 'authenticated',
    'app_metadata', json_build_object()
  )::text, true);
  SELECT COUNT(*) INTO v_count FROM public.registrations;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL #4a: non-host authenticated user saw registrations';
  END IF;
  SELECT COUNT(*) INTO v_count FROM public.payments;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'FAIL #4b: non-host authenticated user saw payments';
  END IF;
  RESET ROLE;

  -- -------------------------------------------------------------------------
  -- Criterion #9: Concurrent cap across upcoming matches (past matches ignored)
  -- -------------------------------------------------------------------------
  SELECT * INTO v_reg FROM public.book_slots(v_match_id, 'Player One', '0912345678', 1, '1234', '1.2.3.4');
  SELECT * INTO v_reg2 FROM public.book_slots(v_match2_id, 'Player One', '0912345678', 1, '1234', '5.6.7.8');

  BEGIN
    PERFORM * FROM public.book_slots(v_match3_id, 'Player One', '0912345678', 1, '1234', '9.9.9.9');
    RAISE EXCEPTION 'FAIL #9: 3rd concurrent booking should have failed with concurrent_cap';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    IF v_err <> 'concurrent_cap' THEN
      RAISE EXCEPTION 'FAIL #9: expected concurrent_cap, got %', v_err;
    END IF;
  END;

  -- -------------------------------------------------------------------------
  -- Criterion #10 & #11 & #12: Payment cases + Overpay & Cancel no double-refund
  -- -------------------------------------------------------------------------
  -- Overpay 200k on 100k slot (exact/overpaid)
  v_res := public.apply_payment('TXN_OVER_1', 200000, 'MBVCB ' || v_reg.payment_code, '{}'::jsonb);
  IF v_res ->> 'result' <> 'overpaid' THEN
    RAISE EXCEPTION 'FAIL #11 overpaid: got %', v_res;
  END IF;

  -- Duplicate transaction id -> duplicate
  v_res := public.apply_payment('TXN_OVER_1', 200000, 'MBVCB ' || v_reg.payment_code, '{}'::jsonb);
  IF v_res ->> 'result' <> 'duplicate' THEN
    RAISE EXCEPTION 'FAIL #10 duplicate: got %', v_res;
  END IF;

  -- Cancel before cutoff (#12): total refunds MUST equal 200000 (100k overpaid + 100k cancelled_in_time)
  v_res := public.cancel_registration(v_reg.id, v_reg.access_token, '1234', 'MBBank 999999');
  IF NOT (v_res ->> 'ok')::boolean THEN
    RAISE EXCEPTION 'FAIL #12 cancel failed: %', v_res;
  END IF;
  SELECT COALESCE(SUM(amount), 0)::int INTO v_refund_sum
  FROM public.refunds WHERE registration_id = v_reg.id;
  IF v_refund_sum <> 200000 THEN
    RAISE EXCEPTION 'FAIL #12 double refund check: expected 200000, got %', v_refund_sum;
  END IF;

  -- Underpaid then Exact on v_reg2
  v_res := public.apply_payment('TXN_UNDER_1', 40000, v_reg2.payment_code, '{}'::jsonb);
  IF v_res ->> 'result' <> 'underpaid' THEN
    RAISE EXCEPTION 'FAIL #11 underpaid: got %', v_res;
  END IF;
  v_res := public.apply_payment('TXN_EXACT_2', 60000, v_reg2.payment_code, '{}'::jsonb);
  IF v_res ->> 'result' <> 'exact' THEN
    RAISE EXCEPTION 'FAIL #11 exact completion: got %', v_res;
  END IF;

  -- Duplicate payment on already confirmed v_reg2 -> refund created
  v_res := public.apply_payment('TXN_DUP_PAY', 100000, v_reg2.payment_code, '{}'::jsonb);
  IF v_res ->> 'result' <> 'overpaid' THEN
    RAISE EXCEPTION 'FAIL #11 duplicate_payment: got %', v_res;
  END IF;

  -- Unmatched payment
  v_res := public.apply_payment('TXN_UNMATCHED', 50000, 'NO CODE HERE', '{}'::jsonb);
  IF v_res ->> 'result' <> 'unmatched' THEN
    RAISE EXCEPTION 'FAIL #11 unmatched: got %', v_res;
  END IF;

  -- Late payment cases on expired hold (underpaid MUST NOT confirm; valid sufficient amount confirms)
  SELECT * INTO v_reg_late FROM public.book_slots(v_match_id, 'Late Player', '0988888888', 1, '4321', '2.2.2.2');
  UPDATE public.registrations SET expires_at = now() - interval '1 minute' WHERE id = v_reg_late.id;
  PERFORM public.expire_and_promote(v_match_id);

  -- Late underpaid (50k on 100k) -> MUST NOT confirm, creates late_slot_lost refund
  v_res := public.apply_payment('TXN_LATE_UNDER', 50000, v_reg_late.payment_code, '{}'::jsonb);
  IF v_res ->> 'result' <> 'late' THEN
    RAISE EXCEPTION 'FAIL #11 late underpaid result: got %', v_res;
  END IF;
  IF (SELECT status FROM public.registrations WHERE id = v_reg_late.id) = 'confirmed' THEN
    RAISE EXCEPTION 'FAIL #11 late underpaid MUST NOT confirm';
  END IF;

  -- Late valid (sufficient amount & slot available)
  SELECT * INTO v_reg3 FROM public.book_slots(v_match_id, 'Late Valid', '0977777777', 1, '4321', '3.3.3.3');
  UPDATE public.registrations SET expires_at = now() - interval '1 minute' WHERE id = v_reg3.id;
  PERFORM public.expire_and_promote(v_match_id);
  v_res := public.apply_payment('TXN_LATE_OK', 100000, v_reg3.payment_code, '{}'::jsonb);
  IF v_res ->> 'result' <> 'late' OR (SELECT status FROM public.registrations WHERE id = v_reg3.id) <> 'confirmed' THEN
    RAISE EXCEPTION 'FAIL #11 late valid failed: %', v_res;
  END IF;

  -- Waitlisted payment -> immediately refunded with paid_while_waitlisted
  UPDATE public.matches SET max_slots = 1 WHERE id = v_match_id; -- 1 confirmed (v_reg3)
  SELECT * INTO v_reg_wait FROM public.book_slots(v_match_id, 'Wait Player', '0966666666', 1, '1111', '4.4.4.4');
  IF v_reg_wait.status <> 'waitlisted' THEN
    RAISE EXCEPTION 'FAIL #11 waitlisted setup: status=%', v_reg_wait.status;
  END IF;
  v_res := public.apply_payment('TXN_WAIT_PAY', 100000, v_reg_wait.payment_code, '{}'::jsonb);
  IF NOT EXISTS (
    SELECT 1 FROM public.refunds WHERE registration_id = v_reg_wait.id AND reason = 'paid_while_waitlisted'
  ) THEN
    RAISE EXCEPTION 'FAIL #11 paid_while_waitlisted refund missing';
  END IF;

  -- -------------------------------------------------------------------------
  -- Criterion #14: guard_match_mutations trigger rejects max_slots < active
  -- -------------------------------------------------------------------------
  BEGIN
    UPDATE public.matches SET max_slots = 0 WHERE id = v_match_id;
    RAISE EXCEPTION 'FAIL #14: guard_match_mutations should reject max_slots < active';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    IF v_err NOT IN ('max_slots_below_active_slots', 'new row for relation "matches" violates check constraint "matches_max_slots_check"') THEN
      RAISE EXCEPTION 'FAIL #14 unexpected error: %', v_err;
    END IF;
  END;

  -- -------------------------------------------------------------------------
  -- Criterion #13: Auto-lock past lock_at, Auto-finish past starts_at, post-start cancel rejected
  -- -------------------------------------------------------------------------
  UPDATE public.matches SET lock_at = now() - interval '1 minute' WHERE id = v_match2_id;
  PERFORM public.expire_and_promote(v_match2_id);
  IF (SELECT status FROM public.matches WHERE id = v_match2_id) <> 'locked' THEN
    RAISE EXCEPTION 'FAIL #13 auto-lock failed';
  END IF;

  UPDATE public.matches SET starts_at = now() - interval '1 minute' WHERE id = v_match_id;
  v_res := public.cancel_registration(v_reg3.id, v_reg3.access_token, '4321', NULL);
  IF (v_res ->> 'ok')::boolean OR v_res ->> 'error' <> 'match_started' THEN
    RAISE EXCEPTION 'FAIL #13 post-start cancel should reject: %', v_res;
  END IF;

  PERFORM public.expire_and_promote(v_match_id);
  IF (SELECT status FROM public.matches WHERE id = v_match_id) <> 'finished' THEN
    RAISE EXCEPTION 'FAIL #13 auto-finish failed';
  END IF;
  IF (SELECT status FROM public.registrations WHERE id = v_reg_wait.id) <> 'expired' THEN
    RAISE EXCEPTION 'FAIL #13 leftover waitlisted row did not expire';
  END IF;

  RAISE NOTICE 'ALL ACCEPTANCE SQL TESTS PASSED';
END;
$$;

ROLLBACK;
