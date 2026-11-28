import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { requireHostMutation } from '@/lib/host-api';
import { buildHostPaymentClientBundle, resolveMatchHostPayment } from '@/lib/sepay';
import {
  aggregateClubWallet,
  calculateSplitBill,
  normalizeSlotGenders,
} from '@/lib/split-bill';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  createServerSupabaseClient,
  getAuthenticatedHost,
} from '@/lib/supabase/server';
import type {
  ClubWalletEntry,
  MatchSettlementRow,
  SlotGender,
} from '@/lib/types';
import { isValidUuid } from '@/lib/validation';

export const dynamic = 'force-dynamic';

const REF_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateSettlementRef(): string {
  const bytes = crypto.randomBytes(6);
  let out = 'BU';
  for (let i = 0; i < 6; i += 1) {
    out += REF_CHARS[bytes[i] % REF_CHARS.length];
  }
  return out;
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { user, isHost } = await getAuthenticatedHost();
  if (!user || !isHost) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const { id } = await context.params;
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }

  try {
    const supabase = await createServerSupabaseClient();
    const admin = createAdminClient();
    const { data: matchRow } = await supabase
      .from('matches')
      .select('id, host_id')
      .eq('id', id)
      .maybeSingle();

    if (!matchRow || (matchRow as { host_id: string }).host_id !== user.id) {
      return NextResponse.json({ error: 'match_not_found' }, { status: 404 });
    }

    const [settlementRes, regsNameRes, walletRes, resolvedHost] = await Promise.all([
      supabase
        .from('match_settlements')
        .select('*')
        .eq('match_id', id)
        .order('created_at', { ascending: true }),
      supabase
        .from('registrations')
        .select('id, display_name')
        .eq('match_id', id),
      supabase
        .from('club_wallet_ledger')
        .select('*')
        .eq('host_id', user.id)
        .order('created_at', { ascending: false })
        .limit(200),
      resolveMatchHostPayment(admin, id),
    ]);

    const liveNameByRegId = new Map(
      ((regsNameRes.data ?? []) as Array<{ id: string; display_name: string }>).map(
        (r) => [r.id, r.display_name]
      )
    );

    const rawSettlements = (settlementRes.data ?? []) as MatchSettlementRow[];
    const settlements = rawSettlements.map((row) => {
      const liveName = liveNameByRegId.get(row.registration_id) || row.player_name;
      if (row.settlement_type === 'deficit' && row.net_balance > 0 && row.payment_ref) {
        const bundle = buildHostPaymentClientBundle(
          row.net_balance,
          row.payment_ref,
          resolvedHost
        );
        return {
          ...row,
          player_name: liveName,
          qr_url: bundle.qrUrl,
          transfer_content: bundle.transferContent,
        };
      }
      return {
        ...row,
        player_name: liveName,
        qr_url: null,
        transfer_content: row.payment_ref,
      };
    });

    const walletEntries = (walletRes.data ?? []) as ClubWalletEntry[];
    const walletSummaries = aggregateClubWallet(walletEntries);

    return NextResponse.json(
      {
        settlements,
        walletSummaries,
        walletEntries: walletEntries.slice(0, 30),
        paymentInfo: resolvedHost.config
          ? {
              bankCode: resolvedHost.config.bankCode,
              accountNumber: resolvedHost.config.accountNumber,
              accountName: resolvedHost.config.accountName,
            }
          : null,
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      { settlements: [], walletSummaries: [], walletEntries: [], paymentInfo: null },
      { status: 200 }
    );
  }
}

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

  const courtFee = Number(body.court_fee_total ?? 0);
  const shuttleFee = Number(body.shuttle_fee_total ?? 0);
  const shuttleCount = Number(body.shuttle_count ?? 0);
  const extrasFee = Number(body.extras_fee_total ?? 0);
  const maleSurchargePercent = Number(body.male_surcharge_percent ?? 0);

  if (
    !Number.isInteger(courtFee) ||
    courtFee < 0 ||
    courtFee > 100_000_000 ||
    !Number.isInteger(shuttleFee) ||
    shuttleFee < 0 ||
    shuttleFee > 100_000_000 ||
    !Number.isInteger(shuttleCount) ||
    shuttleCount < 0 ||
    shuttleCount > 500 ||
    !Number.isInteger(extrasFee) ||
    extrasFee < 0 ||
    extrasFee > 100_000_000 ||
    !Number.isInteger(maleSurchargePercent) ||
    maleSurchargePercent < 0 ||
    maleSurchargePercent > 200
  ) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: matchRow } = await auth.supabase
    .from('matches')
    .select('id, host_id')
    .eq('id', id)
    .maybeSingle();

  if (!matchRow || (matchRow as { host_id: string }).host_id !== auth.user.id) {
    return NextResponse.json({ error: 'match_not_found' }, { status: 404 });
  }

  const { error: matchUpdErr } = await auth.supabase
    .from('matches')
    .update({
      court_fee_total: courtFee,
      shuttle_fee_total: shuttleFee,
      shuttle_count: shuttleCount,
      extras_fee_total: extrasFee,
    })
    .eq('id', id);

  if (matchUpdErr) {
    return NextResponse.json(
      { error: 'update_failed', code: matchUpdErr.code },
      { status: 400 }
    );
  }

  // Persist male_surcharge_percent via admin (gracefully ignores if migration 011 pending)
  await admin
    .from('matches')
    .update({ male_surcharge_percent: maleSurchargePercent })
    .eq('id', id);

  const rawGendersMap =
    body.slot_genders_by_reg &&
    typeof body.slot_genders_by_reg === 'object' &&
    !Array.isArray(body.slot_genders_by_reg)
      ? (body.slot_genders_by_reg as Record<string, unknown>)
      : null;

  const [regsRes, regGendersRes, existingSettlementsRes, resolvedHost] =
    await Promise.all([
      auth.supabase
        .from('registrations')
        .select('id, display_name, contact, slots, amount_paid, status')
        .eq('match_id', id)
        .eq('status', 'confirmed')
        .order('created_at', { ascending: true }),
      admin
        .from('registrations')
        .select('id, slot_genders')
        .eq('match_id', id)
        .eq('status', 'confirmed'),
      auth.supabase.from('match_settlements').select('*').eq('match_id', id),
      resolveMatchHostPayment(admin, id),
    ]);

  const regs = (regsRes.data ?? []) as Array<{
    id: string;
    display_name: string;
    contact: string | null;
    slots: number;
    amount_paid: number;
    status: string;
  }>;

  const dbGendersByReg = new Map(
    (
      (regGendersRes.data ?? []) as Array<{
        id: string;
        slot_genders?: SlotGender[] | null;
      }>
    ).map((r) => [r.id, r.slot_genders ?? null])
  );

  if (rawGendersMap) {
    await Promise.all(
      regs.map(async (r) => {
        if (rawGendersMap[r.id] === undefined) return;
        const normalized = normalizeSlotGenders(rawGendersMap[r.id], r.slots);
        dbGendersByReg.set(r.id, normalized);
        await admin
          .from('registrations')
          .update({ slot_genders: normalized })
          .eq('id', r.id)
          .eq('match_id', id);
      })
    );
  }

  const existingByReg = new Map(
    ((existingSettlementsRes.data ?? []) as MatchSettlementRow[]).map((s) => [
      s.registration_id,
      s,
    ])
  );

  const summary = calculateSplitBill({
    courtFee,
    shuttleFee,
    extrasFee,
    maleSurchargePercent,
    registrations: regs.map((r) => ({
      id: r.id,
      displayName: r.display_name,
      contact: r.contact,
      slots: r.slots,
      slotGenders: normalizeSlotGenders(dbGendersByReg.get(r.id), r.slots),
      amountPaid: r.amount_paid,
      status: r.status,
    })),
    roundTo: 1000,
  });

  const nowIso = new Date().toISOString();
  const rowsToUpsert = summary.items.map((item) => {
    const prev = existingByReg.get(item.registrationId);
    const keepStatus =
      prev &&
      prev.settlement_type === item.settlementType &&
      prev.net_balance === item.netBalance &&
      (prev.status === 'paid' || prev.status === 'credited_wallet')
        ? prev.status
        : item.settlementType === 'settled'
          ? 'settled'
          : 'unpaid';

    const paymentRef =
      item.settlementType === 'deficit'
        ? prev?.payment_ref ?? generateSettlementRef()
        : null;

    return {
      match_id: id,
      registration_id: item.registrationId,
      player_name: item.playerName,
      contact_normalized: item.contactNormalized,
      slots: item.slots,
      deposit_paid: item.depositPaid,
      actual_share: item.actualShare,
      net_balance: item.netBalance,
      settlement_type: item.settlementType,
      status: keepStatus,
      payment_ref: paymentRef,
      paid_at: keepStatus === 'paid' ? prev?.paid_at ?? nowIso : null,
      updated_at: nowIso,
    };
  });

  if (rowsToUpsert.length > 0) {
    const { error: upsertErr } = await auth.supabase
      .from('match_settlements')
      .upsert(rowsToUpsert, { onConflict: 'match_id,registration_id' });

    if (upsertErr) {
      return NextResponse.json(
        { error: 'settlement_save_failed', code: upsertErr.code },
        { status: 400 }
      );
    }
  }

  const { data: savedRows } = await auth.supabase
    .from('match_settlements')
    .select('*')
    .eq('match_id', id)
    .order('created_at', { ascending: true });

  const enriched = ((savedRows ?? []) as MatchSettlementRow[]).map((row) => {
    if (row.settlement_type === 'deficit' && row.net_balance > 0 && row.payment_ref) {
      const bundle = buildHostPaymentClientBundle(
        row.net_balance,
        row.payment_ref,
        resolvedHost
      );
      return {
        ...row,
        qr_url: bundle.qrUrl,
        transfer_content: bundle.transferContent,
      };
    }
    return {
      ...row,
      qr_url: null,
      transfer_content: row.payment_ref,
    };
  });

  return NextResponse.json(
    {
      ok: true,
      summary,
      settlements: enriched,
    },
    { status: 200 }
  );
}
