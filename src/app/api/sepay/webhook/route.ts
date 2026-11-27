import { NextRequest, NextResponse } from 'next/server';
import { dispatchHostNotification } from '@/lib/notifications';
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

    // Check for post-match split-bill top-up reference (BU[A-Z0-9]{6})
    const settlementRef = extractPaymentCode(validatedData.content, 'BU');
    if (settlementRef) {
      const { data: settlementRow } = await admin
        .from('match_settlements')
        .select('id, match_id, registration_id, player_name, slots, net_balance, status')
        .eq('payment_ref', settlementRef)
        .maybeSingle();

      if (settlementRow) {
        const sRow = settlementRow as {
          id: string;
          match_id: string;
          registration_id: string;
          player_name: string;
          slots: number;
          net_balance: number;
          status: string;
        };

        // Record idempotently in payments so retries don't double-process
        const { data: insertedPay } = await admin
          .from('payments')
          .insert({
            sepay_transaction_id: validatedData.id,
            registration_id: sRow.registration_id,
            amount: validatedData.transferAmount,
            content: validatedData.content,
            raw: parsedJson,
            result:
              validatedData.transferAmount >= sRow.net_balance ? 'exact' : 'underpaid',
          })
          .select('id')
          .maybeSingle();

        if (!insertedPay) {
          return NextResponse.json(
            { success: true, result: 'duplicate' },
            { status: 200 }
          );
        }

        if (sRow.status === 'unpaid' && validatedData.transferAmount >= sRow.net_balance) {
          const nowIso = new Date().toISOString();
          await admin
            .from('match_settlements')
            .update({ status: 'paid', paid_at: nowIso, updated_at: nowIso })
            .eq('id', sRow.id);
        }

        const { data: mRow } = await admin
          .from('matches')
          .select('host_id, title, short_code')
          .eq('id', sRow.match_id)
          .maybeSingle();

        if (mRow) {
          const m = mRow as { host_id: string; title: string; short_code: string };
          await dispatchHostNotification(admin, m.host_id, {
            type: 'payment',
            matchTitle: m.title,
            shortCode: m.short_code,
            playerName: sRow.player_name,
            slots: sRow.slots,
            amountVnd: validatedData.transferAmount,
            detail: `Thanh toán bù tiền sau buổi chơi (${settlementRef})`,
          });
        }

        return NextResponse.json(
          { success: true, result: 'settlement_paid' },
          { status: 200 }
        );
      }
    }

    // Cross-host isolation: if a payment code matches a registration, verify that
    // the transfer landed in the bank account belonging to that match's host.
    const extractedCode = extractPaymentCode(validatedData.content);
    let matchedMatchId: string | null = null;
    if (extractedCode) {
      const { data: regRow } = await admin
        .from('registrations')
        .select('match_id')
        .eq('payment_code', extractedCode)
        .maybeSingle();

      const matchId = (regRow as { match_id?: string } | null)?.match_id;
      if (matchId) {
        matchedMatchId = matchId;
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

    const paymentResult = (data as { result?: string; registration_id?: string } | null) ?? {};
    if (paymentResult.result && paymentResult.result !== 'duplicate') {
      const targetMatchId = matchedMatchId;
      let playerName: string | undefined;
      let slots: number | undefined;
      let resolvedMatchId = targetMatchId;

      if (paymentResult.registration_id) {
        const { data: regInfo } = await admin
          .from('registrations')
          .select('match_id, display_name, slots')
          .eq('id', paymentResult.registration_id)
          .maybeSingle();
        if (regInfo) {
          const ri = regInfo as { match_id: string; display_name: string; slots: number };
          resolvedMatchId = ri.match_id;
          playerName = ri.display_name;
          slots = ri.slots;
        }
      }

      if (resolvedMatchId) {
        const { data: mInfo } = await admin
          .from('matches')
          .select('host_id, title, short_code')
          .eq('id', resolvedMatchId)
          .maybeSingle();
        if (mInfo) {
          const mi = mInfo as { host_id: string; title: string; short_code: string };
          await dispatchHostNotification(admin, mi.host_id, {
            type: 'payment',
            matchTitle: mi.title,
            shortCode: mi.short_code,
            playerName,
            slots,
            amountVnd: validatedData.transferAmount,
            detail: `Kết quả: ${paymentResult.result}${extractedCode ? ` · Mã ${extractedCode}` : ''}`,
          });
        }
      }
    }

    return NextResponse.json(
      {
        success: true,
        result: paymentResult.result ?? 'ok',
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
