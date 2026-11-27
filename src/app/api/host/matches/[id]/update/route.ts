import { NextRequest, NextResponse } from 'next/server';
import { hasVietnamOffset, requireHostMutation } from '@/lib/host-api';
import { isValidUuid, sanitizeText, validateMapUrl } from '@/lib/validation';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireHostMutation(request);
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (body.sport !== undefined) {
    const sport = sanitizeText(body.sport, 40);
    if (!sport) return NextResponse.json({ error: 'invalid_sport' }, { status: 400 });
    updates.sport = sport;
  }
  if (body.title !== undefined) {
    const title = sanitizeText(body.title, 120);
    if (!title) return NextResponse.json({ error: 'invalid_title' }, { status: 400 });
    updates.title = title;
  }
  if (body.starts_at !== undefined) {
    if (!hasVietnamOffset(body.starts_at)) {
      return NextResponse.json({ error: 'invalid_starts_at' }, { status: 400 });
    }
    updates.starts_at = body.starts_at;
  }
  if (body.lock_at !== undefined) {
    if (!hasVietnamOffset(body.lock_at)) {
      return NextResponse.json({ error: 'invalid_lock_at' }, { status: 400 });
    }
    updates.lock_at = body.lock_at;
  }
  if (
    typeof updates.starts_at === 'string' &&
    typeof updates.lock_at === 'string' &&
    new Date(updates.lock_at).getTime() > new Date(updates.starts_at).getTime()
  ) {
    return NextResponse.json({ error: 'lock_after_start' }, { status: 400 });
  }
  if (body.location_name !== undefined) {
    const loc = sanitizeText(body.location_name, 160);
    if (!loc) return NextResponse.json({ error: 'invalid_location' }, { status: 400 });
    updates.location_name = loc;
  }
  if (body.map_url !== undefined) {
    const mapCheck = validateMapUrl(body.map_url);
    if (!mapCheck.valid) {
      return NextResponse.json({ error: 'invalid_map_url' }, { status: 400 });
    }
    updates.map_url = mapCheck.value;
  }
  if (body.level !== undefined) {
    updates.level = sanitizeText(body.level, 60) || null;
  }
  if (body.notes !== undefined) {
    updates.notes = sanitizeText(body.notes, 500) || null;
  }
  if (body.fee_per_slot !== undefined) {
    const fee = Number(body.fee_per_slot);
    if (!Number.isInteger(fee) || fee < 0) {
      return NextResponse.json({ error: 'invalid_fee' }, { status: 400 });
    }
    updates.fee_per_slot = fee;
  }
  if (body.max_slots !== undefined) {
    const maxSlots = Number(body.max_slots);
    if (!Number.isInteger(maxSlots) || maxSlots < 1) {
      return NextResponse.json({ error: 'invalid_max_slots' }, { status: 400 });
    }
    const { data: existing } = await auth.supabase
      .from('matches')
      .select('slots_taken')
      .eq('id', id)
      .single();
    if (existing && maxSlots < existing.slots_taken) {
      return NextResponse.json({ error: 'max_slots_below_taken' }, { status: 400 });
    }
    updates.max_slots = maxSlots;
  }
  if (body.court_numbers !== undefined) {
    const rawCourtNumbers = sanitizeText(body.court_numbers, 80);
    const parts = rawCourtNumbers
      ? rawCourtNumbers
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    updates.court_numbers = parts.length > 0 ? parts.join(', ').slice(0, 80) : null;
    updates.courts = Math.max(1, parts.length);
  } else if (body.courts !== undefined) {
    const courts = Number(body.courts);
    if (!Number.isInteger(courts) || courts < 1) {
      return NextResponse.json({ error: 'invalid_courts' }, { status: 400 });
    }
    updates.courts = courts;
  }
  if (body.cancel_cutoff_hours !== undefined) {
    const cutoff = Number(body.cancel_cutoff_hours);
    if (!Number.isInteger(cutoff) || cutoff < 0) {
      return NextResponse.json({ error: 'invalid_cancel_cutoff' }, { status: 400 });
    }
    updates.cancel_cutoff_hours = cutoff;
  }
  if (body.hold_minutes !== undefined) {
    const hold = Number(body.hold_minutes);
    if (!Number.isInteger(hold) || hold < 1) {
      return NextResponse.json({ error: 'invalid_hold_minutes' }, { status: 400 });
    }
    updates.hold_minutes = hold;
  }
  if (body.court_fee_total !== undefined) {
    const courtFee = Number(body.court_fee_total);
    if (!Number.isInteger(courtFee) || courtFee < 0) {
      return NextResponse.json({ error: 'invalid_court_fee' }, { status: 400 });
    }
    updates.court_fee_total = courtFee;
  }
  if (body.shuttle_fee_total !== undefined) {
    const shuttleFee = Number(body.shuttle_fee_total);
    if (!Number.isInteger(shuttleFee) || shuttleFee < 0) {
      return NextResponse.json({ error: 'invalid_shuttle_fee' }, { status: 400 });
    }
    updates.shuttle_fee_total = shuttleFee;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'no_updates' }, { status: 400 });
  }

  const { error } = await auth.supabase
    .from('matches')
    .update(updates)
    .eq('id', id);

  if (error) {
    return NextResponse.json({ error: 'update_failed' }, { status: 400 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
