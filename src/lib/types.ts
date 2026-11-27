export type MatchStatus = 'open' | 'locked' | 'cancelled' | 'finished';
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
  lock_at: string;
  cancel_cutoff_hours: number;
  hold_minutes: number;
  status: MatchStatus;
  slots_taken: number;
  notes: string | null;
  created_at: string;
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
  };
}

export interface StoredBookingRef {
  matchId: string;
  registrationId: string;
  shortCode: string;
}
