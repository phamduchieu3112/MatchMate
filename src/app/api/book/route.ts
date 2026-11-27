import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  buildHostPaymentClientBundle,
  resolveMatchHostPayment,
  verifyTurnstileToken,
} from '@/lib/sepay';
import {
  extractClientIp,
  isValidPin,
  isValidUuid,
  isValidUuidV4,
  sanitizeText,
  validateAndNormalizePhone,
} from '@/lib/validation';

function normalizeIpForDb(ip: string): string {
  if (!ip.includes(':')) return ip;
  // Normalize IPv6 to /64 prefix for request_log storage
  const parts = ip.split(':');
  if (parts.length >= 4) {
    return `${parts.slice(0, 4).join(':')}::/64`;
  }
  return ip;
}

function hashContactKey(last9: string): string {
  return crypto.createHash('sha256').update(last9).digest('hex').slice(0, 16);
}

function mapBookError(message: string): { status: number; code: string } {
  const known: Record<string, { status: number; code: string }> = {
    match_not_found: { status: 404, code: 'match_not_found' },
    invalid_name: { status: 400, code: 'invalid_name' },
    invalid_phone: { status: 400, code: 'invalid_phone' },
    invalid_pin: { status: 400, code: 'invalid_pin' },
    match_not_open: { status: 409, code: 'match_not_open' },
    match_locked: { status: 409, code: 'match_locked' },
    match_started: { status: 409, code: 'match_started' },
    invalid_slots: { status: 400, code: 'invalid_slots' },
    per_match_cap: { status: 429, code: 'per_match_cap' },
    concurrent_cap: { status: 429, code: 'concurrent_cap' },
    waitlist_cap: { status: 429, code: 'waitlist_cap' },
    cooldown: { status: 429, code: 'cooldown' },
    ip_hold_cap: { status: 429, code: 'ip_hold_cap' },
  };
  return known[message] ?? { status: 500, code: 'booking_failed' };
}

export async function POST(request: NextRequest) {
  const ip = extractClientIp(request.headers);

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

  const matchId = body.matchId;
  const name = sanitizeText(body.name, 60);
  const phone = validateAndNormalizePhone(body.contact);
  const slots = body.slots;
  const pin = body.pin;
  const turnstileToken =
    typeof body.turnstileToken === 'string' ? body.turnstileToken.trim() : '';

  if (
    !isValidUuid(matchId) ||
    !name ||
    !phone.valid ||
    typeof slots !== 'number' ||
    !Number.isInteger(slots) ||
    slots < 1 ||
    slots > 4 ||
    !isValidPin(pin)
  ) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }

  // Verify Turnstile FIRST before writing request_log or hitting DB
  if (!turnstileToken) {
    return NextResponse.json({ error: 'turnstile_required' }, { status: 400 });
  }
  const turnstileOk = await verifyTurnstileToken(turnstileToken, ip);
  if (!turnstileOk) {
    return NextResponse.json({ error: 'turnstile_failed' }, { status: 403 });
  }

  const idempotencyKey = request.headers.get('idempotency-key');
  if (!isValidUuidV4(idempotencyKey)) {
    return NextResponse.json({ error: 'invalid_idempotency_key' }, { status: 400 });
  }

  try {
    const admin = createAdminClient();

    // Check idempotency hit
    const { data: existingIdem } = await admin
      .from('request_idempotency')
      .select('registration_id')
      .eq('key', idempotencyKey)
      .maybeSingle();

    if (existingIdem?.registration_id) {
      const { data: existingReg } = await admin
        .from('registrations')
        .select('id, match_id, access_token, payment_code, status, amount_due, expires_at')
        .eq('id', existingIdem.registration_id)
        .maybeSingle();

      if (existingReg) {
        const resolvedHost = await resolveMatchHostPayment(admin, existingReg.match_id);
        const paymentBundle =
          existingReg.status === 'pending_payment'
            ? buildHostPaymentClientBundle(
                existingReg.amount_due,
                existingReg.payment_code,
                resolvedHost
              )
            : {
                qrUrl: null,
                transferContent: existingReg.payment_code,
                paymentInfo: null,
              };
        const response = NextResponse.json(
          {
            registration_id: existingReg.id,
            payment_code: existingReg.payment_code,
            transfer_content: paymentBundle.transferContent,
            status: existingReg.status,
            amount_due: existingReg.amount_due,
            expires_at: existingReg.expires_at,
            qr_url: paymentBundle.qrUrl,
            payment_info: paymentBundle.paymentInfo,
          },
          { status: 200 }
        );
        response.cookies.set(`kt_${existingReg.id}`, existingReg.access_token, {
          httpOnly: true,
          secure: true,
          sameSite: 'lax',
          path: '/',
          maxAge: 2592000,
        });
        return response;
      }
    }

    // Rate limiting via request_log
    const normIp = normalizeIpForDb(ip);
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const oneMinAgo = new Date(Date.now() - 60 * 1000).toISOString();
    const contactAction = `book:${hashContactKey(phone.normalizedLast9)}`;

    const [ip10m, ip1m, contact10m] = await Promise.all([
      admin
        .from('request_log')
        .select('id', { count: 'exact', head: true })
        .eq('normalized_ip', normIp)
        .gte('created_at', tenMinAgo),
      admin
        .from('request_log')
        .select('id', { count: 'exact', head: true })
        .eq('normalized_ip', normIp)
        .gte('created_at', oneMinAgo),
      admin
        .from('request_log')
        .select('id', { count: 'exact', head: true })
        .eq('action', contactAction)
        .gte('created_at', tenMinAgo),
    ]);

    if (
      (ip10m.count ?? 0) >= 20 ||
      (ip1m.count ?? 0) >= 2 ||
      (contact10m.count ?? 0) >= 5
    ) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
    }

    await admin.from('request_log').insert({
      ip,
      normalized_ip: normIp,
      action: contactAction,
    });

    // Execute atomic book_slots RPC
    const { data, error } = await admin.rpc('book_slots', {
      p_match_id: matchId,
      p_name: name,
      p_contact: phone.sanitized,
      p_slots: slots,
      p_pin: pin,
      p_ip: ip,
    });

    if (error || !data || !Array.isArray(data) || data.length === 0) {
      const mapped = mapBookError(error?.message ?? '');
      return NextResponse.json({ error: mapped.code }, { status: mapped.status });
    }

    const row = data[0] as {
      id: string;
      access_token: string;
      payment_code: string;
      status: string;
      amount_due: number;
      expires_at: string | null;
    };

    await admin
      .from('request_idempotency')
      .upsert(
        { key: idempotencyKey, registration_id: row.id },
        { onConflict: 'key' }
      );

    const resolvedHost = await resolveMatchHostPayment(admin, matchId);
    const paymentBundle =
      row.status === 'pending_payment'
        ? buildHostPaymentClientBundle(row.amount_due, row.payment_code, resolvedHost)
        : {
            qrUrl: null,
            transferContent: row.payment_code,
            paymentInfo: null,
          };

    const response = NextResponse.json(
      {
        registration_id: row.id,
        payment_code: row.payment_code,
        transfer_content: paymentBundle.transferContent,
        status: row.status,
        amount_due: row.amount_due,
        expires_at: row.expires_at,
        qr_url: paymentBundle.qrUrl,
        payment_info: paymentBundle.paymentInfo,
      },
      { status: 201 }
    );

    response.cookies.set(`kt_${row.id}`, row.access_token, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 2592000,
    });

    return response;
  } catch {
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
