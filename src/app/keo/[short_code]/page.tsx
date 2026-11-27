import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import type { PublicMatch, PublicParticipantsPayload } from '@/lib/types';
import { isValidShortCode } from '@/lib/validation';
import { formatMatchDateTimeRange } from '@/lib/format';
import { MatchClient } from '@/components/player/MatchClient';

export const revalidate = 30;

const PUBLIC_MATCH_COLUMNS =
  'id, short_code, sport, title, starts_at, location_name, map_url, level, fee_per_slot, max_slots, courts, court_numbers, lock_at, cancel_cutoff_hours, hold_minutes, status, slots_taken, notes, created_at';

async function fetchPublicMatchData(shortCode: string): Promise<{
  match: PublicMatch;
  participants: PublicParticipantsPayload;
} | null> {
  if (!isValidShortCode(shortCode)) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: match, error } = await supabase
    .from('matches')
    .select(PUBLIC_MATCH_COLUMNS)
    .eq('short_code', shortCode.toUpperCase())
    .maybeSingle();

  if (error || !match) return null;

  const { data: participants } = await supabase.rpc('get_public_participants', {
    p_match_id: match.id,
  });

  const fallback: PublicParticipantsPayload = {
    slots_taken: match.slots_taken,
    available_slots: Math.max(match.max_slots - match.slots_taken, 0),
    participants: [],
  };

  return {
    match: match as PublicMatch,
    participants: (participants as PublicParticipantsPayload | null) ?? fallback,
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ short_code: string }>;
}): Promise<Metadata> {
  const { short_code } = await params;
  const result = await fetchPublicMatchData(short_code);

  if (!result) {
    return { title: 'MatchMate' };
  }

  const { match, participants } = result;
  const timeStr = formatMatchDateTimeRange(match.starts_at, match.notes, 'vi');

  const title = `${match.title} · ${timeStr} · còn ${participants.available_slots}/${match.max_slots} chỗ`;
  return {
    title,
    description: `${match.sport} tại ${match.location_name} — ${match.fee_per_slot.toLocaleString('vi-VN')}đ/slot`,
    openGraph: {
      title,
      description: `${match.location_name} · ${participants.available_slots}/${match.max_slots} chỗ trống`,
    },
  };
}

export default async function MatchPage({
  params,
}: {
  params: Promise<{ short_code: string }>;
}) {
  const { short_code } = await params;
  const result = await fetchPublicMatchData(short_code);

  if (!result) {
    notFound();
  }

  return (
    <MatchClient
      initialMatch={result.match}
      initialParticipants={result.participants}
    />
  );
}
