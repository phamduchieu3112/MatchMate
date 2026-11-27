import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  findHostsByWebhookApiKey,
  getHostPaymentConfigs,
  normalizeHostEmail,
  type HostPaymentConfig,
} from '@/lib/host-payment-config';
import { resolveMatchHostPayment } from '@/lib/sepay';
import {
  extractPaymentCode,
  normalizeBankAccount,
  validateSePayPayload,
  type SePayWebhookPayload,
} from '@/lib/validation';

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

  const allConfigs = getHostPaymentConfigs();
  if (Object.keys(allConfigs).length === 0) {
    return NextResponse.json({ error: 'payment_not_configured' }, { status: 503 });
  }

  // Optional ?host=<email> scoping for dedicated per-host webhook URLs
  const hostQuery = normalizeHostEmail(request.nextUrl.searchParams.get('host'));
  const candidateConfigs = hostQuery
    ? allConfigs[hostQuery]
      ? { [hostQuery]: allConfigs[hostQuery] }
      : {}
    : allConfigs;

  const authHeader = request.headers.get('authorization');
  const authenticatedHosts = findHostsByWebhookApiKey(authHeader, candidateConfigs);
  if (authenticatedHosts.length === 0) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  // Match the incoming transfer's bank account / subAccount against the authenticated host(s)
  let matchedHost: HostPaymentConfig | null = null;
  let validatedData: SePayWebhookPayload | null = null;
  let lastValidationError = 'account_mismatch';

  for (const host of authenticatedHosts) {
    const check = validateSePayPayload(parsedJson, host.accountNumber);
    if (check.ok) {
      matchedHost = host;
      validatedData = check.data;
      break;
    }
    lastValidationError = check.error;
  }

  if (!matchedHost || !validatedData) {
    return NextResponse.json({ error: lastValidationError }, { status: 400 });
  }

  try {
    const admin = createAdminClient();

    // Cross-host isolation: if a payment code matches a registration, verify that
    // the transfer landed in the bank account belonging to that match's host.
    const extractedCode = extractPaymentCode(validatedData.content);
    if (extractedCode) {
      const { data: regRow } = await admin
        .from('registrations')
        .select('match_id')
        .eq('payment_code', extractedCode)
        .maybeSingle();

      const matchId = (regRow as { match_id?: string } | null)?.match_id;
      if (matchId) {
        const expectedHost = await resolveMatchHostPayment(admin, matchId);
        if (expectedHost.config) {
          const sameHostEmail = expectedHost.config.email === matchedHost.email;
          const sameAccount =
            normalizeBankAccount(expectedHost.config.accountNumber) ===
            normalizeBankAccount(matchedHost.accountNumber);

          if (!sameHostEmail && !sameAccount) {
            return NextResponse.json(
              { error: 'host_account_mismatch' },
              { status: 409 }
            );
          }
        }
      }
    }

    const { data, error } = await admin.rpc('apply_payment', {
      p_txn_id: validatedData.id,
      p_amount: validatedData.transferAmount,
      p_content: validatedData.content,
      p_raw: parsedJson,
    });

    if (error) {
      return NextResponse.json({ error: 'db_error' }, { status: 500 });
    }

    return NextResponse.json(
      {
        success: true,
        result: (data as { result?: string } | null)?.result ?? 'ok',
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
