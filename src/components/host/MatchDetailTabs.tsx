'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Check,
  Copy,
  QrCode,
  Search,
  Share2,
  Trash2,
} from 'lucide-react';
import { QrCheckinModal } from '@/components/host/QrCheckinModal';
import { DeleteMatchModal } from '@/components/host/DeleteMatchModal';
import { ShareMatchModal } from '@/components/host/ShareMatchModal';
import { useLocale } from '@/lib/i18n/LocaleProvider';
import {
  formatSlotLabel,
  translateMatchStatus,
  translatePaymentMethod,
  translatePaymentResult,
  translateRefundReason,
  translateRefundStatus,
  translateRegStatus,
} from '@/lib/i18n/helpers';
import { formatMatchDateTime, formatVnd } from '@/lib/format';
import { getAvatarTone, getInitials } from '@/lib/ui-helpers';
import type { PublicMatch } from '@/lib/types';

export interface HostMatchRow extends PublicMatch {
  court_fee_total: number;
  shuttle_fee_total: number;
}

export interface HostRegistrationRow {
  id: string;
  match_id: string;
  display_name: string;
  contact: string | null;
  slots: number;
  status: string;
  payment_code: string;
  amount_due: number;
  amount_paid: number;
  payment_method: string;
  expires_at: string | null;
  checked_in: boolean;
  created_at: string;
  cancelled_at: string | null;
  promoted_at: string | null;
}

export interface HostPaymentRow {
  id: string;
  sepay_transaction_id: string | null;
  registration_id: string | null;
  amount: number;
  content: string | null;
  received_at: string;
  result: string;
}

export interface HostRefundRow {
  id: string;
  registration_id: string;
  amount: number;
  reason: string;
  status: string;
  account_info: string | null;
  done_at: string | null;
  note: string | null;
  created_at: string;
}

interface MatchDetailTabsProps {
  match: HostMatchRow;
  registrations: HostRegistrationRow[];
  payments: HostPaymentRow[];
  unmatchedPayments: HostPaymentRow[];
  refunds: HostRefundRow[];
  siteUrl: string;
}

