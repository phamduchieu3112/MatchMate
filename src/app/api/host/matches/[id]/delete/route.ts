import { NextRequest, NextResponse } from 'next/server';
import { requireHostMutation } from '@/lib/host-api';
import { createAdminClient } from '@/lib/supabase/admin';
import { isValidUuid } from '@/lib/validation';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireHostMutation(request);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }

  // Verify the host owns this match via RLS
  const { data: ownedMatch, error: ownErr } = await auth.supabase
    .from('matches')
    .select('id')
    .eq('id', id)
    .maybeSingle();

  if (ownErr || !ownedMatch) {
    return NextResponse.json({ error: 'match_not_found' }, { status: 404 });
  }

  try {
    const admin = createAdminClient();

    const { data: regs, error: regErr } = await admin
      .from('registrations')
      .select('id, amount_paid')
      .eq('match_id', id);

    if (regErr) {
      return NextResponse.json({ error: 'delete_failed' }, { status: 500 });
    }

    const regRows = regs ?? [];
    const regIds = regRows.map((r) => r.id);

    if (regRows.some((r) => (r.amount_paid ?? 0) > 0)) {
      return NextResponse.json({ error: 'match_has_payments' }, { status: 409 });
    }

    if (regIds.length > 0) {
      const [payCheck, refCheck] = await Promise.all([
        admin
          .from('payments')
          .select('id', { count: 'exact', head: true })
          .in('registration_id', regIds),
        admin
          .from('refunds')
          .select('id', { count: 'exact', head: true })
          .in('registration_id', regIds),
      ]);

      if ((payCheck.count ?? 0) > 0 || (refCheck.count ?? 0) > 0) {
        return NextResponse.json({ error: 'match_has_payments' }, { status: 409 });
      }

      await admin
        .from('request_idempotency')
        .delete()
        .in('registration_id', regIds);

      const { error: delRegsErr } = await admin
        .from('registrations')
        .delete()
        .eq('match_id', id);

      if (delRegsErr) {
        return NextResponse.json({ error: 'delete_failed' }, { status: 500 });
      }
    }

    const { error: delMatchErr } = await admin
      .from('matches')
      .delete()
      .eq('id', id);

    if (delMatchErr) {
      return NextResponse.json({ error: 'delete_failed' }, { status: 500 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
