-- 010_fix_v4_service_role_grants.sql
-- Explicitly grant service_role access to v4 tables and rate_limits, plus full authenticated DML where needed.

GRANT ALL ON TABLE
  public.match_games,
  public.match_settlements,
  public.club_wallet_ledger,
  public.host_notification_settings,
  public.rate_limits
TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.host_notification_settings,
  public.club_wallet_ledger,
  public.match_settlements
TO authenticated;

NOTIFY pgrst, 'reload schema';
