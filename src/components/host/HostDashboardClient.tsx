'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  CopyPlus,
  ExternalLink,
  LogOut,
  Plus,
} from 'lucide-react';
import { useLocale } from '@/lib/i18n/LocaleProvider';
import { translateMatchStatus } from '@/lib/i18n/helpers';
import { formatMatchDateTime, formatVnd } from '@/lib/format';
import type { PublicMatch } from '@/lib/types';
import { MatchMateLogo } from '@/components/MatchMateLogo';

export function HostDashboardClient({ matches }: { matches: PublicMatch[] }) {
  const { locale, t } = useLocale();
  const router = useRouter();
  const [cloningId, setCloningId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const handleLogout = async () => {
    await fetch('/api/host/logout', { method: 'POST' });
    router.push('/host/login');
    router.refresh();
  };

  const handleClone = async (matchId: string) => {
    setError('');
    setCloningId(matchId);
    try {
      const res = await fetch(`/api/host/matches/${matchId}/clone`, {
        method: 'POST',
      });
      if (!res.ok) {
        setError(t('errGeneric'));
        setCloningId(null);
        return;
      }
      const created = (await res.json()) as { id: string };
      router.push(`/host/matches/${created.id}`);
      router.refresh();
    } catch {
      setError(t('errGeneric'));
      setCloningId(null);
    }
  };

  const openCount = matches.filter((m) => m.status === 'open').length;
  const totalSlotsTaken = matches.reduce((acc, m) => acc + m.slots_taken, 0);

  const statusBadgeClass = (status: string) => {
    switch (status) {
      case 'open':
        return 'bg-emerald-500/15 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-400';
      case 'locked':
        return 'bg-amber-500/15 text-amber-700 dark:bg-amber-400/15 dark:text-amber-400';
      case 'cancelled':
        return 'bg-rose-500/15 text-rose-700 dark:bg-rose-400/15 dark:text-rose-400';
      default:
        return 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300';
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <MatchMateLogo variant="icon" size="sm" />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-extrabold uppercase tracking-tight text-zinc-950 dark:text-white sm:text-2xl">
                {t('hostDashboardTitle')}
              </h1>
              <span className="rounded-md bg-zinc-950 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-volt dark:bg-volt dark:text-zinc-950">
                {t('hostBadge')}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/host/new"
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-volt px-4 text-xs font-extrabold uppercase tracking-wide text-zinc-950 shadow-sm transition hover:bg-volt-hover"
          >
            <Plus className="h-4 w-4 stroke-[2.5]" />
            <span>{t('hostCreateMatch')}</span>
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex h-10 items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3.5 text-xs font-bold text-zinc-700 shadow-sm transition hover:border-zinc-950 hover:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-zinc-600"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>{t('hostLogoutBtn')}</span>
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-volt" />
          <p className="text-center tabular-nums text-2xl font-black text-zinc-950 dark:text-white">
            {matches.length}
          </p>
          <p className="mt-0.5 text-center text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            {t('hostStatTotalMatches')}
          </p>
        </div>
        <div className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-emerald-400" />
          <p className="text-center tabular-nums text-2xl font-black text-zinc-950 dark:text-white">
            {openCount}
          </p>
          <p className="mt-0.5 text-center text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            {t('hostStatOpenMatches')}
          </p>
        </div>
        <div className="relative overflow-hidden rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-volt" />
          <p className="text-center tabular-nums text-2xl font-black text-zinc-950 dark:text-white">
            {totalSlotsTaken}
          </p>
          <p className="mt-0.5 text-center text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            {t('hostStatActiveSlots')}
          </p>
        </div>
      </div>

      {error && (
        <p className="rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
          {error}
        </p>
      )}

      {/* Matches List */}
      {matches.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          {t('hostEmptyMatches')}
        </div>
      ) : (
        <div className="space-y-3">
          {matches.map((m) => {
            const pct =
              m.max_slots > 0
                ? Math.min(100, Math.round((m.slots_taken / m.max_slots) * 100))
                : 0;
            return (
              <div
                key={m.id}
                className="flex flex-col justify-between gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-zinc-950 px-2 py-0.5 font-mono text-xs font-bold text-volt dark:bg-zinc-800">
                      #{m.short_code}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${statusBadgeClass(
                        m.status
                      )}`}
                    >
                      {translateMatchStatus(m.status, t)}
                    </span>
                    <span className="tabular-nums text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                      {m.slots_taken}/{m.max_slots} {t('slotPlural')} ·{' '}
                      {formatVnd(m.fee_per_slot, locale)}
                    </span>
                  </div>

                  <Link
                    href={`/host/matches/${m.id}`}
                    className="block truncate text-base font-extrabold uppercase tracking-tight text-zinc-950 transition hover:text-zinc-600 dark:text-white dark:hover:text-volt"
                  >
                    {m.title}
                  </Link>

                  <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                    {formatMatchDateTime(m.starts_at, locale)} · {m.location_name}
                  </p>

                  <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-zinc-950 dark:bg-volt"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/keo/${m.short_code}`}
                    title={t('hostPublicPageBtn')}
                    className="inline-flex h-9 items-center gap-1 rounded-xl border border-zinc-200 bg-zinc-50 px-3 font-mono text-xs font-bold text-zinc-700 transition hover:border-zinc-950 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-volt"
                  >
                    <span>/keo/{m.short_code}</span>
                    <ExternalLink className="h-3 w-3 opacity-70" />
                  </Link>
                  <button
                    type="button"
                    disabled={cloningId === m.id}
                    onClick={() => void handleClone(m.id)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 text-xs font-bold text-zinc-800 transition hover:border-zinc-950 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-volt"
                  >
                    <CopyPlus className="h-3.5 w-3.5" />
                    <span>{t('hostCloneNextWeek')}</span>
                  </button>
                  <Link
                    href={`/host/matches/${m.id}`}
                    className="inline-flex h-9 items-center gap-1 rounded-xl bg-zinc-950 px-3.5 text-xs font-extrabold uppercase tracking-wide text-volt transition hover:opacity-90 dark:bg-volt dark:text-zinc-950"
                  >
                    <span>{t('hostManageBtn')}</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
