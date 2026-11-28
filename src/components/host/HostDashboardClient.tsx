'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CopyPlus,
  Landmark,
  LogOut,
  MoreHorizontal,
  Plus,
  Search,
  Share2,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import { useLocale } from '@/lib/i18n/LocaleProvider';
import { translateMatchStatus } from '@/lib/i18n/helpers';
import { formatMatchDateTimeRange, formatVnd } from '@/lib/format';
import type {
  ClubWalletSummary,
  HostMatchSummary,
  HostUnpaidDeficitItem,
  PublicMatch,
} from '@/lib/types';
import { DeleteMatchModal } from '@/components/host/DeleteMatchModal';
import { NotificationSettingsModal } from '@/components/host/NotificationSettingsModal';
import { ShareMatchModal } from '@/components/host/ShareMatchModal';

export interface HostPaymentStatusProp {
  email: string;
  isConfigured: boolean;
  isFallback: boolean;
  paymentInfo: {
    bankCode: string;
    accountNumber: string;
    accountName: string;
    transferPrefix: string;
    isFallback: boolean;
  } | null;
}

export function HostDashboardClient({
  matches,
  walletSummaries = [],
  unpaidDeficits = [],
  hasActiveNotifications = false,
  hostPaymentStatus,
}: {
  matches: HostMatchSummary[];
  walletSummaries?: ClubWalletSummary[];
  unpaidDeficits?: HostUnpaidDeficitItem[];
  hasActiveNotifications?: boolean;
  hostPaymentStatus?: HostPaymentStatusProp;
}) {
  const { locale, t } = useLocale();
  const router = useRouter();
  const [matchList, setMatchList] = useState<HostMatchSummary[]>(matches);
  const [cloningId, setCloningId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PublicMatch | null>(null);
  const [shareTarget, setShareTarget] = useState<PublicMatch | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [walletOpen, setWalletOpen] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'upcoming' | 'past' | 'all'>(() => {
    const now = Date.now();
    const hasUpcoming = matches.some(
      (m) =>
        m.status !== 'finished' &&
        m.status !== 'cancelled' &&
        new Date(m.starts_at).getTime() >= now - 4 * 60 * 60 * 1000
    );
    return hasUpcoming ? 'upcoming' : 'all';
  });

  const menuContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMatchList(matches);
  }, [matches]);

  useEffect(() => {
    if (!openMenuId) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (
        menuContainerRef.current &&
        !menuContainerRef.current.contains(e.target as Node)
      ) {
        setOpenMenuId(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenuId(null);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openMenuId]);

  const handleLogout = async () => {
    await fetch('/api/host/logout', { method: 'POST' });
    router.push('/host/login');
    router.refresh();
  };

  const handleClone = async (matchId: string) => {
    setError('');
    setOpenMenuId(null);
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

  const openCount = matchList.filter((m) => m.status === 'open').length;
  const totalConfirmedSlots = matchList.reduce(
    (acc, m) => acc + (m.confirmed_slots ?? 0),
    0
  );
  const totalCollected = matchList.reduce(
    (acc, m) => acc + (m.collected_amount ?? 0),
    0
  );
  const totalActionRequired = matchList.reduce(
    (acc, m) =>
      acc + (m.pending_refunds_count ?? 0) + (m.unpaid_deficits_count ?? 0),
    0
  );

  const filteredMatches = useMemo(() => {
    const now = Date.now();
    const q = searchQuery.trim().toLowerCase().replace(/^#/, '');

    return matchList.filter((m) => {
      const startMs = new Date(m.starts_at).getTime();
      const isPast =
        m.status === 'finished' ||
        m.status === 'cancelled' ||
        startMs < now - 4 * 60 * 60 * 1000;

      if (filterTab === 'upcoming' && isPast) return false;
      if (filterTab === 'past' && !isPast) return false;

      if (!q) return true;
      return (
        m.title.toLowerCase().includes(q) ||
        m.location_name.toLowerCase().includes(q) ||
        m.short_code.toLowerCase().includes(q)
      );
    });
  }, [matchList, filterTab, searchQuery]);

  const statusBadgeClass = (status: string, isFullOpen: boolean) => {
    if (isFullOpen) {
      return 'bg-amber-500/20 text-amber-800 dark:bg-amber-400/20 dark:text-amber-300';
    }
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

  const bankCode = hostPaymentStatus?.paymentInfo?.bankCode ?? '';
  const accountName = hostPaymentStatus?.paymentInfo?.accountName ?? '';
  const showDistinctAccountName =
    Boolean(accountName.trim()) &&
    accountName.trim().toLowerCase() !== bankCode.trim().toLowerCase();

  const walletAttentionCount = walletSummaries.length + unpaidDeficits.length;

  return (
    <div className="w-full min-w-0 max-w-full space-y-5 sm:space-y-6">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <h1 className="text-xl font-extrabold uppercase tracking-tight text-zinc-950 dark:text-white sm:text-2xl">
            {t('hostDashboardTitle')}
          </h1>
          <span className="shrink-0 rounded-md bg-zinc-950 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-volt dark:bg-volt dark:text-zinc-950">
            {t('hostBadge')}
          </span>
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setWalletOpen(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 text-xs font-bold text-zinc-700 shadow-sm transition hover:border-zinc-950 hover:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-volt sm:h-10 sm:px-3.5"
          >
            <Wallet className="h-3.5 w-3.5 shrink-0 text-zinc-950 dark:text-volt" />
            <span>{t('hostWalletBtn')}</span>
            {walletAttentionCount > 0 && (
              <span className="rounded-full bg-zinc-950 px-1.5 py-0.5 tabular-nums text-[10px] font-extrabold text-volt dark:bg-volt dark:text-zinc-950">
                {walletAttentionCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setNotifOpen(true)}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 text-xs font-bold text-zinc-700 shadow-sm transition hover:border-zinc-950 hover:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-volt sm:h-10 sm:px-3.5"
          >
            <Bell className="h-3.5 w-3.5 shrink-0" />
            <span>{t('hostNotifBtn')}</span>
            {hasActiveNotifications && (
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 rounded-full bg-emerald-500"
              />
            )}
          </button>

          <Link
            href="/host/new"
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-volt px-3.5 text-xs font-extrabold uppercase tracking-wide text-zinc-950 shadow-sm transition hover:bg-volt-hover sm:h-10 sm:px-4"
          >
            <Plus className="h-4 w-4 shrink-0 stroke-[2.5]" />
            <span>{t('hostCreateMatch')}</span>
          </Link>

          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3 text-xs font-bold text-zinc-700 shadow-sm transition hover:border-zinc-950 hover:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-zinc-600 sm:h-10 sm:px-3.5"
          >
            <LogOut className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden sm:inline">{t('hostLogoutBtn')}</span>
          </button>
        </div>
      </div>

      {/* Host Payment Routing Status / Fallback Warning */}
      {hostPaymentStatus && !hostPaymentStatus.isConfigured && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-amber-300 bg-amber-50 p-3.5 text-xs font-medium text-amber-950 dark:border-amber-700/60 dark:bg-amber-950/50 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            {hostPaymentStatus.isFallback && hostPaymentStatus.paymentInfo
              ? t('hostPaymentFallbackWarning', {
                  email: hostPaymentStatus.email,
                  bank: hostPaymentStatus.paymentInfo.bankCode,
                  account: hostPaymentStatus.paymentInfo.accountNumber,
                })
              : t('hostPaymentMissingWarning', {
                  email: hostPaymentStatus.email,
                })}
          </span>
        </div>
      )}

      {hostPaymentStatus?.isConfigured && hostPaymentStatus.paymentInfo && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-xs shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-zinc-600 dark:text-zinc-300">
            <Landmark className="h-4 w-4 shrink-0 text-zinc-950 dark:text-volt" />
            <span className="font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              {t('hostPaymentAccountLabel')}:
            </span>
            <span className="font-extrabold text-zinc-950 dark:text-white">
              {bankCode}
            </span>
            <code className="rounded-md bg-zinc-100 px-1.5 py-0.5 font-mono font-bold text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100">
              {hostPaymentStatus.paymentInfo.accountNumber}
            </code>
            {showDistinctAccountName && (
              <span className="hidden text-zinc-500 dark:text-zinc-400 sm:inline">
                · {accountName}
              </span>
            )}
          </div>
          <span className="max-w-full truncate font-mono text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
            {hostPaymentStatus.email}
          </span>
        </div>
      )}

      {/* 4 Actionable KPI Cards */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
        <div className="relative min-w-0 overflow-hidden rounded-2xl border border-zinc-200 bg-white p-3.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-4">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-emerald-400" />
          <p className="text-center tabular-nums text-xl font-black text-zinc-950 dark:text-white sm:text-2xl">
            {openCount}
          </p>
          <p className="mt-0.5 text-center text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            {t('hostStatOpenMatches')}
          </p>
        </div>

        <div className="relative min-w-0 overflow-hidden rounded-2xl border border-zinc-200 bg-white p-3.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-4">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-volt" />
          <p className="text-center tabular-nums text-xl font-black text-zinc-950 dark:text-white sm:text-2xl">
            {totalConfirmedSlots}
          </p>
          <p className="mt-0.5 text-center text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            {t('hostStatConfirmedSlots')}
          </p>
        </div>

        <div className="relative min-w-0 overflow-hidden rounded-2xl border border-zinc-200 bg-white p-3.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-4">
          <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-volt" />
          <p className="truncate text-center tabular-nums text-lg font-black text-zinc-950 dark:text-volt sm:text-2xl">
            {formatVnd(totalCollected, locale)}
          </p>
          <p className="mt-0.5 text-center text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            {t('hostStatCollected')}
          </p>
        </div>

        <div className="relative min-w-0 overflow-hidden rounded-2xl border border-zinc-200 bg-white p-3.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-4">
          <div
            className={`mx-auto mb-2 h-1 w-10 rounded-full ${
              totalActionRequired > 0 ? 'bg-amber-400' : 'bg-zinc-300 dark:bg-zinc-700'
            }`}
          />
          <p
            className={`text-center tabular-nums text-xl font-black sm:text-2xl ${
              totalActionRequired > 0
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-zinc-950 dark:text-white'
            }`}
          >
            {totalActionRequired}
          </p>
          <p className="mt-0.5 text-center text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            {t('hostStatActionRequired')}
          </p>
        </div>
      </div>

      {/* Filter Tabs + Compact Search */}
      <div className="flex min-w-0 max-w-full flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex max-w-full self-start rounded-full border border-zinc-200 bg-white p-1 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          {(
            [
              ['upcoming', t('hostTabUpcoming')],
              ['past', t('hostTabPast')],
              ['all', t('allFilter')],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilterTab(key)}
              className={`rounded-full px-3 py-1.5 text-xs font-extrabold uppercase tracking-wide transition ${
                filterTab === key
                  ? 'bg-volt text-zinc-950 shadow-sm'
                  : 'text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="relative min-w-0 w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('hostSearchMatchesPlaceholder')}
            aria-label={t('hostSearchMatchesPlaceholder')}
            className="h-9 w-full rounded-full border border-zinc-200 bg-white pl-9 pr-3 text-xs font-medium text-zinc-950 shadow-sm outline-none transition focus:border-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white dark:focus:border-volt"
          />
        </div>
      </div>

      {error && (
        <p className="rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
          {error}
        </p>
      )}

      {/* Matches List */}
      {matchList.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          {t('hostEmptyMatches')}
        </div>
      ) : filteredMatches.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
          {t('noResults')}
        </div>
      ) : (
        <div ref={menuContainerRef} className="space-y-3">
          {filteredMatches.map((m) => {
            const pct =
              m.max_slots > 0
                ? Math.min(100, Math.round((m.slots_taken / m.max_slots) * 100))
                : 0;
            const isFullOpen =
              m.status === 'open' && m.confirmed_slots >= m.max_slots;
            const statusText = isFullOpen
              ? t('hostStatusFull')
              : translateMatchStatus(m.status, t);

            return (
              <div
                key={m.id}
                className="relative flex min-w-0 max-w-full flex-col justify-between gap-4 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full bg-zinc-950 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-volt dark:bg-volt dark:text-zinc-950">
                      {m.sport}
                    </span>
                    <span className="rounded-md bg-zinc-100 px-2 py-0.5 font-mono text-xs font-bold text-zinc-800 dark:bg-zinc-800 dark:text-volt">
                      #{m.short_code}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${statusBadgeClass(
                        m.status,
                        isFullOpen
                      )}`}
                    >
                      {statusText}
                    </span>
                    {m.waitlist_count > 0 && (
                      <span className="rounded-full bg-zinc-200/80 px-2 py-0.5 text-[10px] font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        {t('hostWaitlistMicro', { count: m.waitlist_count })}
                      </span>
                    )}
                    {m.pending_refunds_count > 0 && (
                      <span className="rounded-full bg-rose-500/15 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-400/15 dark:text-rose-300">
                        {t('hostPendingRefundMicro', {
                          count: m.pending_refunds_count,
                        })}
                      </span>
                    )}
                  </div>

                  <Link
                    href={`/host/matches/${m.id}`}
                    className="block break-words text-base font-extrabold uppercase tracking-tight text-zinc-950 transition hover:text-zinc-600 dark:text-white dark:hover:text-volt"
                  >
                    {m.title}
                  </Link>

                  <p className="break-words text-xs text-zinc-500 dark:text-zinc-400">
                    {formatMatchDateTimeRange(m.starts_at, m.notes, locale)} ·{' '}
                    {m.location_name}
                  </p>

                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-semibold tabular-nums text-zinc-600 dark:text-zinc-300">
                    <span>
                      {m.slots_taken}/{m.max_slots} {t('slotPlural')} ·{' '}
                      {formatVnd(m.fee_per_slot, locale)}
                    </span>
                    <span className="text-emerald-700 dark:text-volt">
                      · {t('hostCollectedShort')}{' '}
                      {formatVnd(m.collected_amount, locale)}
                    </span>
                  </div>

                  <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                    <div
                      className="h-full rounded-full bg-zinc-950 dark:bg-volt"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                <div className="relative flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShareTarget(m)}
                    title={t('shareMatchTitle')}
                    aria-label={t('shareMatchBtn')}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-xs font-bold text-zinc-700 transition hover:border-zinc-950 hover:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-volt dark:hover:text-white"
                  >
                    <Share2 className="h-3.5 w-3.5" />
                    <span>{t('shareMatchBtn')}</span>
                  </button>

                  <Link
                    href={`/host/matches/${m.id}`}
                    className="inline-flex h-9 items-center gap-1 rounded-xl bg-zinc-950 px-3.5 text-xs font-extrabold uppercase tracking-wide text-volt transition hover:opacity-90 dark:bg-volt dark:text-zinc-950"
                  >
                    <span>{t('hostManageBtn')}</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>

                  <div className="relative">
                    <button
                      type="button"
                      onClick={() =>
                        setOpenMenuId((prev) => (prev === m.id ? null : m.id))
                      }
                      aria-expanded={openMenuId === m.id}
                      aria-label={t('hostMoreActions')}
                      title={t('hostMoreActions')}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-600 transition hover:border-zinc-950 hover:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-volt dark:hover:text-white"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>

                    {openMenuId === m.id && (
                      <div
                        role="menu"
                        className="absolute right-0 top-10 z-30 w-44 rounded-2xl border border-zinc-200 bg-white p-1.5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
                      >
                        <button
                          type="button"
                          role="menuitem"
                          disabled={cloningId === m.id}
                          onClick={() => void handleClone(m.id)}
                          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-bold text-zinc-700 transition hover:bg-zinc-100 disabled:opacity-50 dark:text-zinc-200 dark:hover:bg-zinc-800"
                        >
                          <CopyPlus className="h-3.5 w-3.5 shrink-0" />
                          <span>{t('hostCloneNextWeek')}</span>
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setOpenMenuId(null);
                            setDeleteTarget(m);
                          }}
                          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-xs font-bold text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/60"
                        >
                          <Trash2 className="h-3.5 w-3.5 shrink-0" />
                          <span>{t('hostDeleteMatch')}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Club Wallet & Unpaid Debts Modal */}
      {walletOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/75 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setWalletOpen(false);
          }}
        >
          <div className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900 sm:rounded-3xl">
            <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <Wallet className="h-4 w-4 text-zinc-950 dark:text-volt" />
                <h2 className="text-base font-extrabold uppercase tracking-tight text-zinc-950 dark:text-white">
                  {t('hostWalletModalTitle')}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setWalletOpen(false)}
                aria-label={t('close')}
                className="rounded-full border border-zinc-200 p-1.5 text-zinc-500 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-5 overflow-y-auto p-5">
              {/* Section A: Club Wallet Ledger */}
              <div>
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  {t('hostWalletTitle')}
                </h3>
                {walletSummaries.length === 0 ? (
                  <p className="mt-2 rounded-xl border border-dashed border-zinc-200 p-4 text-center text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                    {t('hostWalletEmpty')}
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {walletSummaries.map((w) => (
                      <li
                        key={w.contact_normalized}
                        className="flex items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-xs dark:border-zinc-800 dark:bg-zinc-950"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-extrabold text-zinc-950 dark:text-white">
                            {w.player_name}
                          </p>
                          <p className="font-mono text-[11px] text-zinc-500">
                            ***{w.contact_normalized.slice(-4)}
                          </p>
                        </div>
                        <span className="shrink-0 tabular-nums text-sm font-black text-emerald-600 dark:text-volt">
                          {formatVnd(w.balance, locale)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Section B: Unpaid Deficit Settlements */}
              <div>
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  {t('hostUnpaidDebtsTitle')}
                </h3>
                {unpaidDeficits.length === 0 ? (
                  <p className="mt-2 rounded-xl border border-dashed border-zinc-200 p-4 text-center text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                    {t('hostUnpaidDebtsEmpty')}
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {unpaidDeficits.map((d) => (
                      <li
                        key={d.id}
                        className="flex items-center justify-between gap-2 rounded-xl border border-amber-300/60 bg-amber-50/70 px-3.5 py-2.5 text-xs dark:border-amber-700/50 dark:bg-amber-950/30"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-extrabold text-zinc-950 dark:text-white">
                            {d.player_name} ·{' '}
                            <span className="tabular-nums text-amber-700 dark:text-amber-300">
                              +{formatVnd(d.net_balance, locale)}
                            </span>
                          </p>
                          <p className="truncate text-[11px] text-zinc-600 dark:text-zinc-400">
                            #{d.short_code} · {d.match_title}
                          </p>
                        </div>
                        <Link
                          href={`/host/matches/${d.match_id}`}
                          onClick={() => setWalletOpen(false)}
                          className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-zinc-950 px-2.5 py-1.5 text-[11px] font-extrabold text-volt transition hover:opacity-90 dark:bg-volt dark:text-zinc-950"
                        >
                          <span>{t('hostManageBtn')}</span>
                          <ArrowRight className="h-3 w-3" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <NotificationSettingsModal
        open={notifOpen}
        onClose={() => {
          setNotifOpen(false);
          router.refresh();
        }}
      />

      {shareTarget && (
        <ShareMatchModal
          open={Boolean(shareTarget)}
          onClose={() => setShareTarget(null)}
          shortCode={shareTarget.short_code}
          matchTitle={shareTarget.title}
        />
      )}

      {deleteTarget && (
        <DeleteMatchModal
          matchId={deleteTarget.id}
          matchTitle={deleteTarget.title}
          shortCode={deleteTarget.short_code}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => {
            const deletedId = deleteTarget.id;
            setDeleteTarget(null);
            setMatchList((prev) => prev.filter((item) => item.id !== deletedId));
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
