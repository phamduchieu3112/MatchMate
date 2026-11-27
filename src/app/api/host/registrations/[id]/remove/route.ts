import { NextRequest, NextResponse } from 'next/server';
import { requireHostMutation } from '@/lib/host-api';
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

  let noRefundOverride = false;
  try {
    const parsed = (await request.json()) as { noRefundOverride?: unknown };
    noRefundOverride = parsed?.noRefundOverride === true;
  } catch {
    // Optional body
  }

  const { data, error } = await auth.supabase.rpc('host_remove_registration', {
    p_registration_id: id,
    p_no_refund_override: noRefundOverride,
  });

  if (error) {
    return NextResponse.json({ error: error.message || 'remove_failed' }, { status: 400 });
  }

  return NextResponse.json(data, { status: 200 });
}
