import { notFound, redirect } from 'next/navigation';
import {
  createServerSupabaseClient,
  getAuthenticatedHost,
} from '@/lib/supabase/server';
import { isValidUuid } from '@/lib/validation';
import {
  MatchDetailTabs,
  type HostMatchRow,
  type HostPaymentRow,
  type HostRefundRow,
  type HostRegistrationRow,
} from '@/components/host/MatchDetailTabs';

export const dynamic = 'force-dynamic';

export default async function HostMatchDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [{ user, isHost }, { id }] = await Promise.all([
    getAuthenticatedHost(),
    params,
  ]);
  if (!user || !isHost) {
    redirect('/host/login');
  }

  if (!isValidUuid(id)) {
    notFound();
  }

  const supabase = await createServerSupabaseClient();

  // Fetch match, registrations, and unmatched payments in parallel
  const baseMatchCols =
    'id, short_code, sport, title, starts_at, location_name, map_url, level, fee_per_slot, max_slots, courts, court_numbers, lock_at, cancel_cutoff_hours, hold_minutes, status, slots_taken, notes, court_fee_total, shuttle_fee_total, created_at';

  const [matchRes, extrasRes, surchargeRes, regsRes, regGendersRes, unmatchedRes] =
    await Promise.all([
      supabase.from('matches').select(baseMatchCols).eq('id', id).single(),
      supabase
        .from('matches')
        .select('extras_fee_total, shuttle_count')
        .eq('id', id)
        .maybeSingle(),
      supabase
        .from('matches')
        .select('male_surcharge_percent')
        .eq('id', id)
        .maybeSingle(),
      supabase
        .from('registrations')
        .select(
          'id, match_id, display_name, contact, slots, status, payment_code, amount_due, amount_paid, payment_method, expires_at, checked_in, created_at, cancelled_at, promoted_at'
        )
        .eq('match_id', id)
        .order('created_at', { ascending: true }),
      supabase
        .from('registrations')
        .select('id, slot_genders')
        .eq('match_id', id),
      supabase
        .from('payments')
        .select(
          'id, sepay_transaction_id, registration_id, amount, content, received_at, result'
        )
        .is('registration_id', null)
        .order('received_at', { ascending: false })
        .limit(20),
    ]);

  if (!matchRes.data) {
    notFound();
  }

  const extrasData = (extrasRes.data as {
    extras_fee_total?: number;
    shuttle_count?: number;
  } | null) ?? { extras_fee_total: 0, shuttle_count: 0 };

  const surchargeData = surchargeRes.data as {
    male_surcharge_percent?: number;
  } | null;

  const matchWithExtras: HostMatchRow = {
    ...(matchRes.data as HostMatchRow),
    extras_fee_total: extrasData.extras_fee_total ?? 0,
    shuttle_count: extrasData.shuttle_count ?? 0,
    male_surcharge_percent: surchargeData?.male_surcharge_percent ?? 0,
  };

  const genderMap = new Map(
    (
      (regGendersRes.data ?? []) as Array<{
        id: string;
        slot_genders?: Array<'male' | 'female'> | null;
      }>
    ).map((g) => [g.id, g.slot_genders ?? null])
  );

  const registrations: HostRegistrationRow[] = (
    (regsRes.data ?? []) as HostRegistrationRow[]
  ).map((r) => ({
    ...r,
    slot_genders: genderMap.get(r.id) ?? null,
  }));
  const regIds = registrations.map((r) => r.id);

  const [paymentsRes, refundsRes] =
    regIds.length > 0
      ? await Promise.all([
          supabase
            .from('payments')
            .select(
              'id, sepay_transaction_id, registration_id, amount, content, received_at, result'
            )
            .in('registration_id', regIds)
            .order('received_at', { ascending: false }),
          supabase
            .from('refunds')
            .select(
              'id, registration_id, amount, reason, status, account_info, done_at, note, created_at'
            )
            .in('registration_id', regIds)
            .order('created_at', { ascending: false }),
        ])
      : [{ data: [] }, { data: [] }];

  return (
    <MatchDetailTabs
      match={matchWithExtras}
      registrations={registrations}
      payments={(paymentsRes.data ?? []) as HostPaymentRow[]}
      unmatchedPayments={(unmatchedRes.data ?? []) as HostPaymentRow[]}
      refunds={(refundsRes.data ?? []) as HostRefundRow[]}
      siteUrl={process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}
    />
  );
}
