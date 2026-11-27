import 'server-only';
import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  createServerSupabaseClient,
  getAuthenticatedHost,
} from '@/lib/supabase/server';
import { verifyHostOrigin } from '@/lib/validation';

const SHORT_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateShortCode(): string {
  const bytes = crypto.randomBytes(6);
  let out = '';
  for (let i = 0; i < 6; i += 1) {
    out += SHORT_CODE_CHARS[bytes[i] % SHORT_CODE_CHARS.length];
  }
  return out;
}

export async function requireHostMutation(request: NextRequest) {
  if (!verifyHostOrigin(request.headers)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'invalid_origin' }, { status: 403 }),
    };
  }

  const { user, isHost } = await getAuthenticatedHost();
  if (!user || !isHost) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'unauthorized' }, { status: 401 }),
    };
  }

  const supabase = await createServerSupabaseClient();
  return { ok: true as const, user, supabase };
}

const ALLOWED_HOST_RPC_ERRORS = new Set([
  'forbidden',
  'match_not_found',
  'match_not_open',
  'match_locked',
  'match_started',
  'match_cannot_be_cancelled',
  'match_not_promotable',
  'max_slots_below_active_slots',
  'match_terms_locked_while_active_bookings',
  'registration_not_found',
  'invalid_registration_status',
  'already_closed',
  'not_waitlisted',
  'not_enough_slots',
  'payment_not_found',
  'payment_already_assigned',
  'refund_not_found',
  'refund_not_pending',
  'refund_not_pending_review',
  'refund_sla_escalation_required',
  'note_required',
  'note_too_long',
  'invalid_name',
  'invalid_phone',
  'invalid_pin',
  'invalid_slots',
  'per_match_cap',
  'concurrent_cap',
  'waitlist_cap',
  'cooldown',
  'ip_hold_cap',
  'payment_code_generation_failed',
]);

/**
 * Maps Postgres/RPC error messages through an explicit allowlist so internal
 * database details never leak to API responses.
 */
export function safeRpcError(
  message: string | undefined | null,
  fallback: string
): string {
  return message && ALLOWED_HOST_RPC_ERRORS.has(message) ? message : fallback;
}

export function hasVietnamOffset(iso: unknown): iso is string {
  return (
    typeof iso === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?\+07:00$/.test(iso) &&
    !Number.isNaN(new Date(iso).getTime())
  );
}
