import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { validateSePayPayload, verifySePayApiKey } from '@/lib/validation';

export const maxDuration = 10;

const MAX_WEBHOOK_BYTES = 16_384;

export async function POST(request: NextRequest) {
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ error: 'invalid_body' }, { status: 400 });
  }

  if (Buffer.byteLength(rawBody, 'utf8') > MAX_WEBHOOK_BYTES) {
    return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });
  }

  const authHeader = request.headers.get('authorization');
  if (!verifySePayApiKey(authHeader, process.env.SEPAY_WEBHOOK_API_KEY)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const validated = validateSePayPayload(
    parsedJson,
    process.env.SEPAY_BANK_ACCOUNT
  );
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc('apply_payment', {
      p_txn_id: validated.data.id,
      p_amount: validated.data.transferAmount,
      p_content: validated.data.content,
      p_raw: parsedJson,
    });

    if (error) {
      return NextResponse.json({ error: 'db_error' }, { status: 500 });
    }

    return NextResponse.json(
      { success: true, result: (data as { result?: string } | null)?.result ?? 'ok' },
      { status: 200 }
    );
  } catch {
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
