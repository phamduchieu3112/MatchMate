'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Award,
  CheckCircle2,
  Download,
  Image as ImageIcon,
  Plus,
  RefreshCw,
  Trash2,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import { useLocale } from '@/lib/i18n/LocaleProvider';
import { NumericInput } from '@/components/ui/NumericInput';
import {
  computeLeaderboard,
  expandRosterToSelectablePlayers,
  validateGamePlayers,
} from '@/lib/scoreboard';
import { downloadDataUrlPng, renderMatchRecapCardPng } from '@/lib/canvas-exports';
import type {
  GameFormat,
  MatchGameRecord,
  ScorePlayerRef,
  SetScore,
} from '@/lib/types';

interface MiniScoreboardTabProps {
  matchId: string;
  shortCode: string;
  matchTitle: string;
  sport: string;
  dateTimeText: string;
  locationName: string;
  participants: Array<{
    id?: string;
    display_name: string;
    slots: number;
    status: string;
  }>;
  isHost?: boolean;
}

export function MiniScoreboardTab({
  matchId,
  shortCode,
  matchTitle,
  sport,
  dateTimeText,
  locationName,
  participants,
  isHost = false,
}: MiniScoreboardTabProps) {
  const { t } = useLocale();
  const [games, setGames] = useState<MatchGameRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Create Game Form
  const [format, setFormat] = useState<GameFormat>('doubles');
  const [teamAKeys, setTeamAKeys] = useState<string[]>(['', '']);
  const [teamBKeys, setTeamBKeys] = useState<string[]>(['', '']);
  const [initialSet, setInitialSet] = useState<SetScore>({ a: 0, b: 0 });

  // Local set score drafts per game
  const [draftSets, setDraftSets] = useState<Record<string, SetScore[]>>({});

  // Recap PNG Modal
  const [recapOpen, setRecapOpen] = useState(false);
  const [recapUrl, setRecapUrl] = useState('');
  const [renderingRecap, setRenderingRecap] = useState(false);

  const confirmedPlayers = useMemo(
    () => expandRosterToSelectablePlayers(participants, ['confirmed']),
    [participants]
  );

  const playerByKey = useMemo(
    () => new Map(confirmedPlayers.map((p) => [p.key, p])),
    [confirmedPlayers]
  );

  const fetchGames = useCallback(async () => {
    try {
      const res = await fetch(`/api/matches/${matchId}/games`, {
        cache: 'no-store',
      });
      if (!res.ok) return;
      const data = (await res.json()) as { games?: MatchGameRecord[] };
      const list = Array.isArray(data.games) ? data.games : [];
      setGames(list);
      setDraftSets((prev) => {
        const next = { ...prev };
        for (const g of list) {
          if (!next[g.id] || g.status === 'completed') {
            next[g.id] = g.sets.length > 0 ? g.sets : [{ a: 0, b: 0 }];
          }
        }
        return next;
      });
    } catch {
      // Ignore transient errors
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  useEffect(() => {
    void fetchGames();
  }, [fetchGames]);

  const slotsPerTeam = format === 'singles' ? 1 : 2;
  const activeTeamAKeys = teamAKeys.slice(0, slotsPerTeam);
  const activeTeamBKeys = teamBKeys.slice(0, slotsPerTeam);

  const allChosenKeys = useMemo(() => {
    const keys = new Set<string>();
    const names = new Set<string>();
    for (const k of [...activeTeamAKeys, ...activeTeamBKeys]) {
      if (!k) continue;
      keys.add(k);
      const p = playerByKey.get(k);
      if (p) names.add(p.name.trim().toLowerCase());
    }
    return { keys, names };
  }, [activeTeamAKeys, activeTeamBKeys, playerByKey]);

  const isPlayerTakenElsewhere = (player: ScorePlayerRef, currentKey: string) => {
    if (player.key === currentKey) return false;
    if (allChosenKeys.keys.has(player.key)) return true;
    return allChosenKeys.names.has(player.name.trim().toLowerCase());
  };

  const handleCreateGame = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const teamA = activeTeamAKeys
      .map((k) => playerByKey.get(k))
      .filter((p): p is ScorePlayerRef => Boolean(p));
    const teamB = activeTeamBKeys
      .map((k) => playerByKey.get(k))
      .filter((p): p is ScorePlayerRef => Boolean(p));

    const check = validateGamePlayers(format, teamA, teamB, confirmedPlayers);
    if (!check.valid) {
      setError(
        check.error === 'duplicate_player'
          ? t('scoreDuplicatePlayerErr')
          : t('scoreNeedConfirmedPlayers')
      );
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/matches/${matchId}/games`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format,
          teamA,
          teamB,
          sets: [initialSet],
          complete: false,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        if (data.error === 'duplicate_player') {
          setError(t('scoreDuplicatePlayerErr'));
        } else if (data.error === 'unauthorized') {
          setError(t('scoreAuthHint'));
        } else {
          setError(t('errGeneric'));
        }
        return;
      }

      setTeamAKeys(['', '']);
      setTeamBKeys(['', '']);
      setInitialSet({ a: 0, b: 0 });
      await fetchGames();
    } catch {
      setError(t('errGeneric'));
    } finally {
      setBusy(false);
    }
  };

  const updateDraftScore = (
    gameId: string,
    setIdx: number,
    side: 'a' | 'b',
    value: number
  ) => {
    const clamped = Math.max(0, Math.min(99, Math.trunc(value)));
    setDraftSets((prev) => {
      const current = [...(prev[gameId] ?? [{ a: 0, b: 0 }])];
      const target = { ...(current[setIdx] ?? { a: 0, b: 0 }) };
      target[side] = clamped;
      current[setIdx] = target;
      return { ...prev, [gameId]: current };
    });
  };

  const addSetToGame = (gameId: string) => {
    setDraftSets((prev) => {
      const current = [...(prev[gameId] ?? [{ a: 0, b: 0 }])];
      if (current.length >= 5) return prev;
      return { ...prev, [gameId]: [...current, { a: 0, b: 0 }] };
    });
  };

  const saveGameProgress = async (gameId: string, complete: boolean) => {
    setError('');
    setBusy(true);
    try {
      const sets = draftSets[gameId] ?? [{ a: 0, b: 0 }];
      const res = await fetch(`/api/matches/${matchId}/games/${gameId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sets, complete }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error === 'unauthorized' ? t('scoreAuthHint') : t('errGeneric'));
        return;
      }
      await fetchGames();
    } catch {
      setError(t('errGeneric'));
    } finally {
      setBusy(false);
    }
  };

  const deleteGame = async (gameId: string) => {
    setError('');
    setBusy(true);
    try {
      const res = await fetch(`/api/matches/${matchId}/games/${gameId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        setError(t('scoreAuthHint'));
        return;
      }
      await fetchGames();
    } catch {
      setError(t('errGeneric'));
    } finally {
      setBusy(false);
    }
  };

  const leaderboard = useMemo(() => computeLeaderboard(games), [games]);
  const mvp = useMemo(
    () => leaderboard.find((row) => row.isMvp) ?? null,
    [leaderboard]
  );

  const handleOpenRecap = async () => {
    setRecapOpen(true);
    setRenderingRecap(true);
    try {
      const url = await renderMatchRecapCardPng({
        matchTitle,
        sport,
        shortCode,
        dateTimeText,
        locationName,
        totalGames: games.filter((g) => g.status === 'completed').length,
        leaderboard,
        mvp,
      });
      setRecapUrl(url);
    } catch {
      setRecapUrl('');
    } finally {
      setRenderingRecap(false);
    }
  };

  const minRequiredPlayers = format === 'singles' ? 2 : 4;
  const hasEnoughPlayers = confirmedPlayers.length >= minRequiredPlayers;

  return (
    <div className="w-full min-w-0 max-w-full space-y-5">
      {/* Live Leaderboard & Recap CTA */}
      <section className="min-w-0 max-w-full overflow-hidden rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Trophy className="h-5 w-5 shrink-0 text-zinc-950 dark:text-volt" />
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-zinc-950 dark:text-white">
              {t('scoreLeaderboardTitle')}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void fetchGames()}
              aria-label={t('refresh')}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-600 transition hover:border-zinc-950 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-volt"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => void handleOpenRecap()}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-volt px-3.5 text-xs font-extrabold uppercase tracking-wide text-zinc-950 shadow-sm transition hover:bg-volt-hover"
            >
              <ImageIcon className="h-4 w-4 shrink-0" />
              <span>{t('scoreCreateRecapBtn')}</span>
            </button>
          </div>
        </div>

        {mvp && (
          <div className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-2xl border border-volt/50 bg-zinc-950 px-4 py-3 text-white">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-volt text-zinc-950">
                <Award className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-extrabold uppercase tracking-widest text-volt">
                  ★ {t('scoreMvpBadge')}
                </p>
                <p className="truncate text-sm font-black">{mvp.name}</p>
              </div>
            </div>
            <div className="shrink-0 text-right tabular-nums text-xs">
              <p className="font-black text-volt">{mvp.winRate}% WIN</p>
              <p className="text-zinc-400">
                {mvp.wins}T - {mvp.losses}B ({mvp.pointDiff >= 0 ? '+' : ''}
                {mvp.pointDiff})
              </p>
            </div>
          </div>
        )}

        {leaderboard.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-dashed border-zinc-200 p-4 text-center text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            {t('scoreNoGamesYet')}
          </p>
        ) : (
          <div className="mt-4 max-w-full overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-200 text-[11px] font-extrabold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                  <th className="py-2 pr-2">#</th>
                  <th className="py-2 pr-2">{t('scoreColPlayer')}</th>
                  <th className="py-2 px-2 text-center">{t('scoreColGames')}</th>
                  <th className="py-2 px-2 text-center">{t('scoreColWL')}</th>
                  <th className="py-2 px-2 text-right">{t('scoreColWinRate')}</th>
                  <th className="py-2 pl-2 text-right">{t('scoreColDiff')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                {leaderboard.map((row, idx) => (
                  <tr key={row.key}>
                    <td className="py-2.5 pr-2 font-mono font-black text-zinc-500 dark:text-zinc-400">
                      {idx + 1}
                    </td>
                    <td className="py-2.5 pr-2 font-bold text-zinc-950 dark:text-white">
                      <span className="inline-flex items-center gap-1.5">
                        <span>{row.name}</span>
                        {row.isMvp && (
                          <span className="rounded bg-volt px-1.5 py-0.5 text-[10px] font-black text-zinc-950">
                            MVP
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-center tabular-nums font-semibold text-zinc-700 dark:text-zinc-300">
                      {row.gamesPlayed}
                    </td>
                    <td className="py-2.5 px-2 text-center tabular-nums font-semibold text-zinc-700 dark:text-zinc-300">
                      {row.wins}-{row.losses}
                    </td>
                    <td className="py-2.5 px-2 text-right tabular-nums font-extrabold text-zinc-950 dark:text-volt">
                      {row.winRate}%
                    </td>
                    <td
                      className={`py-2.5 pl-2 text-right tabular-nums font-extrabold ${
                        row.pointDiff >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {row.pointDiff >= 0 ? '+' : ''}
                      {row.pointDiff}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Create New Game Card */}
      <section className="min-w-0 max-w-full overflow-hidden rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-zinc-950 dark:text-volt" />
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-zinc-950 dark:text-white">
              {t('scoreNewGameTitle')}
            </h2>
          </div>

          <div className="inline-flex rounded-full border border-zinc-200 bg-zinc-50 p-0.5 dark:border-zinc-800 dark:bg-zinc-950">
            <button
              type="button"
              onClick={() => setFormat('singles')}
              className={`rounded-full px-3 py-1 text-xs font-extrabold transition ${
                format === 'singles'
                  ? 'bg-volt text-zinc-950'
                  : 'text-zinc-600 dark:text-zinc-400'
              }`}
            >
              {t('scoreFormatSingles')}
            </button>
            <button
              type="button"
              onClick={() => setFormat('doubles')}
              className={`rounded-full px-3 py-1 text-xs font-extrabold transition ${
                format === 'doubles'
                  ? 'bg-volt text-zinc-950'
                  : 'text-zinc-600 dark:text-zinc-400'
              }`}
            >
              {t('scoreFormatDoubles')}
            </button>
          </div>
        </div>

        {!isHost && (
          <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
            {t('scoreAuthHint')}
          </p>
        )}

        {!hasEnoughPlayers ? (
          <p className="mt-4 rounded-2xl border border-dashed border-zinc-300 p-4 text-center text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            {t('scoreNeedConfirmedPlayers')}
          </p>
        ) : (
          <form onSubmit={handleCreateGame} className="mt-4 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {/* Team A */}
              <div className="space-y-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
                <p className="text-xs font-extrabold uppercase tracking-wider text-zinc-950 dark:text-volt">
                  {t('scoreTeamA')}
                </p>
                {Array.from({ length: slotsPerTeam }, (_, idx) => {
                  const val = activeTeamAKeys[idx] ?? '';
                  return (
                    <select
                      key={`a-${idx}`}
                      required
                      value={val}
                      onChange={(e) => {
                        const next = [...teamAKeys];
                        next[idx] = e.target.value;
                        setTeamAKeys(next);
                      }}
                      aria-label={`${t('scoreTeamA')} ${t('scorePlayerSlot', { index: idx + 1 })}`}
                      className="h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-950 outline-none focus:border-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:focus:border-volt"
                    >
                      <option value="">
                        {t('scorePlayerSlot', { index: idx + 1 })}
                      </option>
                      {confirmedPlayers.map((p) => (
                        <option
                          key={p.key}
                          value={p.key}
                          disabled={isPlayerTakenElsewhere(p, val)}
                        >
                          {p.name}
                        </option>
                      ))}
                    </select>
                  );
                })}
              </div>

              {/* Team B */}
              <div className="space-y-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
                <p className="text-xs font-extrabold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                  {t('scoreTeamB')}
                </p>
                {Array.from({ length: slotsPerTeam }, (_, idx) => {
                  const val = activeTeamBKeys[idx] ?? '';
                  return (
                    <select
                      key={`b-${idx}`}
                      required
                      value={val}
                      onChange={(e) => {
                        const next = [...teamBKeys];
                        next[idx] = e.target.value;
                        setTeamBKeys(next);
                      }}
                      aria-label={`${t('scoreTeamB')} ${t('scorePlayerSlot', { index: idx + 1 })}`}
                      className="h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-950 outline-none focus:border-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:focus:border-volt"
                    >
                      <option value="">
                        {t('scorePlayerSlot', { index: idx + 1 })}
                      </option>
                      {confirmedPlayers.map((p) => (
                        <option
                          key={p.key}
                          value={p.key}
                          disabled={isPlayerTakenElsewhere(p, val)}
                        >
                          {p.name}
                        </option>
                      ))}
                    </select>
                  );
                })}
              </div>
            </div>

            {error && (
              <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-volt text-sm font-extrabold uppercase tracking-wide text-zinc-950 shadow-sm transition hover:bg-volt-hover disabled:opacity-60"
            >
              <Plus className="h-4 w-4 stroke-[2.5]" />
              <span>{t('scoreCreateGameBtn')}</span>
            </button>
          </form>
        )}
      </section>

      {/* Recorded / Live Games List */}
      {!loading && games.length > 0 && (
        <div className="space-y-3">
          {games.map((game) => {
            const currentSets = draftSets[game.id] ?? game.sets;
            const isCompleted = game.status === 'completed';

            return (
              <div
                key={game.id}
                className="min-w-0 max-w-full overflow-hidden rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-zinc-950 px-2.5 py-0.5 text-[10px] font-extrabold uppercase text-volt dark:bg-zinc-800">
                      {game.format === 'singles' ? '1v1' : '2v2'}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                        isCompleted
                          ? 'bg-emerald-500/15 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-400'
                          : 'bg-amber-500/15 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300'
                      }`}
                    >
                      {isCompleted
                        ? game.winner === 'draw'
                          ? t('scoreDraw')
                          : t('scoreWinTeam', { team: game.winner ?? '' })
                        : t('scoreInProgressBadge')}
                    </span>
                  </div>

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void deleteGame(game.id)}
                    aria-label={t('scoreDeleteGame')}
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-zinc-200 px-2 text-xs font-bold text-zinc-500 hover:border-rose-400 hover:text-rose-600 dark:border-zinc-800 dark:text-zinc-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Teams Banner */}
                <div className="mt-3 grid grid-cols-11 items-center gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950">
                  <div className="col-span-5 min-w-0 text-left">
                    <p className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-500">
                      {t('scoreTeamA')}
                    </p>
                    <p className="mt-0.5 break-words text-sm font-extrabold text-zinc-950 dark:text-white">
                      {game.team_a_players.map((p) => p.name).join(' / ')}
                    </p>
                  </div>
                  <div className="col-span-1 text-center text-xs font-black text-zinc-400">
                    VS
                  </div>
                  <div className="col-span-5 min-w-0 text-right">
                    <p className="text-[10px] font-extrabold uppercase tracking-wider text-zinc-500">
                      {t('scoreTeamB')}
                    </p>
                    <p className="mt-0.5 break-words text-sm font-extrabold text-zinc-950 dark:text-white">
                      {game.team_b_players.map((p) => p.name).join(' / ')}
                    </p>
                  </div>
                </div>

                {/* Set Score Touch Controls */}
                <div className="mt-3 space-y-2.5">
                  {currentSets.map((set, sIdx) => (
                    <div
                      key={sIdx}
                      className="flex flex-col items-center gap-2 rounded-2xl border border-zinc-200/80 bg-zinc-50/70 px-2.5 py-2.5 dark:border-zinc-800 dark:bg-zinc-950/60 sm:flex-row sm:justify-between sm:px-3 sm:py-2"
                    >
                      <span className="text-[11px] font-extrabold uppercase tracking-wider text-zinc-500">
                        {t('scoreSetLabel', { index: sIdx + 1 })}
                      </span>

                      <div className="flex w-full max-w-full items-center justify-center gap-1.5 sm:w-auto sm:flex-1 sm:gap-2">
                        {/* Side A */}
                        <div className="flex items-center gap-1">
                          {(!isCompleted || isHost) && (
                            <button
                              type="button"
                              onClick={() =>
                                updateDraftScore(game.id, sIdx, 'a', set.a - 1)
                              }
                              className="inline-flex h-9 w-8 items-center justify-center rounded-xl border border-zinc-300 bg-white text-base font-black text-zinc-800 active:scale-95 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white min-[360px]:w-9 sm:h-11 sm:w-11 sm:text-lg"
                            >
                              −
                            </button>
                          )}
                          <NumericInput
                            min={0}
                            max={99}
                            disabled={isCompleted && !isHost}
                            value={set.a}
                            onValueChange={(next) =>
                              updateDraftScore(game.id, sIdx, 'a', next)
                            }
                            aria-label={`${t('scoreTeamA')} ${t('scoreSetLabel', { index: sIdx + 1 })}`}
                            className="h-9 w-10 rounded-xl border border-zinc-300 bg-white text-center font-mono text-lg font-black tabular-nums text-zinc-950 outline-none focus:border-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-volt min-[360px]:w-11 sm:h-11 sm:w-14 sm:text-xl"
                          />
                          {(!isCompleted || isHost) && (
                            <button
                              type="button"
                              onClick={() =>
                                updateDraftScore(game.id, sIdx, 'a', set.a + 1)
                              }
                              className="inline-flex h-9 w-8 items-center justify-center rounded-xl bg-volt text-base font-black text-zinc-950 active:scale-95 min-[360px]:w-9 sm:h-11 sm:w-11 sm:text-lg"
                            >
                              +
                            </button>
                          )}
                        </div>

                        <span className="font-mono text-base font-black text-zinc-400 sm:text-lg">
                          :
                        </span>

                        {/* Side B */}
                        <div className="flex items-center gap-1">
                          {(!isCompleted || isHost) && (
                            <button
                              type="button"
                              onClick={() =>
                                updateDraftScore(game.id, sIdx, 'b', set.b - 1)
                              }
                              className="inline-flex h-9 w-8 items-center justify-center rounded-xl border border-zinc-300 bg-white text-base font-black text-zinc-800 active:scale-95 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white min-[360px]:w-9 sm:h-11 sm:w-11 sm:text-lg"
                            >
                              −
                            </button>
                          )}
                          <NumericInput
                            min={0}
                            max={99}
                            disabled={isCompleted && !isHost}
                            value={set.b}
                            onValueChange={(next) =>
                              updateDraftScore(game.id, sIdx, 'b', next)
                            }
                            aria-label={`${t('scoreTeamB')} ${t('scoreSetLabel', { index: sIdx + 1 })}`}
                            className="h-9 w-10 rounded-xl border border-zinc-300 bg-white text-center font-mono text-lg font-black tabular-nums text-zinc-950 outline-none focus:border-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-volt min-[360px]:w-11 sm:h-11 sm:w-14 sm:text-xl"
                          />
                          {(!isCompleted || isHost) && (
                            <button
                              type="button"
                              onClick={() =>
                                updateDraftScore(game.id, sIdx, 'b', set.b + 1)
                              }
                              className="inline-flex h-9 w-8 items-center justify-center rounded-xl bg-volt text-base font-black text-zinc-950 active:scale-95 min-[360px]:w-9 sm:h-11 sm:w-11 sm:text-lg"
                            >
                              +
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {(!isCompleted || isHost) && (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    {currentSets.length < 5 ? (
                      <button
                        type="button"
                        onClick={() => addSetToGame(game.id)}
                        className="h-10 rounded-xl border border-zinc-300 bg-white px-3 text-xs font-bold text-zinc-700 transition hover:border-zinc-950 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-volt"
                      >
                        {t('scoreAddSet')}
                      </button>
                    ) : (
                      <span />
                    )}

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void saveGameProgress(game.id, true)}
                      className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-zinc-950 px-4 text-xs font-extrabold uppercase tracking-wide text-volt transition hover:opacity-90 disabled:opacity-60 dark:bg-volt dark:text-zinc-950"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      <span>{t('scoreFinishGame')}</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Match Recap Card PNG Modal */}
      {recapOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/80 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setRecapOpen(false);
          }}
        >
          <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900 sm:rounded-3xl">
            <div className="flex items-center justify-between border-b border-zinc-200 pb-3 dark:border-zinc-800">
              <h3 className="text-base font-extrabold uppercase tracking-tight text-zinc-950 dark:text-white">
                {t('scoreRecapModalTitle')}
              </h3>
              <button
                type="button"
                onClick={() => setRecapOpen(false)}
                aria-label={t('close')}
                className="rounded-full border border-zinc-200 p-1.5 text-zinc-500 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4">
              {renderingRecap ? (
                <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-zinc-300 text-xs text-zinc-500 dark:border-zinc-700">
                  ...
                </div>
              ) : recapUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={recapUrl}
                  alt={t('scoreRecapModalTitle')}
                  className="w-full rounded-2xl border border-zinc-800 shadow-lg"
                />
              ) : (
                <p className="text-xs text-rose-500">{t('errGeneric')}</p>
              )}
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setRecapOpen(false)}
                className="h-11 flex-1 rounded-xl border border-zinc-300 text-xs font-bold uppercase text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
              >
                {t('close')}
              </button>
              <button
                type="button"
                disabled={!recapUrl}
                onClick={() =>
                  downloadDataUrlPng(recapUrl, `matchmate-${shortCode}-recap.png`)
                }
                className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-volt text-xs font-extrabold uppercase tracking-wide text-zinc-950 disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                <span>{t('scoreRecapDownloadPng')}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
