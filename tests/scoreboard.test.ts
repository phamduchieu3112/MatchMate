import { describe, expect, it } from 'vitest';
import {
  computeGameWinner,
  computeLeaderboard,
  expandRosterToSelectablePlayers,
  sanitizeSetScores,
  validateGamePlayers,
} from '@/lib/scoreboard';
import type { MatchGameRecord } from '@/lib/types';

describe('On-court mini scoreboard logic', () => {
  const roster = expandRosterToSelectablePlayers(
    [
      { id: 'r1', display_name: 'An, Bình', slots: 2, status: 'confirmed' },
      { id: 'r2', display_name: 'Chi', slots: 1, status: 'confirmed' },
      { id: 'r3', display_name: 'Dũng', slots: 1, status: 'confirmed' },
      { id: 'r4', display_name: 'Em (Chờ CK)', slots: 1, status: 'pending_payment' },
    ],
    ['confirmed']
  );

  it('expands only confirmed registrations and splits group names', () => {
    expect(roster.map((p) => p.name)).toEqual(['An', 'Bình', 'Chi', 'Dũng']);
  });

  it('validates singles/doubles counts and rejects duplicate player selection', () => {
    expect(validateGamePlayers('singles', [roster[0]], [roster[1]], roster).valid).toBe(
      true
    );

    // Same player in both teams
    const dupRes = validateGamePlayers('singles', [roster[0]], [roster[0]], roster);
    expect(dupRes.valid).toBe(false);
    expect(dupRes.error).toBe('duplicate_player');

    // Same player twice in doubles
    const dupDoubles = validateGamePlayers(
      'doubles',
      [roster[0], roster[1]],
      [roster[2], roster[0]],
      roster
    );
    expect(dupDoubles.valid).toBe(false);
    expect(dupDoubles.error).toBe('duplicate_player');

    // Valid doubles 2v2
    expect(
      validateGamePlayers(
        'doubles',
        [roster[0], roster[1]],
        [roster[2], roster[3]],
        roster
      ).valid
    ).toBe(true);
  });

  it('computes winner, leaderboard stats, point differential, and MVP', () => {
    const sets = sanitizeSetScores([
      { a: 21, b: 15 },
      { a: 21, b: 18 },
    ]);
    expect(sets).not.toBeNull();
    expect(computeGameWinner(sets!)).toBe('A');

    const games: MatchGameRecord[] = [
      {
        id: 'g1',
        match_id: 'm1',
        format: 'doubles',
        team_a_players: [roster[0], roster[1]],
        team_b_players: [roster[2], roster[3]],
        sets: [{ a: 21, b: 15 }],
        winner: 'A',
        status: 'completed',
        created_at: '2026-12-01T10:00:00Z',
        completed_at: '2026-12-01T10:20:00Z',
      },
      {
        id: 'g2',
        match_id: 'm1',
        format: 'singles',
        team_a_players: [roster[0]],
        team_b_players: [roster[2]],
        sets: [{ a: 21, b: 19 }],
        winner: 'A',
        status: 'completed',
        created_at: '2026-12-01T10:25:00Z',
        completed_at: '2026-12-01T10:40:00Z',
      },
    ];

    const board = computeLeaderboard(games);
    expect(board[0].name).toBe('An');
    expect(board[0].isMvp).toBe(true);
    expect(board[0].wins).toBe(2);
    expect(board[0].winRate).toBe(100);
    expect(board[0].pointDiff).toBe(8);
  });
});
