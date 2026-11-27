-- 005_read_rpcs_and_cron.sql
-- MatchMate v3.1 Read-Only Public/Player RPCs and pg_cron Schedules

-- Read-only public participants: MUST NOT call expire_and_promote and MUST NOT lock matches
CREATE OR REPLACE FUNCTION public.get_public_participants(p_match_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  WITH m AS (
    SELECT id, max_slots, status
    FROM public.matches
    WHERE id = p_match_id
  ),
  live AS (
    SELECT COALESCE(SUM(slots), 0)::int AS slots_taken
    FROM public.registrations
    WHERE match_id = p_match_id
      AND (status = 'confirmed' OR (status = 'pending_payment' AND expires_at > now()))
  ),
  roster AS (
    SELECT
      display_name,
      slots,
      status
    FROM public.registrations
    WHERE match_id = p_match_id
      AND (
        status IN ('confirmed', 'waitlisted')
        OR (status = 'pending_payment' AND expires_at > now())
      )
    ORDER BY
      CASE status
        WHEN 'confirmed' THEN 1
        WHEN 'pending_payment' THEN 2
        ELSE 3
      END,
      created_at ASC
  )
  SELECT jsonb_build_object(
    'slots_taken', COALESCE((SELECT slots_taken FROM live), 0),
    'available_slots', GREATEST(COALESCE((SELECT max_slots FROM m), 0) - COALESCE((SELECT slots_taken FROM live), 0), 0),
    'participants', COALESCE((SELECT jsonb_agg(to_jsonb(roster)) FROM roster), '[]'::jsonb)
  );
$$;

CREATE OR REPLACE FUNCTION public.get_my_registration(
  p_registration_id uuid,
  p_access_token text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_reg public.registrations%ROWTYPE;
  v_match public.matches%ROWTYPE;
  v_refund_done int;
  v_refund_pending int;
  v_refunds jsonb;
  v_effective_status text;
BEGIN
  SELECT * INTO v_reg
  FROM public.registrations
  WHERE id = p_registration_id;

  IF NOT FOUND OR v_reg.access_token IS DISTINCT FROM p_access_token THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_match
  FROM public.matches
  WHERE id = v_reg.match_id;

  SELECT
    COALESCE(SUM(amount) FILTER (WHERE status = 'done'), 0)::int,
    COALESCE(SUM(amount) FILTER (WHERE status IN ('pending', 'pending_review')), 0)::int,
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', id,
          'amount', amount,
          'reason', reason,
          'status', status,
          'note', note,
          'created_at', created_at,
          'done_at', done_at
        )
        ORDER BY created_at DESC
      ),
      '[]'::jsonb
    )
  INTO v_refund_done, v_refund_pending, v_refunds
  FROM public.refunds
  WHERE registration_id = p_registration_id;

  v_effective_status := CASE
    WHEN v_reg.status = 'pending_payment' AND v_reg.expires_at IS NOT NULL AND v_reg.expires_at <= now()
      THEN 'expired'
    ELSE v_reg.status
  END;

  RETURN jsonb_build_object(
    'id', v_reg.id,
    'match_id', v_reg.match_id,
    'display_name', v_reg.display_name,
    'slots', v_reg.slots,
    'status', v_effective_status,
    'payment_code', v_reg.payment_code,
    'amount_due', v_reg.amount_due,
    'amount_paid', v_reg.amount_paid,
    'payment_method', v_reg.payment_method,
    'expires_at', v_reg.expires_at,
    'promoted_at', v_reg.promoted_at,
    'refund_account_info', v_reg.refund_account_info,
    'refund_total_done', v_refund_done,
    'refund_total_pending', v_refund_pending,
    'net_paid', GREATEST(v_reg.amount_paid - v_refund_done - v_refund_pending, 0),
    'cancel_allowed_until', v_match.starts_at - (v_match.cancel_cutoff_hours || ' hours')::interval,
    'created_at', v_reg.created_at,
    'cancelled_at', v_reg.cancelled_at,
    'refunds', v_refunds,
    'match', jsonb_build_object(
      'short_code', v_match.short_code,
      'sport', v_match.sport,
      'title', v_match.title,
      'starts_at', v_match.starts_at,
      'location_name', v_match.location_name,
      'map_url', v_match.map_url,
      'status', v_match.status,
      'cancel_cutoff_hours', v_match.cancel_cutoff_hours
    )
  );
