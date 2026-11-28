'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Calendar,
  Check,
  ChevronDown,
  Clock,
  ExternalLink,
  Layers,
  MapPin,
  ShieldAlert,
  Sparkles,
  Users,
} from 'lucide-react';
import { useLocale } from '@/lib/i18n/LocaleProvider';
import { translateMatchStatus } from '@/lib/i18n/helpers';
import {
  formatMatchDateTime,
  formatMatchDateTimeRange,
  formatVnd,
  stripTimeRangeFromNotes,
} from '@/lib/format';
import { getAvatarTone, getInitials, splitParticipantNames } from '@/lib/ui-helpers';
import { createBrowserSupabaseClient } from '@/lib/supabase/client';
import type { PublicMatch, PublicParticipantsPayload } from '@/lib/types';
import { MyBookingsBanner } from '@/components/player/MyBookingsBanner';
import { BookingSheet } from '@/components/player/BookingSheet';
import { MiniScoreboardTab } from '@/components/shared/MiniScoreboardTab';

interface MatchClientProps {
  initialMatch: PublicMatch;
  initialParticipants: PublicParticipantsPayload;
}

export function MatchClient({
  initialMatch,
  initialParticipants,
}: MatchClientProps) {
  const { locale, t } = useLocale();
  const [match, setMatch] = useState<PublicMatch>(initialMatch);
  const [participantsData, setParticipantsData] =
    useState<PublicParticipantsPayload>(initialParticipants);
  const [selectedSlots, setSelectedSlots] = useState(1);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'scoreboard'>('info');

  const refreshParticipants = useCallback(async () => {
    try {
      const supabase = createBrowserSupabaseClient();
      const { data } = await supabase.rpc('get_public_participants', {
        p_match_id: initialMatch.id,
      });
      if (data && typeof data === 'object') {
        setParticipantsData(data as PublicParticipantsPayload);
      }
    } catch {
      // Ignore transient realtime/polling fetch errors
    }
  }, [initialMatch.id]);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    const channel = supabase
      .channel(`match-live-${initialMatch.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'matches',
          filter: `id=eq.${initialMatch.id}`,
        },
        (payload) => {
          const next = payload.new as Partial<PublicMatch>;
          setMatch((prev) => ({
            ...prev,
            slots_taken:
              typeof next.slots_taken === 'number'
                ? next.slots_taken
                : prev.slots_taken,
            status: next.status ?? prev.status,
          }));
          void refreshParticipants();
        }
      )
      .subscribe();

    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refreshParticipants();
      }
    }, 15000);

    return () => {
      window.clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [initialMatch.id, refreshParticipants]);

  const available = participantsData.available_slots;
  const taken = participantsData.slots_taken;
  const maxBookableSlots = Math.max(
    1,
    Math.min(match.max_slots, available > 0 ? available : match.max_slots)
  );
  const quickSlotOptions = [1, 2, 3, 4].filter((n) => n <= maxBookableSlots);
  const safeSelectedSlots = Math.min(selectedSlots, maxBookableSlots);
  const occupancyPct =
    match.max_slots > 0
      ? Math.min(100, Math.round((taken / match.max_slots) * 100))
      : 0;

  const activeRoster = participantsData.participants.filter(
    (p) => p.status === 'confirmed' || p.status === 'pending_payment'
  );
  const waitlist = participantsData.participants.filter(
    (p) => p.status === 'waitlisted'
  );

  const isBookable =
    match.status === 'open' &&
    Date.now() < new Date(match.lock_at).getTime() &&
    Date.now() < new Date(match.starts_at).getTime();

  const statusBadge = () => {
    const label = translateMatchStatus(match.status, t);
    switch (match.status) {
      case 'open':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-bold uppercase tracking-wide text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 dark:bg-emerald-400" />
            {label}
          </span>
        );
      case 'locked':
        return (
          <span className="rounded-full bg-amber-500/15 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-700 dark:bg-amber-400/15 dark:text-amber-400">
            {label}
          </span>
        );
      case 'cancelled':
        return (
          <span className="rounded-full bg-rose-500/15 px-3 py-1 text-xs font-bold uppercase tracking-wide text-rose-700 dark:bg-rose-400/15 dark:text-rose-400">
            {label}
          </span>
        );
      default:
        return (
          <span className="rounded-full bg-zinc-200 px-3 py-1 text-xs font-bold uppercase tracking-wide text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
            {label}
          </span>
        );
    }
  };

  return (
    <div className="w-full min-w-0 max-w-full space-y-6 pb-8">
      <MyBookingsBanner filterMatchId={match.id} />

      {/* Digital Event Ticket Card */}
      <section className="relative w-full max-w-full overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        {/* Upper Ticket Body */}
        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-zinc-950 px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-volt dark:bg-volt dark:text-zinc-950">
                {match.sport}
              </span>
              <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 font-mono text-xs font-bold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                #{match.short_code}
              </span>
            </div>
            {statusBadge()}
          </div>

          <h1 className="mt-3 text-2xl font-extrabold uppercase tracking-tight text-zinc-950 dark:text-white sm:text-3xl">
            {match.title}
          </h1>

          {/* Schedule & Location Row */}
          <div className="mt-4 flex flex-col gap-2.5 text-sm text-zinc-600 dark:text-zinc-300">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 shrink-0 text-zinc-950 dark:text-volt" />
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {formatMatchDateTimeRange(match.starts_at, match.notes, locale)}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                <Clock className="h-3.5 w-3.5 shrink-0" />
                <span>
                  {t('lockAt')}: {formatMatchDateTime(match.lock_at, locale)}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />
                <span className="break-words font-medium text-zinc-800 dark:text-zinc-200">
                  {match.location_name}
                </span>
              </div>

              {match.map_url && (
                <a
                  href={match.map_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-100 px-3 py-1.5 text-xs font-bold text-zinc-900 transition hover:border-zinc-950 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:border-volt"
                >
                  <MapPin className="h-3.5 w-3.5 text-rose-500" />
                  <span>{t('openMaps')}</span>
                  <ExternalLink className="h-3 w-3 opacity-70" />
                </a>
              )}
            </div>
          </div>

          {(() => {
            const displayNotes = stripTimeRangeFromNotes(match.notes);
            if (!match.level && !match.court_numbers && !match.courts && !displayNotes) {
              return null;
            }
            return (
              <div className="mt-4 space-y-2 rounded-2xl border border-zinc-200/80 bg-zinc-50 p-3.5 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
                {(match.level || match.court_numbers || match.courts) && (
                  <div className="flex flex-wrap gap-3">
                    {match.level && (
                      <span className="inline-flex items-center gap-1.5 font-semibold">
                        <Sparkles className="h-3.5 w-3.5 text-zinc-950 dark:text-volt" />
                        <span className="text-zinc-500 dark:text-zinc-400">
                          {t('level')}:
                        </span>
                        <span className="text-zinc-950 dark:text-white">
                          {match.level}
                        </span>
                      </span>
                    )}
                    {(match.court_numbers || match.courts) && (
                      <span className="inline-flex items-center gap-1.5 font-semibold">
                        <Layers className="h-3.5 w-3.5 text-zinc-950 dark:text-volt" />
                        <span className="text-zinc-500 dark:text-zinc-400">
                          {match.court_numbers ? t('courtNumberLabel') : t('courts')}:
                        </span>
                        <span className="tabular-nums text-zinc-950 dark:text-white">
                          {match.court_numbers || match.courts}
                        </span>
                      </span>
                    )}
                  </div>
                )}
                {displayNotes && (
                  <p
                    className={`whitespace-pre-line text-xs leading-relaxed ${
                      match.level || match.court_numbers || match.courts
                        ? 'border-t border-zinc-200 pt-2 dark:border-zinc-800'
                        : ''
                    }`}
                  >
                    <strong className="text-zinc-800 dark:text-zinc-200">
                      {t('notes')}:
                    </strong>{' '}
                    {displayNotes}
                  </p>
                )}
              </div>
            );
          })()}
        </div>

        {/* Perforated Ticket Divider with Side Notches */}
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

        {/* Lower Ticket Stub: Fee & Volt Progress Bar */}
        <div className="space-y-3 p-5 sm:p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div className="flex items-baseline gap-1.5">
              <span className="tabular-nums text-2xl font-black tracking-tight text-zinc-950 dark:text-white">
                {formatVnd(match.fee_per_slot, locale)}
              </span>
              <span className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                {t('perSlot')}
              </span>
            </div>

            <div className="flex items-center gap-1.5 text-sm font-bold">
              <Users className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
              {available > 0 ? (
                <span className="tabular-nums text-zinc-700 dark:text-zinc-200">
                  {t('bookedBadge')}{' '}
                  <span className="text-zinc-950 dark:text-volt">
                    {taken}/{match.max_slots}
                  </span>{' '}
                  · {available} {t('slotsLeft')}
                </span>
              ) : (
                <span className="text-amber-600 dark:text-amber-400">
                  {t('slotsFull')} ({taken}/{match.max_slots})
                </span>
              )}
            </div>
          </div>

          <div
            className="h-2.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
            role="progressbar"
            aria-valuenow={taken}
            aria-valuemin={0}
            aria-valuemax={match.max_slots}
          >
            <div
              className="h-full rounded-full bg-zinc-950 transition-all duration-300 dark:bg-volt"
              style={{ width: `${occupancyPct}%` }}
            />
          </div>
        </div>
      </section>

      {/* Player Tab Switcher: Details & Roster vs Live Mini Scoreboard */}
      <div className="flex w-full max-w-full gap-1.5 rounded-2xl border border-zinc-200 bg-white p-1.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <button
          type="button"
          onClick={() => setActiveTab('info')}
          className={`min-w-0 flex-1 rounded-xl px-3 py-2 text-xs font-extrabold uppercase tracking-wide transition ${
            activeTab === 'info'
              ? 'bg-volt text-zinc-950 shadow-sm'
              : 'text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white'
          }`}
        >
          {t('tabInfoRoster')}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('scoreboard')}
          className={`min-w-0 flex-1 rounded-xl px-3 py-2 text-xs font-extrabold uppercase tracking-wide transition ${
            activeTab === 'scoreboard'
              ? 'bg-volt text-zinc-950 shadow-sm'
              : 'text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white'
          }`}
        >
          {t('tabScoreboard')}
        </button>
      </div>

      {activeTab === 'scoreboard' ? (
        <MiniScoreboardTab
          matchId={match.id}
          shortCode={match.short_code}
          matchTitle={match.title}
          sport={match.sport}
          dateTimeText={formatMatchDateTimeRange(match.starts_at, match.notes, locale)}
          locationName={match.location_name}
          participants={participantsData.participants}
        />
      ) : (
        <>
          {/* Large Slot Selector Chips (up to 4 quick chips + custom selector if match allows > 4) */}
      {isBookable && (
        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
              {t('selectSlotsTitle')}
            </h2>
            <span className="tabular-nums text-xs font-bold text-zinc-600 dark:text-zinc-400">
              {t('totalAmount')}:{' '}
              <strong className="text-zinc-950 dark:text-volt">
                {formatVnd(match.fee_per_slot * safeSelectedSlots, locale)}
              </strong>
            </span>
          </div>

          <div
            className={`grid gap-2.5 ${
              quickSlotOptions.length === 1
                ? 'grid-cols-1'
                : quickSlotOptions.length === 2
                  ? 'grid-cols-2'
                  : quickSlotOptions.length === 3
                    ? 'grid-cols-3'
                    : 'grid-cols-4'
            }`}
          >
            {quickSlotOptions.map((num) => {
              const active = safeSelectedSlots === num;
              return (
                <button
                  key={num}
                  type="button"
                  onClick={() => setSelectedSlots(num)}
                  aria-pressed={active}
                  className={`flex flex-col items-center justify-center rounded-2xl border px-2 py-3.5 transition ${
                    active
                      ? 'border-volt bg-volt/20 text-zinc-950 shadow-volt dark:bg-volt/10 dark:text-white'
                      : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-700'
                  }`}
                >
                  <span
                    className={`tabular-nums text-2xl font-black leading-none ${
                      active
                        ? 'text-zinc-950 dark:text-volt'
                        : 'text-zinc-800 dark:text-zinc-300'
                    }`}
                  >
                    {num}
                  </span>
                  <span className="mt-1.5 text-[11px] font-bold uppercase tracking-wide">
                    {num === 1 ? t('slotSingular') : t('slotPlural')}
                  </span>
                </button>
              );
            })}
          </div>

          {maxBookableSlots > 4 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="min-w-0">
                <p className="text-xs font-extrabold uppercase tracking-wider text-zinc-700 dark:text-zinc-200">
                  {t('customSlotsLabel')}
                </p>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {t('customSlotsHint', { max: maxBookableSlots })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setSelectedSlots((prev) => Math.max(1, Math.min(prev, maxBookableSlots) - 1))
                  }
                  disabled={safeSelectedSlots <= 1}
                  aria-label="-"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 text-base font-black text-zinc-800 transition hover:border-zinc-950 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:border-volt"
                >
                  −
                </button>
                <input
                  type="number"
                  min={1}
                  max={maxBookableSlots}
                  value={safeSelectedSlots}
                  onChange={(e) => {
                    const parsed = Number.parseInt(e.target.value, 10);
                    if (Number.isNaN(parsed)) return;
                    setSelectedSlots(Math.max(1, Math.min(maxBookableSlots, parsed)));
                  }}
                  aria-label={t('customSlotsLabel')}
                  className="h-9 w-16 rounded-xl border border-zinc-300 bg-zinc-50 text-center font-mono text-sm font-black tabular-nums text-zinc-950 outline-none focus:border-zinc-950 dark:border-zinc-700 dark:bg-zinc-950 dark:text-volt dark:focus:border-volt"
                />
                <button
                  type="button"
                  onClick={() =>
                    setSelectedSlots((prev) => Math.min(maxBookableSlots, Math.max(1, prev) + 1))
                  }
                  disabled={safeSelectedSlots >= maxBookableSlots}
                  aria-label="+"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 text-base font-black text-zinc-800 transition hover:border-zinc-950 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:border-volt"
                >
                  +
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Clean Roster & Waitlist */}
      <section className="grid gap-4 sm:grid-cols-2">
        {/* Active Roster */}
        <div className="min-w-0 max-w-full rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-extrabold uppercase tracking-wider text-zinc-950 dark:text-white">
              {t('rosterTitle')}{' '}
              <span className="tabular-nums text-zinc-500 dark:text-zinc-400">
                ({taken}/{match.max_slots})
              </span>
            </h2>
          </div>

          {activeRoster.length === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed border-zinc-200 p-4 text-center text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              {t('noParticipants')}
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {activeRoster.map((p, idx) => {
                const parsedNames = splitParticipantNames(p.display_name);
                const displayNames =
                  parsedNames.length > 0
                    ? parsedNames
                    : [p.display_name.trim() || '—'];
                const isMultiPerson = displayNames.length > 1;

                return (
                  <li
                    key={`${p.display_name}-${idx}`}
                    className={`flex justify-between gap-2.5 rounded-2xl border border-zinc-200/80 bg-zinc-50 px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-950 ${
                      isMultiPerson ? 'items-start' : 'items-center'
                    }`}
                  >
                    <div
                      className={`flex min-w-0 flex-1 gap-2.5 ${
                        isMultiPerson ? 'items-start' : 'items-center'
                      }`}
                    >
                      <span
                        className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${
                          isMultiPerson ? 'mt-0.5' : ''
                        } ${getAvatarTone(p.display_name)}`}
                      >
                        {getInitials(displayNames[0])}
                      </span>

                      {isMultiPerson ? (
                        <ul className="min-w-0 flex-1 space-y-1">
                          {displayNames.map((personName, nameIdx) => (
                            <li
                              key={`${personName}-${nameIdx}`}
                              className="flex min-w-0 items-start gap-1.5 text-sm font-bold leading-snug text-zinc-900 dark:text-zinc-100"
                            >
                              <span
                                aria-hidden="true"
                                className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-400 dark:bg-volt/80"
                              />
                              <span className="min-w-0 whitespace-normal break-words">
                                {personName}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="min-w-0 flex-1 whitespace-normal break-words text-sm font-bold leading-snug text-zinc-900 dark:text-zinc-100">
                          {displayNames[0]}
                        </span>
                      )}
                    </div>

                    <div
                      className={`flex shrink-0 ${
                        isMultiPerson
                          ? 'mt-0.5 flex-col items-end gap-1'
                          : 'items-center gap-1.5'
                      }`}
                    >
                      {p.status === 'confirmed' ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-volt px-2.5 py-1 text-[11px] font-extrabold text-zinc-950">
                          <Check className="h-3 w-3 stroke-[3]" />
                          <span>{t('regConfirmed')}</span>
                        </span>
                      ) : (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-bold text-amber-700 dark:bg-amber-400/15 dark:text-amber-400">
                          <Clock className="h-3 w-3" />
                          <span>{t('regPendingPayment')}</span>
                        </span>
                      )}
                      <span className="shrink-0 rounded-md bg-zinc-200 px-1.5 py-0.5 tabular-nums text-[11px] font-extrabold text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                        ×{p.slots}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Waitlist */}
        <div className="min-w-0 max-w-full rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="text-sm font-extrabold uppercase tracking-wider text-zinc-950 dark:text-white">
            {t('waitlistTitle')}{' '}
            <span className="tabular-nums text-zinc-500 dark:text-zinc-400">
              ({waitlist.length})
            </span>
          </h2>

          {waitlist.length === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed border-zinc-200 p-4 text-center text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              {t('noWaitlist')}
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {waitlist.map((p, idx) => {
                const parsedNames = splitParticipantNames(p.display_name);
                const displayNames =
                  parsedNames.length > 0
                    ? parsedNames
                    : [p.display_name.trim() || '—'];
                const isMultiPerson = displayNames.length > 1;

                return (
                  <li
                    key={`${p.display_name}-w-${idx}`}
                    className={`flex justify-between gap-2.5 rounded-2xl border border-zinc-200/80 bg-zinc-50 px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-950 ${
                      isMultiPerson ? 'items-start' : 'items-center'
                    }`}
                  >
                    <div
                      className={`flex min-w-0 flex-1 gap-2.5 ${
                        isMultiPerson ? 'items-start' : 'items-center'
                      }`}
                    >
                      <span
                        className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-200 font-mono text-xs font-extrabold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 ${
                          isMultiPerson ? 'mt-0.5' : ''
                        }`}
                      >
                        #{idx + 1}
                      </span>

                      {isMultiPerson ? (
                        <ul className="min-w-0 flex-1 space-y-1">
                          {displayNames.map((personName, nameIdx) => (
                            <li
                              key={`${personName}-w-${nameIdx}`}
                              className="flex min-w-0 items-start gap-1.5 text-sm font-bold leading-snug text-zinc-900 dark:text-zinc-100"
                            >
                              <span
                                aria-hidden="true"
                                className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-400 dark:bg-volt/80"
                              />
                              <span className="min-w-0 whitespace-normal break-words">
                                {personName}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="min-w-0 flex-1 whitespace-normal break-words text-sm font-bold leading-snug text-zinc-900 dark:text-zinc-100">
                          {displayNames[0]}
                        </span>
                      )}
                    </div>

                    <div
                      className={`flex shrink-0 ${
                        isMultiPerson
                          ? 'mt-0.5 flex-col items-end gap-1'
                          : 'items-center gap-1.5'
                      }`}
                    >
                      <span className="shrink-0 rounded-full bg-zinc-200 px-2.5 py-1 text-[11px] font-bold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                        {t('regWaitlisted')}
                      </span>
                      <span className="shrink-0 rounded-md bg-zinc-200 px-1.5 py-0.5 tabular-nums text-[11px] font-extrabold text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                        ×{p.slots}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {/* Collapsible Cancellation Policy Card */}
      <section className="rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <button
          type="button"
          onClick={() => setPolicyOpen((prev) => !prev)}
          aria-expanded={policyOpen}
          className="flex w-full items-center justify-between px-5 py-4 text-left"
        >
          <span className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-wider text-zinc-950 dark:text-white">
            <ShieldAlert className="h-4 w-4 text-zinc-500 dark:text-volt" />
            <span>{t('policyTitle')}</span>
          </span>
          <ChevronDown
            className={`h-4 w-4 text-zinc-500 transition-transform ${
              policyOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        {policyOpen && (
          <div className="border-t border-zinc-200 px-5 pb-5 pt-3 dark:border-zinc-800">
            <ul className="list-disc space-y-2 pl-5 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300 sm:text-sm">
              <li>{t('policy1', { hours: match.cancel_cutoff_hours })}</li>
              <li>{t('policy2', { hours: match.cancel_cutoff_hours })}</li>
              <li>{t('policy3')}</li>
            </ul>
          </div>
        )}
      </section>
        </>
      )}

      {/* Sticky Bottom CTA Bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 w-full max-w-full overflow-x-clip border-t border-zinc-200/80 bg-zinc-100/90 px-4 py-3 backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-950/90">
        <div className="mx-auto max-w-4xl">
          {isBookable ? (
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-volt px-5 text-sm font-extrabold uppercase tracking-wider text-zinc-950 shadow-volt transition hover:bg-volt-hover active:scale-[0.99] sm:text-base"
            >
              <span>
                {available > 0 ? t('bookBtn') : t('joinWaitlistBtn')}
              </span>
              <span className="tabular-nums">
                · {formatVnd(match.fee_per_slot * safeSelectedSlots, locale)}
              </span>
            </button>
          ) : (
            <button
              type="button"
              disabled
              className="h-12 w-full rounded-2xl bg-zinc-200 text-sm font-extrabold uppercase tracking-wider text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
            >
              {t('bookingClosed')}
            </button>
          )}
        </div>
      </div>

      <BookingSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        matchId={match.id}
        shortCode={match.short_code}
        startsAt={match.starts_at}
        cancelCutoffHours={match.cancel_cutoff_hours}
        feePerSlot={match.fee_per_slot}
        initialSlots={safeSelectedSlots}
        maxBookableSlots={maxBookableSlots}
        isWaitlistMode={available <= 0}
      />
    </div>
  );
}
