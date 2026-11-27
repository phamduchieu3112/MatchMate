import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { enforceRateLimits, normalizeIpForRateLimit } from '@/lib/rate-limit';
import {
  extractClientIp,
  isValidUuid,
  sanitizeText,
  verifyHostOrigin,
} from '@/lib/validation';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!verifyHostOrigin(request.headers)) {
    return NextResponse.json({ error: 'invalid_origin' }, { status: 403 });
  }

  const { id } = await context.params;
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }

  const accessToken = request.cookies.get(`kt_${id}`)?.value;
  if (!accessToken) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
    const normIp = normalizeIpForRateLimit(extractClientIp(request.headers));
    const rateLimitRes = await enforceRateLimits(admin, [
      { key: `reg_refund_acc:ip:${normIp}`, limit: 20, windowSeconds: 60 },
    ]);
    if (rateLimitRes) return rateLimitRes;
  } catch {
    return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
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

  const accountInfo = sanitizeText(body.accountInfo, 200);
  if (!accountInfo) {
    return NextResponse.json({ error: 'invalid_refund_account' }, { status: 400 });
  }

  try {
    const { data, error } = await admin.rpc('set_refund_account', {
      p_registration_id: id,
      p_access_token: accessToken,
      p_account_info: accountInfo,
    });

    if (error || !data) {
      return NextResponse.json({ error: 'update_failed' }, { status: 500 });
    }

    const result = data as { ok: boolean; error?: string };
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error ?? 'update_rejected' },
        { status: result.error === 'unauthorized' ? 401 : 400 }
      );
    }

    return NextResponse.json(result, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
