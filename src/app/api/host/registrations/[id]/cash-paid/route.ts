import { NextRequest, NextResponse } from 'next/server';
import { requireHostMutation, safeRpcError } from '@/lib/host-api';
import { isValidUuid } from '@/lib/validation';

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

  const { data, error } = await auth.supabase.rpc('host_mark_cash_paid', {
    p_registration_id: id,
  });

  if (error) {
    return NextResponse.json(
      { error: safeRpcError(error.message, 'cash_paid_failed') },
      { status: 400 }
    );
  }

  return NextResponse.json(data, { status: 200 });
}
