import { redirect } from 'next/navigation';
import {
  createServerSupabaseClient,
  getAuthenticatedHost,
} from '@/lib/supabase/server';
import {
  resolveHostPaymentConfig,
  toPublicHostPaymentDetails,
} from '@/lib/host-payment-config';
import { aggregateClubWallet } from '@/lib/split-bill';
import type {
  ClubWalletEntry,
  HostMatchSummary,
  HostUnpaidDeficitItem,
  PublicMatch,
} from '@/lib/types';
import { HostDashboardClient } from '@/components/host/HostDashboardClient';

export const dynamic = 'force-dynamic';

export default async function HostDashboardPage() {
  const { user, isHost } = await getAuthenticatedHost();
  if (!user || !isHost) {
    redirect('/host/login');
  }

  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from('matches')
    .select(
      'id, short_code, sport, title, starts_at, location_name, map_url, level, fee_per_slot, max_slots, courts, court_numbers, lock_at, cancel_cutoff_hours, hold_minutes, status, slots_taken, notes, created_at'
    )
    .order('starts_at', { ascending: false })
    .limit(50);

  const rawMatches = (data ?? []) as PublicMatch[];
  const matchIds = rawMatches.map((m) => m.id);
  const matchById = new Map(rawMatches.map((m) => [m.id, m]));

  const [regsRes, settlementsRes, walletRes, notifRes] = await Promise.all([
    matchIds.length > 0
      ? supabase
          .from('registrations')
          .select('id, match_id, slots, status, amount_paid')
          .in('match_id', matchIds)
      : Promise.resolve({ data: [] }),
    matchIds.length > 0
      ? supabase
          .from('match_settlements')
          .select(
            'id, match_id, player_name, contact_normalized, net_balance, settlement_type, status'
          )
          .in('match_id', matchIds)
      : Promise.resolve({ data: [] }),
    supabase
      .from('club_wallet_ledger')
      .select(
        'id, contact_normalized, player_name, match_id, settlement_id, delta_amount, note, created_at'
      )
      .eq('host_id', user.id)
      .order('created_at', { ascending: false })
      .limit(500),
    supabase
      .from('host_notification_settings')
      .select('telegram_enabled, discord_enabled, zalo_enabled')
      .eq('host_id', user.id)
      .maybeSingle(),
  ]);

  const regs = (regsRes.data ?? []) as Array<{
    id: string;
    match_id: string;
    slots: number;
    status: string;
    amount_paid: number;
  }>;

  const regIds = regs.map((r) => r.id);
  const regToMatch = new Map(regs.map((r) => [r.id, r.match_id]));

  const refundsRes =
    regIds.length > 0
      ? await supabase
          .from('refunds')
          .select('id, registration_id, status')
          .in('registration_id', regIds)
          .in('status', ['pending', 'pending_review'])
      : { data: [] };

  const confirmedSlotsByMatch = new Map<string, number>();
  const waitlistByMatch = new Map<string, number>();
  const collectedByMatch = new Map<string, number>();

  for (const r of regs) {
    if (r.status === 'confirmed') {
      confirmedSlotsByMatch.set(
        r.match_id,
        (confirmedSlotsByMatch.get(r.match_id) ?? 0) + (r.slots || 0)
      );
    } else if (r.status === 'waitlisted') {
      waitlistByMatch.set(
        r.match_id,
        (waitlistByMatch.get(r.match_id) ?? 0) + 1
      );
    }
    if ((r.amount_paid || 0) > 0 && r.status !== 'cancelled') {
      collectedByMatch.set(
        r.match_id,
        (collectedByMatch.get(r.match_id) ?? 0) + r.amount_paid
      );
    }
  }

  const pendingRefundsByMatch = new Map<string, number>();
  for (const rf of (refundsRes.data ?? []) as Array<{
    id: string;
    registration_id: string;
  }>) {
    const mid = regToMatch.get(rf.registration_id);
    if (!mid) continue;
    pendingRefundsByMatch.set(mid, (pendingRefundsByMatch.get(mid) ?? 0) + 1);
  }

  const unpaidDeficitsByMatch = new Map<string, number>();
  const unpaidDeficits: HostUnpaidDeficitItem[] = [];
  for (const s of (settlementsRes.data ?? []) as Array<{
    id: string;
    match_id: string;
    player_name: string;
    net_balance: number;
    settlement_type: string;
    status: string;
  }>) {
    if (s.settlement_type === 'deficit' && s.net_balance > 0) {
      if (s.status === 'paid') {
        collectedByMatch.set(
          s.match_id,
          (collectedByMatch.get(s.match_id) ?? 0) + s.net_balance
        );
      } else if (s.status === 'unpaid') {
        unpaidDeficitsByMatch.set(
          s.match_id,
          (unpaidDeficitsByMatch.get(s.match_id) ?? 0) + 1
        );
        const matchInfo = matchById.get(s.match_id);
        unpaidDeficits.push({
          id: s.id,
          match_id: s.match_id,
          match_title: matchInfo?.title ?? '',
          short_code: matchInfo?.short_code ?? '',
          player_name: s.player_name,
          net_balance: s.net_balance,
        });
      }
    }
  }

  const matches: HostMatchSummary[] = rawMatches.map((m) => ({
    ...m,
    confirmed_slots: confirmedSlotsByMatch.get(m.id) ?? 0,
    waitlist_count: waitlistByMatch.get(m.id) ?? 0,
    collected_amount: collectedByMatch.get(m.id) ?? 0,
    pending_refunds_count: pendingRefundsByMatch.get(m.id) ?? 0,
    unpaid_deficits_count: unpaidDeficitsByMatch.get(m.id) ?? 0,
  }));

  const walletSummaries = aggregateClubWallet(
    (walletRes.data ?? []) as ClubWalletEntry[]
  ).filter((w) => w.balance !== 0);

  const notifRow = notifRes.data as {
    telegram_enabled?: boolean;
    discord_enabled?: boolean;
    zalo_enabled?: boolean;
  } | null;
  const hasActiveNotifications = Boolean(
    notifRow?.telegram_enabled ||
      notifRow?.discord_enabled ||
      notifRow?.zalo_enabled
  );

  const resolvedPayment = resolveHostPaymentConfig(user.email);
  const publicPayment = toPublicHostPaymentDetails(
    resolvedPayment.config,
    resolvedPayment.isFallback
  );

  return (
    <HostDashboardClient
      matches={matches}
      walletSummaries={walletSummaries}
      unpaidDeficits={unpaidDeficits}
      hasActiveNotifications={hasActiveNotifications}
      hostPaymentStatus={{
        email: user.email ?? '',
        isConfigured: resolvedPayment.isConfigured,
        isFallback: resolvedPayment.isFallback,
        paymentInfo: publicPayment,
      }}
    />
  );
}
