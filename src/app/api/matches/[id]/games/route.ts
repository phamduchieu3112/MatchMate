import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';
import { enforceRateLimits, normalizeIpForRateLimit } from '@/lib/rate-limit';
import {
  computeGameWinner,
  expandRosterToSelectablePlayers,
  sanitizeSetScores,
  validateGamePlayers,
} from '@/lib/scoreboard';
import { authorizeMatchScoreboardAccess } from '@/lib/scoreboard-auth';
import type { GameFormat, ScorePlayerRef } from '@/lib/types';
import { extractClientIp, isValidUuid, verifyHostOrigin } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return NextResponse.json({ games: [] }, { status: 200 });
  }

  try {
    const supabase = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase
      .from('match_games')
      .select(
        'id, match_id, format, team_a_players, team_b_players, sets, winner, status, created_at, completed_at'
      )
      .eq('match_id', id)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ games: [] }, { status: 200 });
    }

    return NextResponse.json({ games: data ?? [] }, { status: 200 });
  } catch {
    return NextResponse.json({ games: [] }, { status: 200 });
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!verifyHostOrigin(request.headers)) {
    return NextResponse.json({ error: 'invalid_origin' }, { status: 403 });
  }

  const { id } = await context.params;
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
    const normIp = normalizeIpForRateLimit(extractClientIp(request.headers));
    const rateLimitRes = await enforceRateLimits(admin, [
      { key: `games_write:ip:${normIp}`, limit: 40, windowSeconds: 60 },
    ]);
    if (rateLimitRes) return rateLimitRes;
  } catch {
    return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  }

  const auth = await authorizeMatchScoreboardAccess(request, admin, id);
  if (!auth.authorized) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
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

  const format =
    body.format === 'singles' || body.format === 'doubles'
      ? (body.format as GameFormat)
      : null;
  if (!format) {
    return NextResponse.json({ error: 'invalid_format' }, { status: 400 });
  }

  const rawTeamA = Array.isArray(body.teamA) ? (body.teamA as ScorePlayerRef[]) : [];
  const rawTeamB = Array.isArray(body.teamB) ? (body.teamB as ScorePlayerRef[]) : [];
  const sets = sanitizeSetScores(body.sets ?? [{ a: 0, b: 0 }]);
  if (!sets) {
    return NextResponse.json({ error: 'invalid_sets' }, { status: 400 });
  }

  const dbClient = auth.hostSupabase ?? admin;

  const { data: confirmedRegs } = await dbClient
    .from('registrations')
    .select('id, display_name, slots, status')
    .eq('match_id', id)
    .eq('status', 'confirmed');

  const allowedPlayers = expandRosterToSelectablePlayers(
    (confirmedRegs ?? []) as Array<{
      id: string;
      display_name: string;
      slots: number;
      status: string;
    }>,
    ['confirmed']
  );

  const playerCheck = validateGamePlayers(format, rawTeamA, rawTeamB, allowedPlayers);
  if (!playerCheck.valid) {
    return NextResponse.json(
      { error: playerCheck.error ?? 'invalid_players' },
      { status: 400 }
    );
  }

  const cleanTeamA = rawTeamA.map((p) => ({
    key: p.key.trim(),
    name: p.name.trim(),
    registrationId: p.registrationId,
  }));
  const cleanTeamB = rawTeamB.map((p) => ({
    key: p.key.trim(),
    name: p.name.trim(),
    registrationId: p.registrationId,
  }));

  const completeNow = body.complete === true;
  const winner = completeNow ? computeGameWinner(sets) : null;
  const status = completeNow ? 'completed' : 'in_progress';
  const completedAt = completeNow ? new Date().toISOString() : null;

  const { data: created, error } = await dbClient
    .from('match_games')
    .insert({
      match_id: id,
      format,
      team_a_players: cleanTeamA,
      team_b_players: cleanTeamB,
      sets,
      winner,
      status,
      completed_at: completedAt,
    })
    .select(
      'id, match_id, format, team_a_players, team_b_players, sets, winner, status, created_at, completed_at'
    )
    .single();

  if (error || !created) {
    return NextResponse.json(
      { error: 'create_failed', code: error?.code },
      { status: 400 }
    );
  }

  return NextResponse.json({ game: created }, { status: 201 });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (!verifyHostOrigin(request.headers)) {
    return NextResponse.json({ error: 'invalid_origin' }, { status: 403 });
  }

  const { id } = await context.params;
  if (!isValidUuid(id)) {
    return NextResponse.json({ error: 'invalid_id' }, { status: 400 });
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
    const normIp = normalizeIpForRateLimit(extractClientIp(request.headers));
    const rateLimitRes = await enforceRateLimits(admin, [
      { key: `games_write:ip:${normIp}`, limit: 40, windowSeconds: 60 },
    ]);
    if (rateLimitRes) return rateLimitRes;
  } catch {
    return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  }

  const auth = await authorizeMatchScoreboardAccess(request, admin, id);
  if (!auth.authorized) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
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

  if (body.action !== 'bulk_finish' || !Array.isArray(body.items)) {
    return NextResponse.json({ error: 'invalid_action' }, { status: 400 });
  }

  if (body.items.length === 0 || body.items.length > 50) {
    return NextResponse.json({ error: 'invalid_items' }, { status: 400 });
  }

  const dbClient = auth.hostSupabase ?? admin;
  const { data: ongoingRows } = await dbClient
    .from('match_games')
    .select('id, status')
    .eq('match_id', id)
    .eq('status', 'in_progress');

  const ongoingSet = new Set(
    ((ongoingRows ?? []) as Array<{ id: string }>).map((g) => g.id)
  );

  const finishedIds: string[] = [];
  const skipped: Array<{ gameId: string; reason: string }> = [];
  const completedAt = new Date().toISOString();

  for (const rawItem of body.items) {
    if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) {
      skipped.push({ gameId: '', reason: 'invalid_item' });
      continue;
    }
    const item = rawItem as { gameId?: unknown; sets?: unknown };
    const gameId = typeof item.gameId === 'string' ? item.gameId.trim() : '';
    if (!isValidUuid(gameId) || !ongoingSet.has(gameId)) {
      skipped.push({ gameId, reason: 'not_in_progress' });
      continue;
    }

    const sets = sanitizeSetScores(item.sets);
    if (!sets) {
      skipped.push({ gameId, reason: 'invalid_sets' });
      continue;
    }

    const hasScore = sets.some((s) => s.a > 0 || s.b > 0);
    const winner = computeGameWinner(sets);
    if (!hasScore || winner === 'draw') {
      skipped.push({ gameId, reason: 'tied_or_empty' });
      continue;
    }

    const { error: updErr } = await dbClient
      .from('match_games')
      .update({
        sets,
        status: 'completed',
        winner,
        completed_at: completedAt,
      })
      .eq('id', gameId)
      .eq('match_id', id)
      .eq('status', 'in_progress');

    if (updErr) {
      skipped.push({ gameId, reason: 'update_failed' });
    } else {
      finishedIds.push(gameId);
      ongoingSet.delete(gameId);
    }
  }

  return NextResponse.json(
    { ok: true, finishedIds, skipped },
    { status: 200 }
  );
}
