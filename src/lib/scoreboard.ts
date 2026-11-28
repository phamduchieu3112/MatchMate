import { splitParticipantNames } from '@/lib/ui-helpers';
import type {
  GameFormat,
  GameWinner,
  MatchGameRecord,
  PlayerLeaderboardRow,
  ScorePlayerRef,
  SetScore,
} from '@/lib/types';

/**
 * Expands confirmed/active registrations into individual selectable players.
 * Group bookings with comma-separated display names are split into distinct entries.
 */
export function expandRosterToSelectablePlayers(
  registrations: Array<{
    id?: string;
    display_name: string;
    slots: number;
    status: string;
  }>,
  allowedStatuses: string[] = ['confirmed']
): ScorePlayerRef[] {
  const players: ScorePlayerRef[] = [];
  const seenKeys = new Set<string>();

  for (let regIdx = 0; regIdx < registrations.length; regIdx += 1) {
    const reg = registrations[regIdx];
    if (!allowedStatuses.includes(reg.status)) continue;

    const regKeyPrefix = reg.id ?? `row-${regIdx}`;
    const rawParts = splitParticipantNames(reg.display_name);

    const names = rawParts.length > 0 ? rawParts : [reg.display_name.trim()];

    for (let idx = 0; idx < names.length; idx += 1) {
      const name = names[idx];
      if (!name) continue;
      const key = `${regKeyPrefix}::${idx}::${name.toLowerCase()}`;
      if (seenKeys.has(key)) continue;
      seenKeys.add(key);
      players.push({
        key,
        name,
        registrationId: reg.id,
      });
    }
  }

  return players;
}

/**
 * Validates game lineup counts (1v1 for singles, 2v2 for doubles) and strictly
 * prevents duplicate player selection within the same game.
 */
export function validateGamePlayers(
  format: GameFormat,
  teamA: ScorePlayerRef[],
  teamB: ScorePlayerRef[],
  allowedPlayers?: ScorePlayerRef[]
): { valid: boolean; error?: string } {
  const expectedPerTeam = format === 'singles' ? 1 : 2;
  if (teamA.length !== expectedPerTeam || teamB.length !== expectedPerTeam) {
    return { valid: false, error: 'invalid_player_count' };
  }

  const allSelected = [...teamA, ...teamB];
  const seenKeys = new Set<string>();
  const seenNames = new Set<string>();
  const allowedKeySet = allowedPlayers
    ? new Set(allowedPlayers.map((p) => p.key))
    : null;
  const allowedNameSet = allowedPlayers
    ? new Set(allowedPlayers.map((p) => p.name.trim().toLowerCase()))
    : null;

  for (const player of allSelected) {
    const cleanKey = typeof player.key === 'string' ? player.key.trim() : '';
    const cleanName = typeof player.name === 'string' ? player.name.trim() : '';
    if (!cleanKey || !cleanName) {
      return { valid: false, error: 'invalid_player' };
    }

    const normName = cleanName.toLowerCase();
    if (seenKeys.has(cleanKey) || seenNames.has(normName)) {
      return { valid: false, error: 'duplicate_player' };
    }
    seenKeys.add(cleanKey);
    seenNames.add(normName);

    if (
      allowedKeySet &&
      allowedNameSet &&
      !allowedKeySet.has(cleanKey) &&
      !allowedNameSet.has(normName)
    ) {
      return { valid: false, error: 'player_not_confirmed' };
    }
  }

  return { valid: true };
}

/**
 * Validates and normalizes set scores (non-negative integers <= 99).
 */
export function sanitizeSetScores(rawSets: unknown): SetScore[] | null {
  if (!Array.isArray(rawSets) || rawSets.length === 0 || rawSets.length > 5) {
    return null;
  }

  const out: SetScore[] = [];
  for (const entry of rawSets) {
    if (!entry || typeof entry !== 'object') return null;
    const rec = entry as Record<string, unknown>;
    const a = Number(rec.a);
    const b = Number(rec.b);
    if (
      !Number.isInteger(a) ||
      !Number.isInteger(b) ||
      a < 0 ||
      a > 99 ||
      b < 0 ||
      b > 99
    ) {
      return null;
    }
    out.push({ a, b });
  }
  return out;
}

