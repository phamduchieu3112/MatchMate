import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireHostMutation } from '@/lib/host-api';
import {
  extractClientIp,
  isValidPin,
  isValidUuid,
  sanitizeText,
  validateAndNormalizePhone,
} from '@/lib/validation';

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

  // Verify the host owns this match via RLS
  const { data: match, error: matchErr } = await auth.supabase
    .from('matches')
    .select('id')
    .eq('id', id)
    .single();

  if (matchErr || !match) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
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

  const name = sanitizeText(body.name, 60);
  const phone = validateAndNormalizePhone(body.contact);
  const slots = Number(body.slots);
  const pin = typeof body.pin === 'string' && isValidPin(body.pin) ? body.pin : '0000';

  if (!name || !phone.valid || !Number.isInteger(slots) || slots < 1 || slots > 4) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc('book_slots', {
    p_match_id: id,
    p_name: name,
    p_contact: phone.sanitized,
    p_slots: slots,
    p_pin: pin,
    p_ip: extractClientIp(request.headers),
  });

  if (error || !data || !Array.isArray(data) || data.length === 0) {
    return NextResponse.json({ error: error?.message || 'add_failed' }, { status: 400 });
  }

  const row = data[0] as { id: string; payment_code: string; status: string };
  return NextResponse.json(
    { id: row.id, payment_code: row.payment_code, status: row.status },
    { status: 201 }
  );
}
