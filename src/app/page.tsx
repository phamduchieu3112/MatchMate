import { createClient } from '@supabase/supabase-js';
import type { PublicMatch } from '@/lib/types';
import { HomeDiscoveryClient } from '@/components/player/HomeDiscoveryClient';

export const revalidate = 30;

const PUBLIC_MATCH_COLUMNS =
  'id, short_code, sport, title, starts_at, location_name, map_url, level, fee_per_slot, max_slots, courts, court_numbers, lock_at, cancel_cutoff_hours, hold_minutes, status, slots_taken, notes, created_at';

async function fetchUpcomingMatches(): Promise<PublicMatch[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return [];

  try {
    const supabase = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const cutoffIso = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from('matches')
      .select(PUBLIC_MATCH_COLUMNS)
      .in('status', ['open', 'locked'])
      .gte('starts_at', cutoffIso)
      .order('starts_at', { ascending: true })
      .limit(40);

    if (error || !data) return [];
    return data as PublicMatch[];
  } catch {
    return [];
  }
}

export default async function HomePage() {
  const matches = await fetchUpcomingMatches();
  return <HomeDiscoveryClient initialMatches={matches} />;
}