export function MatchDetailTabs({
  match,
  registrations,
  payments,
  unmatchedPayments,
  refunds,
  siteUrl,
}: MatchDetailTabsProps) {
  const { locale, t } = useLocale();
  const router = useRouter();
  const [tab, setTab] = useState<'roster' | 'payments' | 'refunds' | 'summary'>(
    'roster'
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);

  // Roster filter/search
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<
    'all' | 'confirmed' | 'pending_payment' | 'waitlisted'
  >('all');

  // Manual add state
  const [addName, setAddName] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [addSlots, setAddSlots] = useState(1);

  // Remove override & refund notes
  const [noRefundTarget, setNoRefundTarget] = useState<string | null>(null);
  const [assignTarget, setAssignTarget] = useState<Record<string, string>>({});
  const [refundNotes, setRefundNotes] = useState<Record<string, string>>({});

  // Cost calculator
  const [courtFee, setCourtFee] = useState(match.court_fee_total);
  const [shuttleFee, setShuttleFee] = useState(match.shuttle_fee_total);
  const [copiedSummary, setCopiedSummary] = useState(false);

  const runAction = async (url: string, body?: unknown) => {
    setMsg('');
    setBusy(true);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setMsg(data.error || t('errGeneric'));
      } else {
        router.refresh();
      }
    } catch {
      setMsg(t('errGeneric'));
    } finally {
      setBusy(false);
    }
  };

  const handleQrCheckin = async (registrationId: string): Promise<boolean> => {
    try {
      const res = await fetch(`/api/host/registrations/${registrationId}/checkin`, {
        method: 'POST',
      });
      if (!res.ok) return false;
      router.refresh();
      return true;
    } catch {
      return false;
    }
  };

  const regById = new Map(registrations.map((r) => [r.id, r]));
  const matchStarted = Date.now() >= new Date(match.starts_at).getTime();

  const confirmedAndPending = registrations.filter(
    (r) => r.status === 'confirmed' || r.status === 'pending_payment'
  );
  const totalRevenue = registrations
    .filter((r) => r.status === 'confirmed')
    .reduce((acc, r) => acc + r.amount_paid, 0);
  const totalCost = courtFee + shuttleFee;
  const activeSlotCount = confirmedAndPending.reduce((acc, r) => acc + r.slots, 0);
  const suggestedFeePerSlot =
    activeSlotCount > 0 ? Math.ceil(totalCost / activeSlotCount / 1000) * 1000 : 0;

  const filteredRegistrations = registrations.filter((r) => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.trim().toLowerCase();
    return (
      r.display_name.toLowerCase().includes(q) ||
      (r.contact ?? '').toLowerCase().includes(q) ||
      r.payment_code.toLowerCase().includes(q)
    );
  });

  const matchLink = `${siteUrl.replace(/\/$/, '')}/keo/${match.short_code}`;
  const zaloSummary = [
    `${match.sport.toUpperCase()} · ${match.title} (#${match.short_code})`,
    `${formatMatchDateTime(match.starts_at, locale)}`,
    `${match.location_name}`,
    `${formatVnd(match.fee_per_slot, locale)}/slot (${match.slots_taken}/${match.max_slots})`,
    '',
    ...confirmedAndPending.map(
      (r, i) =>
        `${i + 1}. ${r.display_name} (×${r.slots}) - ${
          r.status === 'confirmed' ? t('regConfirmed') : t('regPendingPayment')
        }`
    ),
    '',
    `${t('zaloBookCta')}: ${matchLink}`,
  ].join('\n');

  const copySummary = async () => {
    await navigator.clipboard.writeText(zaloSummary);
    setCopiedSummary(true);
    window.setTimeout(() => setCopiedSummary(false), 2000);
  };

  const regStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
        return 'bg-volt text-zinc-950';
      case 'pending_payment':
        return 'bg-amber-500/15 text-amber-700 dark:bg-amber-400/15 dark:text-amber-400';
      case 'waitlisted':
        return 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300';
      default:
        return 'bg-rose-500/15 text-rose-700 dark:bg-rose-400/15 dark:text-rose-400';
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href="/host"
          className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3.5 py-1.5 text-xs font-bold text-zinc-700 shadow-sm transition hover:border-zinc-950 hover:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-volt dark:hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>{t('hostDashboardTitle')}</span>
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShareModalOpen(true)}
            title={t('shareMatchTitle')}
            className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-1.5 font-mono text-xs font-bold text-zinc-700 shadow-sm transition hover:border-zinc-950 hover:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-volt dark:hover:text-white"
          >
            <span>#{match.short_code}</span>
            <Share2 className="h-3.5 w-3.5 opacity-80" />
          </button>
          {match.status === 'open' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void runAction(`/api/host/matches/${match.id}/lock`)}
              className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800 transition hover:bg-amber-100 dark:border-amber-700/60 dark:bg-amber-950/50 dark:text-amber-200"
            >
              {t('hostLockMatch')}
            </button>
          )}
          <button
            type="button"
            disabled={
              busy ||
              matchStarted ||
              (match.status !== 'open' && match.status !== 'locked')
            }
            onClick={() => {
              if (window.confirm(t('hostCancelMatchConfirm'))) {
                void runAction(`/api/host/matches/${match.id}/cancel`);
              }
            }}
            className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700 transition hover:bg-rose-100 disabled:opacity-40 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-200"
          >
            {t('hostCancelMatch')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setDeleteModalOpen(true)}
            className="inline-flex items-center gap-1 rounded-xl border border-rose-300 bg-white px-3 py-1.5 text-xs font-bold text-rose-700 transition hover:bg-rose-50 disabled:opacity-40 dark:border-rose-800 dark:bg-zinc-900 dark:text-rose-300 dark:hover:bg-rose-950/60"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>{t('hostDeleteMatch')}</span>
          </button>
        </div>
      </div>

      {/* Ticket Match Header Card */}
      <section className="relative overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="rounded-full bg-zinc-950 px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-volt dark:bg-volt dark:text-zinc-950">
              {match.sport}
            </span>
            <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold uppercase tracking-wider text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
              {translateMatchStatus(match.status, t)}
            </span>
          </div>

          <h1 className="mt-3 text-xl font-extrabold uppercase tracking-tight text-zinc-950 dark:text-white sm:text-2xl">
            {match.title}
          </h1>
          <p className="mt-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
            {formatMatchDateTime(match.starts_at, locale)} · {match.location_name}
          </p>

          <div
            aria-hidden="true"
            className="ticket-barcode mt-4 h-4 w-36 text-zinc-300 dark:text-zinc-700"
          />
        </div>

        {/* Perforated Ticket Divider */}
        <div className="relative flex items-center">
          <span
            aria-hidden="true"
            className="-ml-3 h-6 w-6 shrink-0 rounded-full border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950"
          />
          <div className="w-full border-t-2 border-dashed border-zinc-200 dark:border-zinc-800" />
          <span
            aria-hidden="true"
            className="-mr-3 h-6 w-6 shrink-0 rounded-full border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950"
          />
        </div>

        {/* Stat Strip */}
        <div className="grid grid-cols-2 gap-3 p-4 sm:p-5">
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3.5 text-center dark:border-zinc-800 dark:bg-zinc-950">
            <div className="mx-auto mb-1.5 h-1 w-10 rounded-full bg-volt" />
            <p className="tabular-nums text-2xl font-black text-zinc-950 dark:text-white">
              {match.slots_taken}/{match.max_slots}
            </p>
            <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              {t('spotsOccupied')}
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3.5 text-center dark:border-zinc-800 dark:bg-zinc-950">
            <div className="mx-auto mb-1.5 h-1 w-10 rounded-full bg-volt" />
            <p className="tabular-nums text-2xl font-black text-zinc-950 dark:text-white">
              {formatVnd(totalRevenue, locale)}
            </p>
            <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              {t('hostStatCollected')}
            </p>
          </div>
        </div>
      </section>

      {msg && (
        <p className="rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
          {msg}
        </p>
      )}

      {/* Pill-style 4-Tab Navigation */}
      <div className="flex flex-wrap gap-1.5 rounded-2xl border border-zinc-200 bg-white p-1.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        {(
          [
            ['roster', t('hostTabRoster')],
            ['payments', t('hostTabPayments')],
            ['refunds', t('hostTabRefunds')],
            ['summary', t('hostTabSummary')],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex-1 rounded-xl px-3 py-2 text-xs font-extrabold uppercase tracking-wide transition sm:text-sm ${
              tab === key
                ? 'bg-volt text-zinc-950 shadow-sm'
                : 'text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* TAB 1: ROSTER */}
      {tab === 'roster' && (
        <div className="space-y-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void runAction(`/api/host/matches/${match.id}/manual-add`, {
                name: addName,
                contact: addPhone,
                slots: addSlots,
              }).then(() => {
                setAddName('');
                setAddPhone('');
              });
            }}
            className="grid gap-2.5 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:grid-cols-4"
          >
            <input
              type="text"
              required
              placeholder={t('fieldName')}
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              className="h-10 rounded-xl border border-zinc-300 bg-zinc-50 px-3 text-sm text-zinc-950 outline-none focus:border-zinc-950 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white dark:focus:border-volt"
            />
            <input
              type="tel"
              required
              placeholder={t('fieldPhone')}
              value={addPhone}
              onChange={(e) => setAddPhone(e.target.value)}
              className="h-10 rounded-xl border border-zinc-300 bg-zinc-50 px-3 text-sm tabular-nums text-zinc-950 outline-none focus:border-zinc-950 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white dark:focus:border-volt"
            />
            <select
              value={addSlots}
              onChange={(e) => setAddSlots(Number(e.target.value))}
              className="h-10 rounded-xl border border-zinc-300 bg-zinc-50 px-3 text-sm font-semibold text-zinc-950 outline-none focus:border-zinc-950 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white dark:focus:border-volt"
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {formatSlotLabel(n, t)}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={busy}
              className="h-10 rounded-xl bg-volt text-xs font-extrabold uppercase tracking-wide text-zinc-950 transition hover:bg-volt-hover disabled:opacity-60"
            >
              {t('hostManualAdd')}
            </button>
          </form>

          {/* Search, QR Scanner & Status Filter */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('searchPlaceholder')}
                  className="h-10 w-full rounded-xl border border-zinc-200 bg-white pl-9 pr-3 text-sm text-zinc-950 outline-none focus:border-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white dark:focus:border-volt"
                />
              </div>
              <button
                type="button"
                onClick={() => setScannerOpen(true)}
                className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-zinc-950 px-3.5 text-xs font-extrabold uppercase tracking-wide text-volt shadow-sm transition hover:opacity-90 dark:bg-volt dark:text-zinc-950"
              >
                <QrCode className="h-4 w-4" />
                <span>{t('hostScanQrBtn')}</span>
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ['all', t('hostFilterAll')],
                  ['confirmed', t('hostFilterConfirmed')],
                  ['pending_payment', t('hostFilterPending')],
                  ['waitlisted', t('hostFilterWaitlist')],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setStatusFilter(key)}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                    statusFilter === key
                      ? 'bg-zinc-950 text-volt dark:bg-volt dark:text-zinc-950'
                      : 'border border-zinc-200 bg-white text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {filteredRegistrations.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-6 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
              {registrations.length === 0 ? t('hostNoRegistrations') : t('noResults')}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredRegistrations.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-col justify-between gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:flex-row sm:items-center"
                >
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${getAvatarTone(
                        r.display_name
                      )}`}
                    >
                      {getInitials(r.display_name)}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="truncate text-sm font-extrabold text-zinc-950 dark:text-white">
                          {r.display_name}
                        </p>
                        <span className="rounded-md bg-zinc-200 px-1.5 py-0.5 tabular-nums text-[11px] font-extrabold text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                          ×{r.slots}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${regStatusBadge(
                            r.status
                          )}`}
                        >
                          {translateRegStatus(r.status, t)}
                        </span>
                      </div>
                      <p className="mt-1 tabular-nums text-xs text-zinc-500 dark:text-zinc-400">
                        {r.contact ?? '—'} ·{' '}
                        <span className="font-mono font-semibold">{r.payment_code}</span> ·{' '}
                        {formatVnd(r.amount_paid, locale)} /{' '}
                        {formatVnd(r.amount_due, locale)} (
                        {translatePaymentMethod(r.payment_method, t)})
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {(r.status === 'confirmed' || r.status === 'pending_payment') && (
                      <button
                        type="button"
                        role="switch"
                        aria-checked={r.checked_in}
                        disabled={busy}
                        onClick={() =>
                          void runAction(`/api/host/registrations/${r.id}/checkin`)
                        }
                        className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-bold text-zinc-700 transition hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200"
                      >
                        <span
                          className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition ${
                            r.checked_in
                              ? 'bg-volt'
                              : 'bg-zinc-300 dark:bg-zinc-700'
                          }`}
                        >
                          <span
                            className={`inline-block h-3.5 w-3.5 transform rounded-full transition ${
                              r.checked_in
                                ? 'translate-x-[18px] bg-zinc-950'
                                : 'translate-x-1 bg-white dark:bg-zinc-300'
                            }`}
                          />
                        </span>
                        <span>{t('hostCheckin')}</span>
                      </button>
                    )}

                    {r.status === 'pending_payment' && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void runAction(
                            `/api/host/registrations/${r.id}/cash-paid`
                          )
                        }
                        className="rounded-xl bg-sky-600 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-sky-700"
                      >
                        {t('hostMarkCashPaid')}
                      </button>
                    )}

                    {r.status === 'waitlisted' && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void runAction(`/api/host/registrations/${r.id}/promote`)
                        }
                        className="rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-bold text-zinc-950 transition hover:bg-amber-400"
                      >
                        {t('hostPromoteWaitlist')}
                      </button>
                    )}

                    {r.status !== 'cancelled' && r.status !== 'expired' && (
                      <div className="flex flex-wrap items-center gap-2">
                        {r.amount_paid > 0 && (
                          <label className="flex items-center gap-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                            <input
                              type="checkbox"
                              checked={noRefundTarget === r.id}
                              onChange={(e) =>
                                setNoRefundTarget(e.target.checked ? r.id : null)
                              }
                            />
                            <span>{t('hostRemoveNoRefund')}</span>
                          </label>
                        )}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void runAction(
                              `/api/host/registrations/${r.id}/remove`,
                              {
                                noRefundOverride: noRefundTarget === r.id,
                              }
                            )
                          }
                          className="rounded-xl border border-rose-300 px-2.5 py-1.5 text-xs font-bold text-rose-600 transition hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400 dark:hover:bg-rose-950/40"
                        >
                          {t('hostRemovePlayer')}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: PAYMENTS */}
      {tab === 'payments' && (
        <div className="space-y-5">
          <div className="rounded-2xl border border-amber-300 bg-amber-50/70 p-4 dark:border-amber-800/60 dark:bg-amber-950/30">
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-amber-950 dark:text-amber-200">
              {t('hostUnmatchedPayments')}
            </h2>
            {unmatchedPayments.length === 0 ? (
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">—</p>
            ) : (
              <div className="mt-3 space-y-2">
                {unmatchedPayments.map((p) => (
                  <div
                    key={p.id}
                    className="flex flex-col justify-between gap-2 rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900 sm:flex-row sm:items-center"
                  >
                    <div className="text-sm">
                      <strong className="tabular-nums text-zinc-950 dark:text-white">
                        {formatVnd(p.amount, locale)}
                      </strong>{' '}
                      ·{' '}
                      <span className="text-xs text-zinc-600 dark:text-zinc-300">
                        {p.content}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={assignTarget[p.id] ?? ''}
                        onChange={(e) =>
                          setAssignTarget((prev) => ({
                            ...prev,
                            [p.id]: e.target.value,
                          }))
                        }
                        className="h-9 rounded-lg border border-zinc-300 bg-zinc-50 px-2 text-xs text-zinc-950 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                      >
                        <option value="">{t('selectOption')}</option>
                        {registrations.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.display_name} ({r.payment_code})
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={busy || !assignTarget[p.id]}
                        onClick={() =>
                          void runAction(`/api/host/payments/${p.id}/assign`, {
                            registrationId: assignTarget[p.id],
                          })
                        }
                        className="h-9 rounded-lg bg-volt px-3 text-xs font-extrabold text-zinc-950 disabled:opacity-50"
                      >
                        {t('hostAssignPayment')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {payments.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-6 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
              {t('hostNoPayments')}
            </div>
          ) : (
            <div className="space-y-2">
              {payments.map((p) => {
                const r = p.registration_id ? regById.get(p.registration_id) : null;
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-2 rounded-2xl border border-zinc-200 bg-white p-3.5 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
                  >
                    <div className="min-w-0">
                      <strong className="tabular-nums text-zinc-950 dark:text-white">
                        {formatVnd(p.amount, locale)}
                      </strong>{' '}
                      ·{' '}
                      <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                        {r?.display_name ?? '—'}
                      </span>{' '}
                      ·{' '}
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        {p.content}
                      </span>
                    </div>
                    <span className="shrink-0 rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-bold text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                      {translatePaymentResult(p.result, t)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: REFUNDS */}
      {tab === 'refunds' && (
        <div className="space-y-3">
          {refunds.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-6 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
              {t('hostNoRefunds')}
            </div>
          ) : (
            refunds.map((rf) => {
              const reg = regById.get(rf.registration_id);
              const ageHours =
                (Date.now() - new Date(rf.created_at).getTime()) / 3600000;
              const isStale =
                (rf.status === 'pending' || rf.status === 'pending_review') &&
                ageHours > 48;

              return (
                <div
                  key={rf.id}
                  className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-extrabold text-zinc-950 dark:text-white">
                        {reg?.display_name ?? rf.registration_id} ·{' '}
                        <span className="tabular-nums">
                          {formatVnd(rf.amount, locale)}
                        </span>
                      </p>
                      <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                        {translateRefundReason(rf.reason, t)} ·{' '}
                        {t('refundAccountLabel')}: {rf.account_info || '—'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {isStale && (
                        <span className="rounded-full bg-rose-600 px-2.5 py-0.5 text-xs font-extrabold text-white">
                          {t('hostStaleBadge')}
                        </span>
                      )}
                      <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-bold text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                        {translateRefundStatus(rf.status, t)}
                      </span>
                    </div>
                  </div>

                  {rf.status === 'pending' && (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        type="text"
                        maxLength={200}
                        value={refundNotes[rf.id] ?? ''}
                        onChange={(e) =>
                          setRefundNotes((prev) => ({
                            ...prev,
                            [rf.id]: e.target.value,
                          }))
                        }
                        placeholder={t('hostRefundNotePlaceholder')}
                        className="h-10 flex-1 rounded-xl border border-zinc-300 bg-zinc-50 px-3 text-sm text-zinc-950 outline-none focus:border-zinc-950 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white dark:focus:border-volt"
                      />
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void runAction(`/api/host/refunds/${rf.id}/done`, {
                            note: refundNotes[rf.id] ?? '',
                          })
                        }
                        className="h-10 rounded-xl bg-volt px-4 text-xs font-extrabold uppercase tracking-wide text-zinc-950 hover:bg-volt-hover"
                      >
                        {t('hostMarkRefundDone')}
                      </button>
                    </div>
                  )}

                  {rf.status === 'pending_review' && (
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="text"
                        maxLength={200}
                        value={refundNotes[rf.id] ?? ''}
                        onChange={(e) =>
                          setRefundNotes((prev) => ({
                            ...prev,
                            [rf.id]: e.target.value,
                          }))
                        }
                        placeholder={t('noteOptionalPlaceholder')}
                        className="h-9 flex-1 rounded-xl border border-zinc-300 bg-zinc-50 px-3 text-xs text-zinc-950 outline-none focus:border-zinc-950 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white dark:focus:border-volt"
                      />
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void runAction(`/api/host/refunds/${rf.id}/review`, {
                            approve: true,
                            note: refundNotes[rf.id] ?? '',
                          })
                        }
                        className="h-9 rounded-lg bg-volt px-3 text-xs font-extrabold text-zinc-950"
                      >
                        {t('hostApprove')}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void runAction(`/api/host/refunds/${rf.id}/review`, {
                            approve: false,
                            note: refundNotes[rf.id] ?? '',
                          })
                        }
                        className="h-9 rounded-lg bg-rose-600 px-3 text-xs font-bold text-white"
                      >
                        {t('hostReject')}
                      </button>
                    </div>
                  )}

                  {rf.note && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {t('noteLabel')}: {rf.note}
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 4: SUMMARY & CALCULATOR */}
      {tab === 'summary' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-zinc-950 dark:text-white">
                {t('hostTabSummary')}
              </h2>
              <button
                type="button"
                onClick={() => void copySummary()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-volt px-3 py-1.5 text-xs font-extrabold text-zinc-950 transition hover:bg-volt-hover"
              >
                {copiedSummary ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    <span>{t('copied')}</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    <span>{t('hostCopyZalo')}</span>
                  </>
                )}
              </button>
            </div>
            <pre className="whitespace-pre-wrap rounded-xl border border-zinc-200 bg-zinc-50 p-3.5 font-sans text-xs leading-relaxed text-zinc-800 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
              {zaloSummary}
            </pre>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void runAction(`/api/host/matches/${match.id}/update`, {
                court_fee_total: courtFee,
                shuttle_fee_total: shuttleFee,
              });
            }}
            className="space-y-3.5 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
          >
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-zinc-950 dark:text-white">
              {t('hostCostCalcTitle')}
            </h2>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                {t('hostCourtFee')}
              </label>
              <input
                type="number"
                min={0}
                value={courtFee}
                onChange={(e) => setCourtFee(Number(e.target.value))}
                className="mt-1 h-10 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3 text-sm tabular-nums text-zinc-950 outline-none focus:border-zinc-950 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white dark:focus:border-volt"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                {t('hostShuttleFee')}
              </label>
              <input
                type="number"
                min={0}
                value={shuttleFee}
                onChange={(e) => setShuttleFee(Number(e.target.value))}
                className="mt-1 h-10 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3 text-sm tabular-nums text-zinc-950 outline-none focus:border-zinc-950 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white dark:focus:border-volt"
              />
            </div>

            <div className="space-y-1.5 rounded-xl border border-zinc-200 bg-zinc-50 p-3.5 text-sm dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">
                  {t('hostTotalCost')}
                </span>
                <strong className="tabular-nums text-zinc-950 dark:text-white">
                  {formatVnd(totalCost, locale)}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">
                  {t('hostConfirmedRevenue')}
                </span>
                <strong className="tabular-nums text-emerald-600 dark:text-emerald-400">
                  {formatVnd(totalRevenue, locale)}
                </strong>
              </div>
              <div className="flex justify-between border-t border-zinc-200 pt-1.5 dark:border-zinc-800">
                <span className="text-zinc-500 dark:text-zinc-400">
                  {t('hostNetBalance')}
                </span>
                <strong className="tabular-nums text-zinc-950 dark:text-white">
                  {formatVnd(totalRevenue - totalCost, locale)}
                </strong>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500 dark:text-zinc-400">
                  {t('hostSuggestedFee', { count: activeSlotCount })}
                </span>
                <strong className="tabular-nums text-zinc-950 dark:text-volt">
                  {formatVnd(suggestedFeePerSlot, locale)}
                </strong>
              </div>
            </div>

            <button
              type="submit"
              disabled={busy}
              className="h-10 w-full rounded-xl bg-zinc-950 text-xs font-extrabold uppercase tracking-wide text-volt transition hover:opacity-90 disabled:opacity-60 dark:bg-volt dark:text-zinc-950"
            >
              {t('hostSaveCosts')}
            </button>
          </form>
        </div>
      )}
      <ShareMatchModal
        open={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        shortCode={match.short_code}
        matchTitle={match.title}
        siteUrl={siteUrl}
      />
      <QrCheckinModal
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        registrations={registrations}
        onCheckin={handleQrCheckin}
      />
      {deleteModalOpen && (
        <DeleteMatchModal
          matchId={match.id}
          matchTitle={match.title}
          shortCode={match.short_code}
          onClose={() => setDeleteModalOpen(false)}
          onDeleted={() => {
            setDeleteModalOpen(false);
            router.push('/host');
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
