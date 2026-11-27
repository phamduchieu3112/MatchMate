import { NextRequest, NextResponse } from 'next/server';
import { generateShortCode, requireHostMutation } from '@/lib/host-api';
import { isValidUuid } from '@/lib/validation';

function addSevenDaysIso(iso: string): string {
  const date = new Date(iso);
  return new Date(date.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
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

  const { data: source, error: fetchErr } = await auth.supabase
    .from('matches')
    .select(
      'sport, title, starts_at, location_name, map_url, level, fee_per_slot, max_slots, courts, court_numbers, lock_at, cancel_cutoff_hours, hold_minutes, notes'
    )
    .eq('id', id)
    .single();

  if (fetchErr || !source) {
    return NextResponse.json({ error: 'match_not_found' }, { status: 404 });
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data, error } = await auth.supabase
      .from('matches')
      .insert({
        short_code: generateShortCode(),
        sport: source.sport,
        title: source.title,
        starts_at: addSevenDaysIso(source.starts_at),
        location_name: source.location_name,
        map_url: source.map_url,
        level: source.level,
        fee_per_slot: source.fee_per_slot,
        max_slots: source.max_slots,
        courts: source.courts,
        court_numbers: source.court_numbers,
        lock_at: addSevenDaysIso(source.lock_at),
        cancel_cutoff_hours: source.cancel_cutoff_hours,
        hold_minutes: source.hold_minutes,
        notes: source.notes,
        court_fee_total: 0,
        shuttle_fee_total: 0,
      })
      .select('id, short_code')
      .single();

    if (!error && data) {
      return NextResponse.json(data, { status: 201 });
    }
    if (error?.code !== '23505') {
      return NextResponse.json({ error: 'clone_failed' }, { status: 400 });
    }
  }

  return NextResponse.json({ error: 'short_code_exhausted' }, { status: 500 });
}