/**
 * Determines game winner from set scores (best-of sets; falls back to total points if tied).
 */
export function computeGameWinner(sets: SetScore[]): Exclude<GameWinner, null> {
  if (sets.length === 0) return 'draw';

  let setsA = 0;
  let setsB = 0;
  let ptsA = 0;
  let ptsB = 0;

  for (const s of sets) {
    ptsA += s.a;
    ptsB += s.b;
    if (s.a > s.b) setsA += 1;
    else if (s.b > s.a) setsB += 1;
  }

  if (setsA > setsB) return 'A';
  if (setsB > setsA) return 'B';
  if (ptsA > ptsB) return 'A';
  if (ptsB > ptsA) return 'B';
  return 'draw';
}

/**
 * Computes per-player session standings and marks the session MVP (requires >= 1 completed game).
 */
export function computeLeaderboard(
  games: MatchGameRecord[]
): PlayerLeaderboardRow[] {
  const statsMap = new Map<
    string,
    {
      key: string;
      name: string;
      gamesPlayed: number;
      wins: number;
      losses: number;
      draws: number;
      pointsFor: number;
      pointsAgainst: number;
    }
  >();

  const ensurePlayer = (player: ScorePlayerRef) => {
    const idKey = player.name.trim().toLowerCase();
    const existing = statsMap.get(idKey);
    if (existing) return existing;
    const created = {
      key: player.key || idKey,
      name: player.name.trim(),
      gamesPlayed: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      pointsFor: 0,
      pointsAgainst: 0,
    };
    statsMap.set(idKey, created);
    return created;
  };

  for (const game of games) {
    if (game.status !== 'completed') continue;

    let ptsA = 0;
    let ptsB = 0;
    for (const s of game.sets) {
      ptsA += s.a;
      ptsB += s.b;
    }

    const winner = game.winner ?? computeGameWinner(game.sets);

    for (const p of game.team_a_players) {
      const row = ensurePlayer(p);
      row.gamesPlayed += 1;
      row.pointsFor += ptsA;
      row.pointsAgainst += ptsB;
      if (winner === 'A') row.wins += 1;
      else if (winner === 'B') row.losses += 1;
      else row.draws += 1;
    }

    for (const p of game.team_b_players) {
      const row = ensurePlayer(p);
      row.gamesPlayed += 1;
      row.pointsFor += ptsB;
      row.pointsAgainst += ptsA;
      if (winner === 'B') row.wins += 1;
      else if (winner === 'A') row.losses += 1;
      else row.draws += 1;
    }
  }

  const rows: PlayerLeaderboardRow[] = Array.from(statsMap.values()).map((r) => {
    const winRate =
      r.gamesPlayed > 0 ? Math.round((r.wins / r.gamesPlayed) * 100) : 0;
    return {
      key: r.key,
      name: r.name,
      gamesPlayed: r.gamesPlayed,
      wins: r.wins,
      losses: r.losses,
      draws: r.draws,
      winRate,
      pointsFor: r.pointsFor,
      pointsAgainst: r.pointsAgainst,
      pointDiff: r.pointsFor - r.pointsAgainst,
      isMvp: false,
    };
  });

  rows.sort((a, b) => {
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (b.winRate !== a.winRate) return b.winRate - a.winRate;
    if (b.pointDiff !== a.pointDiff) return b.pointDiff - a.pointDiff;
    if (b.pointsFor !== a.pointsFor) return b.pointsFor - a.pointsFor;
    return a.name.localeCompare(b.name, 'vi');
  });

  if (rows.length > 0 && rows[0].wins > 0) {
    rows[0].isMvp = true;
  }

  return rows;
}
