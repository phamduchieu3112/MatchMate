-- 002_rls_and_grants.sql
-- MatchMate v3.1 RLS Policies, Table/Column Grants, Host Helpers, and Realtime

-- Enable RLS on ALL 7 tables
ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Revoke default DML immediately
REVOKE ALL ON TABLE
  public.matches,
  public.registrations,
  public.payments,
  public.refunds,
  public.request_log,
  public.request_idempotency,
  public.audit_log
FROM anon, authenticated;

GRANT SELECT ON TABLE public.payments, public.refunds TO authenticated;

-- Column-level grants on matches
GRANT SELECT (
  id, short_code, sport, title, starts_at, location_name, map_url,
  level, fee_per_slot, max_slots, courts, lock_at, cancel_cutoff_hours,
  hold_minutes, status, slots_taken, notes, created_at
) ON public.matches TO anon;

GRANT SELECT ON TABLE public.matches TO authenticated;
GRANT INSERT (
  short_code, sport, title, starts_at, location_name, map_url,
  level, fee_per_slot, max_slots, courts, lock_at, cancel_cutoff_hours,
  hold_minutes, notes, court_fee_total, shuttle_fee_total
) ON public.matches TO authenticated;
GRANT UPDATE (
  title, location_name, map_url, level, notes, courts,
  court_fee_total, shuttle_fee_total
) ON public.matches TO authenticated;

-- Column-level grants on registrations for authenticated
GRANT SELECT (
  id, match_id, display_name, contact, slots, status, payment_code,
  amount_due, amount_paid, payment_method, expires_at, checked_in,
  created_at, cancelled_at, promoted_at
) ON public.registrations TO authenticated;

-- Host auth helpers
CREATE OR REPLACE FUNCTION public.is_host()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions, pg_temp
AS $$
  SELECT COALESCE((auth.jwt() -> 'app_metadata' ->> 'role') = 'host', false);
$$;

CREATE OR REPLACE FUNCTION public.is_match_host(p_match_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  SELECT public.is_host()
    AND EXISTS (
      SELECT 1
      FROM public.matches
      WHERE id = p_match_id
        AND host_id = auth.uid()
    );
$$;

-- RLS Policies: matches
DROP POLICY IF EXISTS matches_anon_select ON public.matches;
CREATE POLICY matches_anon_select ON public.matches
  FOR SELECT TO anon
  USING (true);

DROP POLICY IF EXISTS matches_host_select ON public.matches;
CREATE POLICY matches_host_select ON public.matches
  FOR SELECT TO authenticated
  USING (public.is_host() AND host_id = auth.uid());

DROP POLICY IF EXISTS matches_host_insert ON public.matches;
CREATE POLICY matches_host_insert ON public.matches
  FOR INSERT TO authenticated
  WITH CHECK (public.is_host() AND host_id = auth.uid());

DROP POLICY IF EXISTS matches_host_update ON public.matches;
CREATE POLICY matches_host_update ON public.matches
  FOR UPDATE TO authenticated
  USING (public.is_host() AND host_id = auth.uid())
  WITH CHECK (public.is_host() AND host_id = auth.uid());

-- RLS Policies: registrations (FOR SELECT ONLY)
DROP POLICY IF EXISTS registrations_host_select ON public.registrations;
CREATE POLICY registrations_host_select ON public.registrations
  FOR SELECT TO authenticated
  USING (public.is_match_host(match_id));

-- RLS Policies: refunds (FOR SELECT ONLY)
DROP POLICY IF EXISTS refunds_host_select ON public.refunds;
CREATE POLICY refunds_host_select ON public.refunds
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.registrations r
      WHERE r.id = registration_id
        AND public.is_match_host(r.match_id)
    )
  );

-- RLS Policies: payments (FOR SELECT ONLY)
DROP POLICY IF EXISTS payments_host_select ON public.payments;
CREATE POLICY payments_host_select ON public.payments
  FOR SELECT TO authenticated
  USING (
    public.is_host() AND (
      registration_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.registrations r
        WHERE r.id = registration_id
          AND public.is_match_host(r.match_id)
      )
    )
  );

-- request_log, request_idempotency, audit_log: RLS enabled, NO policies (deny-all for anon/authenticated)

-- Realtime Publication (ONLY matches)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'matches'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.matches;
    END IF;
  END IF;
END;
$$;

-- Function privileges for helpers defined so far
REVOKE ALL ON FUNCTION public.is_match_host(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_host() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.normalize_contact(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.normalize_ip(inet) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.is_match_host(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_host() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.normalize_contact(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.normalize_ip(inet) TO authenticated, service_role;
