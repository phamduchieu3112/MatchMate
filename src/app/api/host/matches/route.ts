import { NextRequest, NextResponse } from 'next/server';
import {
  generateShortCode,
  hasVietnamOffset,
  requireHostMutation,
} from '@/lib/host-api';
import { sanitizeText, validateMapUrl } from '@/lib/validation';

export async function POST(request: NextRequest) {
  const auth = await requireHostMutation(request);
  if (!auth.ok) return auth.response;

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

  const sport = sanitizeText(body.sport, 40);
  const title = sanitizeText(body.title, 120);
  const locationName = sanitizeText(body.location_name, 160);
  const level = sanitizeText(body.level, 60) || null;
  const notes = sanitizeText(body.notes, 500) || null;
  const mapCheck = validateMapUrl(body.map_url);

  const feePerSlot = Number(body.fee_per_slot);
  const maxSlots = Number(body.max_slots);
  const courts = body.courts === undefined ? 1 : Number(body.courts);
  const cancelCutoffHours =
    body.cancel_cutoff_hours === undefined ? 12 : Number(body.cancel_cutoff_hours);
  const holdMinutes =
    body.hold_minutes === undefined ? 15 : Number(body.hold_minutes);

  if (
    !sport ||
    !title ||
    !locationName ||
    !mapCheck.valid ||
    !hasVietnamOffset(body.starts_at) ||
    !hasVietnamOffset(body.lock_at) ||
    !Number.isInteger(feePerSlot) ||
    feePerSlot < 0 ||
    !Number.isInteger(maxSlots) ||
    maxSlots < 1 ||
    !Number.isInteger(courts) ||
    courts < 1 ||
    !Number.isInteger(cancelCutoffHours) ||
    cancelCutoffHours < 0 ||
    !Number.isInteger(holdMinutes) ||
    holdMinutes < 1
  ) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const shortCode = generateShortCode();
    const { data, error } = await auth.supabase
      .from('matches')
      .insert({
        short_code: shortCode,
        sport,
        title,
        starts_at: body.starts_at,
        location_name: locationName,
        map_url: mapCheck.value,
        level,
        fee_per_slot: feePerSlot,
        max_slots: maxSlots,
        courts,
        lock_at: body.lock_at,
        cancel_cutoff_hours: cancelCutoffHours,
        hold_minutes: holdMinutes,
        notes,
        court_fee_total: 0,
        shuttle_fee_total: 0,
      })
      .select('id, short_code')
      .single();

    if (!error && data) {
      return NextResponse.json(data, { status: 201 });
    }
    if (error?.code !== '23505') {
      return NextResponse.json({ error: 'create_failed' }, { status: 400 });
    }
  }

  return NextResponse.json({ error: 'short_code_exhausted' }, { status: 500 });
}
