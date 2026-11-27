import { NextRequest, NextResponse } from 'next/server';
import { requireHostMutation } from '@/lib/host-api';
import { sanitizeText } from '@/lib/validation';

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

  const contact =
    typeof body.contactNormalized === 'string'
      ? body.contactNormalized.replace(/[^0-9]/g, '').slice(-9)
      : '';
  const playerName = sanitizeText(body.playerName, 120);
  const deltaAmount = Number(body.deltaAmount);
  const note = sanitizeText(body.note, 200) || 'Điều chỉnh số dư ví CLB';

  if (
    contact.length < 9 ||
    !playerName ||
    !Number.isInteger(deltaAmount) ||
    deltaAmount === 0 ||
    Math.abs(deltaAmount) > 50_000_000
  ) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }

  const { error } = await auth.supabase.from('club_wallet_ledger').insert({
    host_id: auth.user.id,
    contact_normalized: contact,
    player_name: playerName,
    delta_amount: deltaAmount,
    note,
  });

  if (error) {
    return NextResponse.json(
      { error: 'wallet_update_failed', code: error.code },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
