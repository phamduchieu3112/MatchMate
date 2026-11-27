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

  let body: { note?: unknown };
  try {
    body = (await request.json()) as { note?: unknown };
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const note = sanitizeText(body.note, 200);
  if (!note) {
    return NextResponse.json({ error: 'note_required' }, { status: 400 });
  }

  const { data, error } = await auth.supabase.rpc('host_mark_refund_done', {
    p_refund_id: id,
    p_note: note,
  });

  if (error) {
    return NextResponse.json(
      { error: safeRpcError(error.message, 'refund_done_failed') },
      { status: 400 }
    );
  }

  return NextResponse.json(data, { status: 200 });
}
