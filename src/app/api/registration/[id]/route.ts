import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  buildHostPaymentClientBundle,
  resolveMatchHostPayment,
} from '@/lib/sepay';
import { isValidUuid } from '@/lib/validation';
import type { MyRegistrationPayload } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(
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

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc('get_my_registration', {
      p_registration_id: id,
      p_access_token: accessToken,
    });

    if (error) {
      return NextResponse.json({ error: 'internal_error' }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const reg = data as MyRegistrationPayload;
    const { data: matchMeta } = await admin
      .from('matches')
      .select('notes')
      .eq('id', reg.match_id)
      .maybeSingle();
    if (matchMeta && reg.match) {
      reg.match.notes = matchMeta.notes ?? null;
    }

    const amountRemaining = Math.max(reg.amount_due - reg.net_paid, 0);

    let qrUrl: string | null = null;
    let transferContent = reg.payment_code;
    let paymentInfo: MyRegistrationPayload['payment_info'] = null;

    if (reg.status === 'pending_payment' && amountRemaining > 0) {
      const resolvedHost = await resolveMatchHostPayment(admin, reg.match_id);
      const bundle = buildHostPaymentClientBundle(
        amountRemaining,
        reg.payment_code,
        resolvedHost
      );
      qrUrl = bundle.qrUrl;
      transferContent = bundle.transferContent;
      paymentInfo = bundle.paymentInfo;
    }

    return NextResponse.json({
      ...reg,
      amount_remaining: amountRemaining,
      qr_url: qrUrl,
      transfer_content: transferContent,
      payment_info: paymentInfo,
    });
  } catch {
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}
