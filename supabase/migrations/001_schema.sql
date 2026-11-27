-- 001_schema.sql
-- MatchMate v3.1 Database Schema, Integrity Trigger, and Pure Helpers

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- 1. matches
CREATE TABLE IF NOT EXISTS public.matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  short_code text UNIQUE NOT NULL CHECK (short_code ~ '^[A-Za-z0-9]{6}$'),
  host_id uuid NOT NULL DEFAULT auth.uid(),
  sport text NOT NULL CHECK (char_length(trim(sport)) BETWEEN 1 AND 40),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  starts_at timestamptz NOT NULL,
  location_name text NOT NULL CHECK (char_length(trim(location_name)) BETWEEN 1 AND 160),
  map_url text CHECK (map_url IS NULL OR map_url ~ '^https://'),
  level text,
  fee_per_slot int NOT NULL CHECK (fee_per_slot >= 0),
  max_slots int NOT NULL CHECK (max_slots >= 1),
  courts int DEFAULT 1 CHECK (courts IS NULL OR courts >= 1),
  lock_at timestamptz NOT NULL,
  cancel_cutoff_hours int NOT NULL DEFAULT 12 CHECK (cancel_cutoff_hours >= 0),
  hold_minutes int NOT NULL DEFAULT 15 CHECK (hold_minutes > 0),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'locked', 'cancelled', 'finished')),
  slots_taken int NOT NULL DEFAULT 0 CHECK (slots_taken >= 0),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 500),
  court_fee_total int NOT NULL DEFAULT 0 CHECK (court_fee_total >= 0),
  shuttle_fee_total int NOT NULL DEFAULT 0 CHECK (shuttle_fee_total >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS matches_host_starts_idx ON public.matches (host_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS matches_status_starts_idx ON public.matches (status, starts_at);

-- 2. registrations
CREATE TABLE IF NOT EXISTS public.registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE RESTRICT,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 60),
  contact text CHECK (contact IS NULL OR char_length(contact) BETWEEN 9 AND 30),
  slots int NOT NULL CHECK (slots > 0),
  status text NOT NULL CHECK (status IN ('pending_payment', 'confirmed', 'waitlisted', 'expired', 'cancelled')),
  payment_code text UNIQUE NOT NULL CHECK (payment_code ~ '^KEO[A-Z0-9]{6}$'),
  amount_due int NOT NULL CHECK (amount_due >= 0),
  amount_paid int NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  payment_method text NOT NULL DEFAULT 'none' CHECK (payment_method IN ('sepay', 'cash', 'none')),
  expires_at timestamptz,
  pin_hash text NOT NULL,
  pin_fail_count int NOT NULL DEFAULT 0,
  pin_locked_until timestamptz,
  access_token text UNIQUE NOT NULL DEFAULT encode(extensions.gen_random_bytes(32), 'hex'),
  refund_account_info text CHECK (refund_account_info IS NULL OR char_length(refund_account_info) <= 200),
  booking_ip inet,
  checked_in bool NOT NULL DEFAULT false,
  promoted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz
);

CREATE INDEX IF NOT EXISTS registrations_match_status_idx ON public.registrations (match_id, status, created_at);
CREATE INDEX IF NOT EXISTS registrations_expires_idx ON public.registrations (expires_at) WHERE status = 'pending_payment';

-- 3. payments
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sepay_transaction_id text UNIQUE,
  registration_id uuid NULL REFERENCES public.registrations(id) ON DELETE RESTRICT,
  amount int NOT NULL CHECK (amount > 0),
  content text,
  received_at timestamptz NOT NULL DEFAULT now(),
  raw jsonb,
  result text NOT NULL DEFAULT 'unmatched' CHECK (result IN ('exact', 'underpaid', 'overpaid', 'late', 'unmatched'))
);

CREATE INDEX IF NOT EXISTS payments_registration_idx ON public.payments (registration_id);
CREATE INDEX IF NOT EXISTS payments_received_idx ON public.payments (received_at DESC);

