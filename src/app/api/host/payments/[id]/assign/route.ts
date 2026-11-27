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

  let body: { registrationId?: unknown };
  try {
    body = (await request.json()) as { registrationId?: unknown };
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  if (!isValidUuid(body.registrationId)) {
    return NextResponse.json({ error: 'invalid_registration_id' }, { status: 400 });
  }

  const { data, error } = await auth.supabase.rpc('assign_unmatched_payment', {
    p_payment_id: id,
    p_registration_id: body.registrationId,
  });

  if (error) {
    return NextResponse.json({ error: error.message || 'assign_failed' }, { status: 400 });
  }

  return NextResponse.json(data, { status: 200 });
}
