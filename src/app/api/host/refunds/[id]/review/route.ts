import { NextRequest, NextResponse } from 'next/server';
import { requireHostMutation, safeRpcError } from '@/lib/host-api';
import { isValidUuid, sanitizeText } from '@/lib/validation';

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

  let body: { approve?: unknown; note?: unknown };
  try {
    body = (await request.json()) as { approve?: unknown; note?: unknown };
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  if (typeof body.approve !== 'boolean') {
    return NextResponse.json({ error: 'invalid_approve' }, { status: 400 });
  }

  const note = sanitizeText(body.note, 200);

  const { data, error } = await auth.supabase.rpc('host_review_refund', {
    p_refund_id: id,
    p_approve: body.approve,
    p_note: note,
  });

  if (error) {
    return NextResponse.json(
      { error: safeRpcError(error.message, 'review_failed') },
      { status: 400 }
    );
  }

  return NextResponse.json(data, { status: 200 });
}
