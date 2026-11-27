import { NextRequest, NextResponse } from 'next/server';
import { requireHostMutation } from '@/lib/host-api';
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
  if (body.title !== undefined) {
    const title = sanitizeText(body.title, 120);
    if (!title) return NextResponse.json({ error: 'invalid_title' }, { status: 400 });
    updates.title = title;
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
  if (body.courts !== undefined) {
    const courts = Number(body.courts);
    if (!Number.isInteger(courts) || courts < 1) {
      return NextResponse.json({ error: 'invalid_courts' }, { status: 400 });
    }
    updates.courts = courts;
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