-- 4. refunds
CREATE TABLE IF NOT EXISTS public.refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid NOT NULL REFERENCES public.registrations(id) ON DELETE RESTRICT,
  amount int NOT NULL CHECK (amount > 0),
  reason text NOT NULL CHECK (reason IN (
    'cancelled_in_time',
    'host_cancelled',
    'overpaid',
    'underpaid_expired',
    'late_slot_lost',
    'duplicate_payment',
    'resold_after_cutoff',
    'paid_while_waitlisted'
  )),
  status text NOT NULL CHECK (status IN ('pending_review', 'pending', 'done', 'rejected')),
  account_info text,
  done_at timestamptz,
  note text CHECK (note IS NULL OR char_length(note) <= 200),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS refunds_registration_idx ON public.refunds (registration_id);
CREATE INDEX IF NOT EXISTS refunds_status_created_idx ON public.refunds (status, created_at);

-- 5. request_log
CREATE TABLE IF NOT EXISTS public.request_log (
  id bigserial PRIMARY KEY,
  ip inet NOT NULL,
  normalized_ip inet NOT NULL,
  action text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS request_log_ip_time_idx ON public.request_log (normalized_ip, created_at DESC);
CREATE INDEX IF NOT EXISTS request_log_action_time_idx ON public.request_log (action, created_at DESC);

-- 6. request_idempotency
CREATE TABLE IF NOT EXISTS public.request_idempotency (
  key uuid PRIMARY KEY,
  registration_id uuid REFERENCES public.registrations(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 7. audit_log
CREATE TABLE IF NOT EXISTS public.audit_log (
  id bigserial PRIMARY KEY,
  actor_id uuid,
  actor_role text NOT NULL CHECK (actor_role IN ('host', 'service_role', 'anon')),
  action text NOT NULL CHECK (action IN (
    'refund_done',
    'refund_reviewed',
    'cash_payment',
    'player_removed',
    'match_cancelled',
    'payment_assigned',
    'match_locked',
    'pii_cleanup'
  )),
  target_table text,
  target_id uuid,
  before jsonb,
  after jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_target_idx ON public.audit_log (target_table, target_id, created_at DESC);

-- Pure Helpers (IMMUTABLE)
CREATE OR REPLACE FUNCTION public.normalize_contact(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions, pg_temp
AS $$
  SELECT right(regexp_replace(COALESCE(p, ''), '[^0-9]', '', 'g'), 9);
$$;

CREATE OR REPLACE FUNCTION public.normalize_ip(p inet)
RETURNS inet
LANGUAGE sql
IMMUTABLE
SET search_path = public, extensions, pg_temp
AS $$
  SELECT CASE WHEN family(p) = 6 THEN network(set_masklen(p, 64)) ELSE p END;
$$;

-- Integrity Trigger on matches (Section 3.1)
CREATE OR REPLACE FUNCTION public.guard_match_mutations()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_active_slots int;
BEGIN
  SELECT COALESCE(SUM(slots), 0)::int
  INTO v_active_slots
  FROM public.registrations
  WHERE match_id = OLD.id
    AND (status = 'confirmed' OR (status = 'pending_payment' AND expires_at > now()));

  IF NEW.max_slots < v_active_slots THEN
    RAISE EXCEPTION 'max_slots_below_active_slots' USING ERRCODE = 'P0001';
  END IF;

  IF v_active_slots > 0 THEN
    IF NEW.fee_per_slot IS DISTINCT FROM OLD.fee_per_slot
      OR NEW.lock_at IS DISTINCT FROM OLD.lock_at
      OR NEW.cancel_cutoff_hours IS DISTINCT FROM OLD.cancel_cutoff_hours
      OR NEW.hold_minutes IS DISTINCT FROM OLD.hold_minutes
    THEN
      RAISE EXCEPTION 'match_terms_locked_while_active_bookings' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_match_mutations ON public.matches;
CREATE TRIGGER trg_guard_match_mutations
BEFORE UPDATE ON public.matches
FOR EACH ROW
EXECUTE FUNCTION public.guard_match_mutations();
