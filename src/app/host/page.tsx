import { redirect } from 'next/navigation';
import {
  createServerSupabaseClient,
  getAuthenticatedHost,
} from '@/lib/supabase/server';
import type { PublicMatch } from '@/lib/types';
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
      'id, short_code, sport, title, starts_at, location_name, map_url, level, fee_per_slot, max_slots, courts, lock_at, cancel_cutoff_hours, hold_minutes, status, slots_taken, notes, created_at'
    )
    .order('starts_at', { ascending: false })
    .limit(50);

  return <HostDashboardClient matches={(data ?? []) as PublicMatch[]} />;
}
