-- 011_gender_split_bill.sql
-- Per-slot gender array on registrations & configurable male/female surcharge (%) on matches

ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS slot_genders jsonb DEFAULT NULL;

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS male_surcharge_percent integer NOT NULL DEFAULT 0
  CHECK (male_surcharge_percent >= 0 AND male_surcharge_percent <= 200);

GRANT SELECT (male_surcharge_percent) ON public.matches TO anon, authenticated;
GRANT INSERT (male_surcharge_percent), UPDATE (male_surcharge_percent) ON public.matches TO authenticated;

GRANT SELECT (slot_genders), INSERT (slot_genders), UPDATE (slot_genders) ON public.registrations TO authenticated;

DROP POLICY IF EXISTS registrations_host_update ON public.registrations;
CREATE POLICY registrations_host_update ON public.registrations
  FOR UPDATE TO authenticated
  USING (public.is_match_host(match_id))
  WITH CHECK (public.is_match_host(match_id));

GRANT ALL ON TABLE
  public.matches,
  public.registrations,
  public.match_settlements,
  public.club_wallet_ledger
TO service_role;

NOTIFY pgrst, 'reload schema';
