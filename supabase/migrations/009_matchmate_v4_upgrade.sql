-- 009_matchmate_v4_upgrade.sql
-- MatchMate v4.0 Upgrade: Scoreboard Games, Post-Match Split Bill Settlements, Club Wallet Ledger, and Host Notifications

-- 1. Extend public.matches with post-match settlement metadata
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS extras_fee_total int NOT NULL DEFAULT 0 CHECK (extras_fee_total >= 0);

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS shuttle_count int NOT NULL DEFAULT 0 CHECK (shuttle_count >= 0);

GRANT INSERT (extras_fee_total, shuttle_count) ON public.matches TO authenticated;
GRANT UPDATE (extras_fee_total, shuttle_count) ON public.matches TO authenticated;

-- 2. On-Court Mini Scoreboard: match_games
CREATE TABLE IF NOT EXISTS public.match_games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  format text NOT NULL CHECK (format IN ('singles', 'doubles')),
  team_a_players jsonb NOT NULL,
  team_b_players jsonb NOT NULL,
  sets jsonb NOT NULL DEFAULT '[]'::jsonb,
  winner text CHECK (winner IS NULL OR winner IN ('A', 'B', 'draw')),
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS match_games_match_created_idx
  ON public.match_games (match_id, created_at DESC);

ALTER TABLE public.match_games ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.match_games FROM anon, authenticated;
GRANT SELECT ON TABLE public.match_games TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.match_games TO authenticated;

DROP POLICY IF EXISTS match_games_public_select ON public.match_games;
CREATE POLICY match_games_public_select ON public.match_games
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS match_games_host_all ON public.match_games;
CREATE POLICY match_games_host_all ON public.match_games
  FOR ALL TO authenticated
  USING (public.is_match_host(match_id))
  WITH CHECK (public.is_match_host(match_id));

-- 3. Post-Match Split Bill: match_settlements
CREATE TABLE IF NOT EXISTS public.match_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  registration_id uuid NOT NULL REFERENCES public.registrations(id) ON DELETE CASCADE,
  player_name text NOT NULL,
  contact_normalized text,
  slots int NOT NULL CHECK (slots > 0),
  deposit_paid int NOT NULL DEFAULT 0,
  actual_share int NOT NULL DEFAULT 0,
  net_balance int NOT NULL DEFAULT 0,
  settlement_type text NOT NULL CHECK (settlement_type IN ('deficit', 'surplus', 'settled')),
  status text NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid', 'paid', 'credited_wallet', 'settled')),
  payment_ref text UNIQUE,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, registration_id)
);

CREATE INDEX IF NOT EXISTS match_settlements_match_idx
  ON public.match_settlements (match_id);

ALTER TABLE public.match_settlements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.match_settlements FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.match_settlements TO authenticated;

DROP POLICY IF EXISTS match_settlements_host_all ON public.match_settlements;
CREATE POLICY match_settlements_host_all ON public.match_settlements
  FOR ALL TO authenticated
  USING (public.is_match_host(match_id))
  WITH CHECK (public.is_match_host(match_id));

-- 4. Per-Player Club Wallet Ledger: club_wallet_ledger
CREATE TABLE IF NOT EXISTS public.club_wallet_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id uuid NOT NULL DEFAULT auth.uid(),
  contact_normalized text NOT NULL,
  player_name text NOT NULL,
  match_id uuid REFERENCES public.matches(id) ON DELETE SET NULL,
  settlement_id uuid REFERENCES public.match_settlements(id) ON DELETE SET NULL,
  delta_amount int NOT NULL,
  note text CHECK (note IS NULL OR char_length(note) <= 200),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS club_wallet_host_contact_idx
  ON public.club_wallet_ledger (host_id, contact_normalized, created_at DESC);

ALTER TABLE public.club_wallet_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.club_wallet_ledger FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.club_wallet_ledger TO authenticated;

DROP POLICY IF EXISTS club_wallet_host_all ON public.club_wallet_ledger;
CREATE POLICY club_wallet_host_all ON public.club_wallet_ledger
  FOR ALL TO authenticated
  USING (public.is_host() AND host_id = auth.uid())
  WITH CHECK (public.is_host() AND host_id = auth.uid());

-- 5. Host Notification Settings: host_notification_settings
CREATE TABLE IF NOT EXISTS public.host_notification_settings (
  host_id uuid PRIMARY KEY DEFAULT auth.uid(),
  telegram_enabled bool NOT NULL DEFAULT false,
  telegram_bot_token text,
  telegram_chat_id text,
  discord_enabled bool NOT NULL DEFAULT false,
  discord_webhook_url text,
  zalo_enabled bool NOT NULL DEFAULT false,
  zalo_webhook_url text,
  events jsonb NOT NULL DEFAULT '{"booking":true,"payment":true,"late_cancel":true,"refund_request":true}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.host_notification_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.host_notification_settings FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.host_notification_settings TO authenticated;

DROP POLICY IF EXISTS host_notif_host_all ON public.host_notification_settings;
CREATE POLICY host_notif_host_all ON public.host_notification_settings
  FOR ALL TO authenticated
  USING (public.is_host() AND host_id = auth.uid())
  WITH CHECK (public.is_host() AND host_id = auth.uid());
