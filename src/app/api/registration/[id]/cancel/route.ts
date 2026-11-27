import { NextRequest, NextResponse } from 'next/server';
import { dispatchHostNotification } from '@/lib/notifications';
import { createAdminClient } from '@/lib/supabase/admin';
import { enforceRateLimits, normalizeIpForRateLimit } from '@/lib/rate-limit';
import {
  extractClientIp,
  isValidPin,
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
      { key: `reg_cancel:ip:${normIp}`, limit: 20, windowSeconds: 60 },
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

  if (!isValidPin(body.pin)) {
    return NextResponse.json({ error: 'invalid_pin_format' }, { status: 400 });
  }

  const refundAccountInfo =
    typeof body.refundAccountInfo === 'string'
      ? sanitizeText(body.refundAccountInfo, 200)
      : '';

  try {
    const { data, error } = await admin.rpc('cancel_registration', {
      p_registration_id: id,
      p_access_token: accessToken,
      p_pin: body.pin,
      p_refund_account_info: refundAccountInfo || null,
    });

    if (error || !data) {
      return NextResponse.json({ error: 'cancel_failed' }, { status: 500 });
    }

    const result = data as {
      ok: boolean;
      error?: string;
      pin_locked_until?: string;
      refund_amount?: number;
    };
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

    try {
      const { data: regInfo } = await admin
        .from('registrations')
        .select('match_id, display_name, slots, payment_code')
        .eq('id', id)
        .maybeSingle();

      if (regInfo) {
        const ri = regInfo as {
          match_id: string;
          display_name: string;
          slots: number;
          payment_code: string;
        };
        const { data: mInfo } = await admin
          .from('matches')
          .select('host_id, title, short_code, starts_at, cancel_cutoff_hours')
          .eq('id', ri.match_id)
          .maybeSingle();

        if (mInfo) {
          const mi = mInfo as {
            host_id: string;
            title: string;
            short_code: string;
            starts_at: string;
            cancel_cutoff_hours: number;
          };
          const cutoffMs =
            new Date(mi.starts_at).getTime() - mi.cancel_cutoff_hours * 3600_000;
          const isLateCancel = Date.now() > cutoffMs;

          if (isLateCancel) {
            await dispatchHostNotification(admin, mi.host_id, {
              type: 'late_cancel',
              matchTitle: mi.title,
              shortCode: mi.short_code,
              playerName: ri.display_name,
              slots: ri.slots,
              amountVnd: result.refund_amount,
              detail: `Hủy sát giờ (mã ${ri.payment_code})`,
            });
          }

          if ((result.refund_amount ?? 0) > 0) {
            await dispatchHostNotification(admin, mi.host_id, {
              type: 'refund_request',
              matchTitle: mi.title,
              shortCode: mi.short_code,
              playerName: ri.display_name,
              slots: ri.slots,
              amountVnd: result.refund_amount,
              detail: refundAccountInfo
                ? `TK hoàn: ${refundAccountInfo}`
                : 'Chưa cung cấp STK hoàn tiền',
            });
          }
        }
      }
    } catch {
      // Never block cancel flow on notification errors
    }

    return NextResponse.json(result, { status: 200 });
  } catch {
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
