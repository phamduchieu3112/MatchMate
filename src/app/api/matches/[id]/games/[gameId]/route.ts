import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { enforceRateLimits, normalizeIpForRateLimit } from '@/lib/rate-limit';
import { computeGameWinner, sanitizeSetScores } from '@/lib/scoreboard';
import { authorizeMatchScoreboardAccess } from '@/lib/scoreboard-auth';
import { extractClientIp, isValidUuid, verifyHostOrigin } from '@/lib/validation';

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; gameId: string }> }
) {
  if (!verifyHostOrigin(request.headers)) {
    return NextResponse.json({ error: 'invalid_origin' }, { status: 403 });
  }

  const { id, gameId } = await context.params;
  if (!isValidUuid(id) || !isValidUuid(gameId)) {
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

  const { data: existing } = await admin
    .from('match_games')
    .select('id, status, sets')
    .eq('id', gameId)
    .eq('match_id', id)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: 'game_not_found' }, { status: 404 });
  }

  const sets =
    body.sets !== undefined
      ? sanitizeSetScores(body.sets)
      : (existing.sets as Array<{ a: number; b: number }>);

  if (!sets) {
    return NextResponse.json({ error: 'invalid_sets' }, { status: 400 });
  }

  const completeNow = body.complete === true;
  const nextStatus = completeNow
    ? 'completed'
    : body.reopen === true && auth.actor === 'host'
      ? 'in_progress'
      : existing.status;

  if (existing.status === 'completed' && nextStatus === 'completed' && body.sets !== undefined && auth.actor !== 'host') {
    return NextResponse.json({ error: 'game_locked' }, { status: 409 });
  }

  const winner = nextStatus === 'completed' ? computeGameWinner(sets) : null;
  const completedAt =
    nextStatus === 'completed' ? new Date().toISOString() : null;

  const { data: updated, error } = await admin
    .from('match_games')
    .update({
      sets,
      status: nextStatus,
      winner,
      completed_at: completedAt,
    })
    .eq('id', gameId)
    .eq('match_id', id)
    .select(
      'id, match_id, format, team_a_players, team_b_players, sets, winner, status, created_at, completed_at'
    )
    .single();

  if (error || !updated) {
    return NextResponse.json({ error: 'update_failed' }, { status: 400 });
  }

  return NextResponse.json({ game: updated }, { status: 200 });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; gameId: string }> }
) {
  if (!verifyHostOrigin(request.headers)) {
    return NextResponse.json({ error: 'invalid_origin' }, { status: 403 });
  }

  const { id, gameId } = await context.params;
  if (!isValidUuid(id) || !isValidUuid(gameId)) {
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

  const { error } = await admin
    .from('match_games')
    .delete()
    .eq('id', gameId)
    .eq('match_id', id);

  if (error) {
    return NextResponse.json({ error: 'delete_failed' }, { status: 400 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