END;
$$;

-- Mandatory Function Privileges
REVOKE ALL ON FUNCTION public.get_my_registration(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_public_participants(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_my_registration(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_public_participants(uuid) TO anon, authenticated;

-- Scheduled pg_cron jobs (Section 4.7)
-- Requires pg_cron extension enabled via Supabase Dashboard -> Database -> Extensions
DO $$
DECLARE
  v_job_id bigint;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove existing jobs with the same names for idempotency
    FOR v_job_id IN
      SELECT jobid FROM cron.job
      WHERE jobname IN (
        'matchmate_expire_and_promote',
        'matchmate_cleanup_request_log',
        'matchmate_cleanup_idempotency',
        'matchmate_pii_retention_90d',
        'matchmate_reconcile_slots_taken'
      )
    LOOP
      PERFORM cron.unschedule(v_job_id);
    END LOOP;

    -- 1. Every minute: expire unpaid holds, auto-finish past matches, auto-lock past lock_at, promote waitlist
    PERFORM cron.schedule(
      'matchmate_expire_and_promote',
      '* * * * *',
      $cron$
      DO $do$
      DECLARE
        v_id uuid;
      BEGIN
        FOR v_id IN
          SELECT id FROM public.matches WHERE status IN ('open', 'locked')
        LOOP
          PERFORM public.expire_and_promote(v_id);
        END LOOP;
      END;
      $do$;
      $cron$
    );

    -- 2. Daily 03:00: purge request_log older than 1 day
    PERFORM cron.schedule(
      'matchmate_cleanup_request_log',
      '0 3 * * *',
      $cron$DELETE FROM public.request_log WHERE created_at < now() - interval '1 day';$cron$
    );

    -- 3. Daily 03:05: purge request_idempotency older than 1 hour
    PERFORM cron.schedule(
      'matchmate_cleanup_idempotency',
      '5 3 * * *',
      $cron$DELETE FROM public.request_idempotency WHERE created_at < now() - interval '1 hour';$cron$
    );

    -- 4. Daily 03:10: 90-day PII retention cleanup + 1 audit_log summary row
    PERFORM cron.schedule(
      'matchmate_pii_retention_90d',
      '10 3 * * *',
      $cron$
      DO $do$
      DECLARE
        v_scrubbed int;
      BEGIN
        WITH updated AS (
          UPDATE public.registrations r
          SET contact = NULL,
              refund_account_info = NULL,
              booking_ip = NULL
          FROM public.matches m
          WHERE r.match_id = m.id
            AND m.starts_at < now() - interval '90 days'
            AND (r.contact IS NOT NULL OR r.refund_account_info IS NOT NULL OR r.booking_ip IS NOT NULL)
          RETURNING r.id
        )
        SELECT COUNT(*)::int INTO v_scrubbed FROM updated;

        IF v_scrubbed > 0 THEN
          INSERT INTO public.audit_log (actor_id, actor_role, action, target_table, before, after)
          VALUES (
            NULL,
            'service_role',
            'pii_cleanup',
            'registrations',
            NULL,
            jsonb_build_object('scrubbed_rows', v_scrubbed)
          );
        END IF;
      END;
      $do$;
      $cron$
    );

    -- 5. Daily 03:15: reconcile matches.slots_taken from live source sum
    PERFORM cron.schedule(
      'matchmate_reconcile_slots_taken',
      '15 3 * * *',
      $cron$
      UPDATE public.matches m
      SET slots_taken = (
        SELECT COALESCE(SUM(r.slots), 0)::int
        FROM public.registrations r
        WHERE r.match_id = m.id
          AND (r.status = 'confirmed' OR (r.status = 'pending_payment' AND r.expires_at > now()))
      );
      $cron$
    );
  END IF;
END;
$$;
