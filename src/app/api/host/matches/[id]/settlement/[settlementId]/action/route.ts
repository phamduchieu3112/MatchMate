import { NextRequest, NextResponse } from 'next/server';
import { requireHostMutation } from '@/lib/host-api';
import type { MatchSettlementRow } from '@/lib/types';
import { isValidUuid } from '@/lib/validation';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; settlementId: string }> }
) {
  const auth = await requireHostMutation(request);
  if (!auth.ok) return auth.response;

  const { id, settlementId } = await context.params;
  if (!isValidUuid(id) || !isValidUuid(settlementId)) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }

  let body: { action?: unknown };
  try {
    body = (await request.json()) as { action?: unknown };
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const action =
    body.action === 'mark_paid' ||
    body.action === 'mark_unpaid' ||
    body.action === 'credit_wallet'
      ? body.action
      : null;

  if (!action) {
    return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
  }

  const { data: matchRow } = await auth.supabase
    .from('matches')
    .select('id, host_id, short_code')
    .eq('id', id)
    .maybeSingle();

  if (!matchRow || (matchRow as { host_id: string }).host_id !== auth.user.id) {
    return NextResponse.json({ error: 'match_not_found' }, { status: 404 });
  }

  const { data: rowData } = await auth.supabase
    .from('match_settlements')
    .select('*')
    .eq('id', settlementId)
    .eq('match_id', id)
    .maybeSingle();

  if (!rowData) {
    return NextResponse.json({ error: 'settlement_not_found' }, { status: 404 });
  }

  const settlement = rowData as MatchSettlementRow;
  const nowIso = new Date().toISOString();

  if (action === 'mark_paid') {
    const { error } = await auth.supabase
      .from('match_settlements')
      .update({ status: 'paid', paid_at: nowIso, updated_at: nowIso })
      .eq('id', settlementId);
    if (error) {
      return NextResponse.json(
        { error: 'update_failed', code: error.code },
        { status: 400 }
      );
    }
    return NextResponse.json({ ok: true, status: 'paid' }, { status: 200 });
  }

  if (action === 'mark_unpaid') {
    const { error } = await auth.supabase
      .from('match_settlements')
      .update({ status: 'unpaid', paid_at: null, updated_at: nowIso })
      .eq('id', settlementId);
    if (error) {
      return NextResponse.json(
        { error: 'update_failed', code: error.code },
        { status: 400 }
      );
    }
    return NextResponse.json({ ok: true, status: 'unpaid' }, { status: 200 });
  }

  // credit_wallet: idempotent credit of surplus into club_wallet_ledger
  if (settlement.settlement_type !== 'surplus' || settlement.net_balance >= 0) {
    return NextResponse.json({ error: 'not_a_surplus' }, { status: 400 });
  }
  if (!settlement.contact_normalized) {
    return NextResponse.json({ error: 'missing_contact' }, { status: 400 });
  }
  if (settlement.status === 'credited_wallet') {
    return NextResponse.json({ ok: true, status: 'credited_wallet' }, { status: 200 });
  }

  const { data: existingLedger } = await auth.supabase
    .from('club_wallet_ledger')
    .select('id')
    .eq('settlement_id', settlementId)
    .maybeSingle();

  if (!existingLedger) {
    const surplusAmount = Math.abs(settlement.net_balance);
    const { error: ledgerErr } = await auth.supabase
      .from('club_wallet_ledger')
      .insert({
        host_id: auth.user.id,
        contact_normalized: settlement.contact_normalized,
        player_name: settlement.player_name,
        match_id: id,
        settlement_id: settlementId,
        delta_amount: surplusAmount,
        note: `Hoàn dư buổi #${(matchRow as { short_code: string }).short_code}`,
      });
    if (ledgerErr) {
      return NextResponse.json(
        { error: 'wallet_credit_failed', code: ledgerErr.code },
        { status: 400 }
      );
    }
  }

  await auth.supabase
    .from('match_settlements')
    .update({ status: 'credited_wallet', updated_at: nowIso })
    .eq('id', settlementId);

  return NextResponse.json({ ok: true, status: 'credited_wallet' }, { status: 200 });
}
