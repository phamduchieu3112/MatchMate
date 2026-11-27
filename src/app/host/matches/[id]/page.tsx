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
  const { user, isHost } = await getAuthenticatedHost();
  if (!user || !isHost) {
    redirect('/host/login');
  }

  const { id } = await params;
  if (!isValidUuid(id)) {
    notFound();
  }

  const supabase = await createServerSupabaseClient();
  const { data: match } = await supabase
    .from('matches')
    .select(
      'id, short_code, sport, title, starts_at, location_name, map_url, level, fee_per_slot, max_slots, courts, lock_at, cancel_cutoff_hours, hold_minutes, status, slots_taken, notes, court_fee_total, shuttle_fee_total, created_at'
    )
    .eq('id', id)
    .single();

  if (!match) {
    notFound();
  }

  const { data: registrations } = await supabase
    .from('registrations')
    .select(
      'id, match_id, display_name, contact, slots, status, payment_code, amount_due, amount_paid, payment_method, expires_at, checked_in, created_at, cancelled_at, promoted_at'
    )
    .eq('match_id', id)
    .order('created_at', { ascending: true });

  const regIds = (registrations ?? []).map((r) => r.id);

  const [paymentsRes, unmatchedRes, refundsRes] = await Promise.all([
    regIds.length > 0
      ? supabase
          .from('payments')
          .select(
            'id, sepay_transaction_id, registration_id, amount, content, received_at, result'
          )
          .in('registration_id', regIds)
          .order('received_at', { ascending: false })
      : Promise.resolve({ data: [] }),
    supabase
      .from('payments')
      .select(
        'id, sepay_transaction_id, registration_id, amount, content, received_at, result'
      )
      .is('registration_id', null)
      .order('received_at', { ascending: false })
      .limit(20),
    regIds.length > 0
      ? supabase
          .from('refunds')
          .select(
            'id, registration_id, amount, reason, status, account_info, done_at, note, created_at'
          )
          .in('registration_id', regIds)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  return (
    <MatchDetailTabs
      match={match as HostMatchRow}
      registrations={(registrations ?? []) as HostRegistrationRow[]}
      payments={(paymentsRes.data ?? []) as HostPaymentRow[]}
      unmatchedPayments={(unmatchedRes.data ?? []) as HostPaymentRow[]}
      refunds={(refundsRes.data ?? []) as HostRefundRow[]}
      siteUrl={process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'}
    />
  );
}
