export type MatchStatus = 'open' | 'locked' | 'cancelled' | 'finished';
export type SlotGender = 'male' | 'female';
export type RegistrationStatus =
  | 'pending_payment'
  | 'confirmed'
  | 'waitlisted'
  | 'expired'
  | 'cancelled';

export interface PublicMatch {
  id: string;
  short_code: string;
  sport: string;
  title: string;
  starts_at: string;
  location_name: string;
  map_url: string | null;
  level: string | null;
  fee_per_slot: number;
  max_slots: number;
  courts: number | null;
  court_numbers?: string | null;
  lock_at: string;
  cancel_cutoff_hours: number;
  hold_minutes: number;
  status: MatchStatus;
  slots_taken: number;
  notes: string | null;
  created_at: string;
  male_surcharge_percent?: number;
}

export interface PublicParticipant {
  display_name: string;
  slots: number;
  status: 'confirmed' | 'pending_payment' | 'waitlisted';
}

export interface PublicParticipantsPayload {
  slots_taken: number;
  available_slots: number;
  participants: PublicParticipant[];
}

export interface RefundItem {
  id: string;
  amount: number;
  reason: string;
  status: 'pending_review' | 'pending' | 'done' | 'rejected';
  note: string | null;
  created_at: string;
  done_at: string | null;
}

export interface MyRegistrationPayload {
  id: string;
  match_id: string;
  display_name: string;
  slots: number;
  status: RegistrationStatus;
  payment_code: string;
  amount_due: number;
  amount_paid: number;
  payment_method: 'sepay' | 'cash' | 'none';
  expires_at: string | null;
  promoted_at: string | null;
  refund_account_info: string | null;
  refund_total_done: number;
  refund_total_pending: number;
  net_paid: number;
  cancel_allowed_until: string;
  created_at: string;
  cancelled_at: string | null;
  refunds: RefundItem[];
  qr_url?: string | null;
  transfer_content?: string;
  payment_info?: {
    bankCode: string;
    accountNumber: string;
    accountName: string;
    transferPrefix: string;
    isFallback: boolean;
  } | null;
  amount_remaining?: number;
  match: {
    short_code: string;
    sport: string;
    title: string;
    starts_at: string;
    location_name: string;
    map_url: string | null;
    status: MatchStatus;
    cancel_cutoff_hours: number;
    notes?: string | null;
  };
}

export interface StoredBookingRef {
  matchId: string;
  registrationId: string;
  shortCode: string;
}

export interface ScorePlayerRef {
  key: string;
  name: string;
  registrationId?: string;
}

export interface SetScore {
  a: number;
  b: number;
}

export type GameFormat = 'singles' | 'doubles';
export type GameWinner = 'A' | 'B' | 'draw' | null;
export type GameStatus = 'in_progress' | 'completed';

export interface MatchGameRecord {
  id: string;
  match_id: string;
  format: GameFormat;
  team_a_players: ScorePlayerRef[];
  team_b_players: ScorePlayerRef[];
  sets: SetScore[];
  winner: GameWinner;
  status: GameStatus;
  created_at: string;
  completed_at: string | null;
}

export interface PlayerLeaderboardRow {
  key: string;
  name: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  pointsFor: number;
  pointsAgainst: number;
  pointDiff: number;
  isMvp: boolean;
}

export type SettlementType = 'deficit' | 'surplus' | 'settled';
export type SettlementStatus = 'unpaid' | 'paid' | 'credited_wallet' | 'settled';

export interface MatchSettlementRow {
  id: string;
  match_id: string;
  registration_id: string;
  player_name: string;
  contact_normalized: string | null;
  slots: number;
  deposit_paid: number;
  actual_share: number;
  net_balance: number;
  settlement_type: SettlementType;
  status: SettlementStatus;
  payment_ref: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
  qr_url?: string | null;
  transfer_content?: string | null;
}

export interface ClubWalletEntry {
  id: string;
  host_id?: string;
  contact_normalized: string;
  player_name: string;
  match_id: string | null;
  settlement_id: string | null;
  delta_amount: number;
  note: string | null;
  created_at: string;
}

export interface ClubWalletSummary {
  contact_normalized: string;
  player_name: string;
  balance: number;
  last_updated: string;
}

export type NotificationEventType =
  | 'booking'
  | 'payment'
  | 'late_cancel'
  | 'refund_request';

export interface NotificationEventToggles {
  booking: boolean;
  payment: boolean;
  late_cancel: boolean;
  refund_request: boolean;
}

export interface HostNotificationSettingsPublic {
  telegram_enabled: boolean;
  telegram_bot_token_masked: string;
  has_telegram_bot_token: boolean;
  telegram_chat_id: string;
  discord_enabled: boolean;
  discord_webhook_url_masked: string;
  has_discord_webhook_url: boolean;
  zalo_enabled: boolean;
  zalo_webhook_url: string;
  events: NotificationEventToggles;
}

export interface HostMatchSummary extends PublicMatch {
  confirmed_slots: number;
  waitlist_count: number;
  collected_amount: number;
  pending_refunds_count: number;
  unpaid_deficits_count: number;
}

export interface HostUnpaidDeficitItem {
  id: string;
  match_id: string;
  match_title: string;
  short_code: string;
  player_name: string;
  net_balance: number;
}
