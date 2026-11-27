import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isValidPin, isValidUuid, sanitizeText } from '@/lib/validation';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }

  const accessToken = request.cookies.get(`kt_${id}`)?.value;
  if (!accessToken) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
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

  if (!isValidPin(body.pin)) {
    return NextResponse.json({ error: 'invalid_pin_format' }, { status: 400 });
  }

  const refundAccountInfo =
    typeof body.refundAccountInfo === 'string'
      ? sanitizeText(body.refundAccountInfo, 200)
      : '';

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc('cancel_registration', {
      p_registration_id: id,
      p_access_token: accessToken,
      p_pin: body.pin,
      p_refund_account_info: refundAccountInfo || null,
    });

    if (error || !data) {
      return NextResponse.json({ error: 'cancel_failed' }, { status: 500 });
    }

    const result = data as { ok: boolean; error?: string; pin_locked_until?: string };
    if (!result.ok) {
      if (result.error === 'pin_locked') {
        return NextResponse.json(
          { error: 'pin_locked', pin_locked_until: result.pin_locked_until },
          { status: 429 }
        );
      }
      if (result.error === 'invalid_pin') {
        return NextResponse.json({ error: 'invalid_pin' }, { status: 401 });
      }
      if (result.error === 'unauthorized') {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
      }
      return NextResponse.json({ error: result.error ?? 'cancel_rejected' }, { status: 409 });
    }

    return NextResponse.json(result, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
