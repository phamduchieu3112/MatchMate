import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { enforceRateLimits, normalizeIpForRateLimit } from '@/lib/rate-limit';
import { extractClientIp, isValidUuid } from '@/lib/validation';

export const dynamic = 'force-dynamic';

interface BookingSyncItem {
  matchId: string;
  registrationId: string;
}

export async function POST(request: NextRequest) {
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
    const normIp = normalizeIpForRateLimit(extractClientIp(request.headers));
    const rateLimitRes = await enforceRateLimits(admin, [
      { key: `bookings_sync:ip:${normIp}`, limit: 30, windowSeconds: 60 },
    ]);
    if (rateLimitRes) return rateLimitRes;
  } catch {
    return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const rawBookings =
    body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>).bookings
      : null;

  if (!Array.isArray(rawBookings)) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }

  const items: BookingSyncItem[] = [];
  for (const entry of rawBookings.slice(0, 20)) {
    if (!entry || typeof entry !== 'object') continue;
    const rec = entry as Record<string, unknown>;
    if (
      typeof rec.matchId === 'string' &&
      typeof rec.registrationId === 'string' &&
      isValidUuid(rec.matchId) &&
      isValidUuid(rec.registrationId)
    ) {
      items.push({
        matchId: rec.matchId,
        registrationId: rec.registrationId,
      });
    }
  }

  if (items.length === 0) {
    return NextResponse.json(
      { validRegistrationIds: [] },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  try {
    const matchIds = Array.from(new Set(items.map((i) => i.matchId)));
    const regIds = Array.from(new Set(items.map((i) => i.registrationId)));

    const [matchesRes, regsRes] = await Promise.all([
      admin.from('matches').select('id').in('id', matchIds),
      admin.from('registrations').select('id, match_id').in('id', regIds),
    ]);

    if (matchesRes.error || regsRes.error) {
      return NextResponse.json({ error: 'sync_failed' }, { status: 500 });
    }

    const existingMatchIds = new Set((matchesRes.data ?? []).map((m) => m.id));
    const existingRegMatchMap = new Map(
      (regsRes.data ?? []).map((r) => [r.id, r.match_id])
    );

    const validRegistrationIds = items
      .filter(
        (item) =>
          existingMatchIds.has(item.matchId) &&
          existingRegMatchMap.get(item.registrationId) === item.matchId
      )
      .map((item) => item.registrationId);

    return NextResponse.json(
      { validRegistrationIds },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
