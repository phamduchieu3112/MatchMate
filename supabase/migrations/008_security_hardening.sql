-- 008_security_hardening.sql
-- MatchMate Security Hardening: Atomic Match Deletion, Atomic Rate Limiter, and Match Timestamp Constraint

-- 1. Extend audit_log action CHECK constraint to include 'match_deleted'
ALTER TABLE public.audit_log
  DROP CONSTRAINT IF EXISTS audit_log_action_check;

ALTER TABLE public.audit_log
  ADD CONSTRAINT audit_log_action_check CHECK (
    action IN (
      'refund_done',
      'refund_reviewed',
      'cash_payment',
      'player_removed',
      'match_cancelled',
      'match_deleted',
      'payment_assigned',
      'match_locked',
      'pii_cleanup'
    )
  );

-- 2. Enforce lock_at <= starts_at on public.matches (NOT VALID for safe migration of historical rows)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'matches_lock_at_check'
      AND conrelid = 'public.matches'::regclass
  ) THEN
    ALTER TABLE public.matches
      ADD CONSTRAINT matches_lock_at_check CHECK (lock_at <= starts_at) NOT VALID;
  END IF;
END;
$$;

-- 3. Atomic host_delete_match(p_match_id uuid) RPC with audit logging
CREATE OR REPLACE FUNCTION public.host_delete_match(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_match public.matches%ROWTYPE;
  v_reg_ids uuid[];
  v_reg_count int;
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

  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[])
  INTO v_reg_ids
  FROM public.registrations
  WHERE match_id = p_match_id;

  v_reg_count := COALESCE(array_length(v_reg_ids, 1), 0);

  IF v_reg_count > 0 THEN
    DELETE FROM public.refunds WHERE registration_id = ANY(v_reg_ids);
    DELETE FROM public.payments WHERE registration_id = ANY(v_reg_ids);
    DELETE FROM public.request_idempotency WHERE registration_id = ANY(v_reg_ids);
    DELETE FROM public.registrations WHERE match_id = p_match_id;
  END IF;

  DELETE FROM public.matches WHERE id = p_match_id;

  INSERT INTO public.audit_log (actor_id, actor_role, action, target_table, target_id, before, after)
  VALUES (
    auth.uid(),
    'host',
    'match_deleted',
    'matches',
    p_match_id,
    jsonb_build_object(
      'short_code', v_match.short_code,
      'title', v_match.title,
      'status', v_match.status,
      'registrations_deleted', v_reg_count
    ),
    jsonb_build_object('deleted', true)
  );

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.host_delete_match(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.host_delete_match(uuid) TO authenticated;

-- 4. Atomic rate_limits table & check_rate_limit RPC
CREATE TABLE IF NOT EXISTS public.rate_limits (
  key text PRIMARY KEY,
  count int NOT NULL DEFAULT 1,
  window_start timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rate_limits_window_start_idx
  ON public.rate_limits (window_start);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.rate_limits FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key text,
  p_limit int,
  p_window_seconds int
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_now timestamptz := now();
  v_window interval;
  v_count int;
BEGIN
  IF p_key IS NULL OR char_length(trim(p_key)) = 0 OR char_length(p_key) > 256 THEN
    RAISE EXCEPTION 'invalid_rate_limit_key' USING ERRCODE = 'P0001';
  END IF;

  IF p_limit IS NULL OR p_limit < 1 OR p_window_seconds IS NULL OR p_window_seconds < 1 THEN
    RAISE EXCEPTION 'invalid_rate_limit_params' USING ERRCODE = 'P0001';
  END IF;

  v_window := (p_window_seconds || ' seconds')::interval;

  INSERT INTO public.rate_limits (key, count, window_start)
  VALUES (p_key, 1, v_now)
  ON CONFLICT (key) DO UPDATE
  SET
    count = CASE
      WHEN public.rate_limits.window_start + v_window <= v_now THEN 1
      ELSE LEAST(public.rate_limits.count + 1, p_limit + 1)
    END,
    window_start = CASE
      WHEN public.rate_limits.window_start + v_window <= v_now THEN v_now
      ELSE public.rate_limits.window_start
    END
  RETURNING count INTO v_count;

  RETURN v_count <= p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.check_rate_limit(text, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, int, int) TO service_role;

-- 5. Scheduled pg_cron cleanup for expired rate_limits rows (daily 03:20)
DO $$
DECLARE
  v_job_id bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    FOR v_job_id IN
      SELECT jobid FROM cron.job
      WHERE jobname = 'matchmate_cleanup_rate_limits'
    LOOP
      PERFORM cron.unschedule(v_job_id);
    END LOOP;

    PERFORM cron.schedule(
      'matchmate_cleanup_rate_limits',
      '20 3 * * *',
      $cron$DELETE FROM public.rate_limits WHERE window_start < now() - interval '1 day';$cron$
    );
  END IF;
END;
$$;
