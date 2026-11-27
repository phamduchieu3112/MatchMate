'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Calendar,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  MapPin,
  Sparkles,
  Ticket,
  Users,
  Zap,
} from 'lucide-react';
import { useLocale } from '@/lib/i18n/LocaleProvider';
import { formatMatchDateTimeRange, formatVnd } from '@/lib/format';
import { translateMatchStatus } from '@/lib/i18n/helpers';
import { extractMatchCode } from '@/lib/ui-helpers';
import type { PublicMatch } from '@/lib/types';
import { MatchMateLogo } from '@/components/MatchMateLogo';
import { MyBookingsBanner } from '@/components/player/MyBookingsBanner';

interface HomeDiscoveryClientProps {
  initialMatches: PublicMatch[];
}

function getVnDateKey(isoOrDate: string | Date): string {
  const date = typeof isoOrDate === 'string' ? new Date(isoOrDate) : isoOrDate;
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const y = parts.find((p) => p.type === 'year')?.value ?? '';
  const m = parts.find((p) => p.type === 'month')?.value ?? '';
  const d = parts.find((p) => p.type === 'day')?.value ?? '';
  return `${y}-${m}-${d}`;
}

function getWeekDays(weekOffset: number): Array<{
  dateKey: string;
  weekdayLabel: string;
  dayNum: string;
  isToday: boolean;
}> {
  const todayKey = getVnDateKey(new Date());
  const [ty, tm, td] = todayKey.split('-').map(Number);
  const anchorUtc = new Date(Date.UTC(ty, tm - 1, td, 12, 0, 0));
  const jsDay = anchorUtc.getUTCDay(); // 0 = Sun, 1 = Mon...
  const mondayDelta = jsDay === 0 ? -6 : 1 - jsDay;
  const mondayUtc = new Date(
    anchorUtc.getTime() + (mondayDelta + weekOffset * 7) * 86_400_000
  );

  const viLabels = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
  const days = [];
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(mondayUtc.getTime() + i * 86_400_000);
    const key = d.toISOString().slice(0, 10);
    days.push({
      dateKey: key,
      weekdayLabel: viLabels[i],
      dayNum: `${d.getUTCDate()}/${d.getUTCMonth() + 1}`,
      isToday: key === todayKey,
    });
  }
  return days;
}

export function HomeDiscoveryClient({
  initialMatches,
}: HomeDiscoveryClientProps) {
  const { locale, t } = useLocale();
  const router = useRouter();

  const [codeInput, setCodeInput] = useState('');
  const [codeError, setCodeError] = useState('');

  const [viewMode, setViewMode] = useState<'feed' | 'calendar'>('feed');
  const [sportFilter, setSportFilter] = useState<string>('all');
  const [levelFilter, setLevelFilter] = useState<string>('all');
  const [openOnly, setOpenOnly] = useState<boolean>(false);

  const [weekOffset, setWeekOffset] = useState<number>(0);
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);

  const handleQuickJoin = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = extractMatchCode(codeInput);
    if (!/^[A-Z0-9]{6}$/.test(cleaned)) {
      setCodeError(t('homeInvalidCode'));
      return;
    }
    setCodeError('');
    router.push(`/keo/${cleaned}`);
  };

  const sportOptions = useMemo(() => {
    const set = new Set<string>(['Cầu lông', 'Pickleball']);
    for (const m of initialMatches) {
      if (m.sport?.trim()) set.add(m.sport.trim());
    }
    return Array.from(set);
  }, [initialMatches]);

  const levelOptions = useMemo(() => {
    const set = new Set<string>();
    for (const m of initialMatches) {
      if (m.level?.trim()) set.add(m.level.trim());
    }
    return Array.from(set);
  }, [initialMatches]);

  const filteredMatches = useMemo(() => {
    return initialMatches.filter((m) => {
      if (
        sportFilter !== 'all' &&
        m.sport.trim().toLowerCase() !== sportFilter.toLowerCase()
      ) {
        return false;
      }
      if (
        levelFilter !== 'all' &&
        (m.level ?? '').trim().toLowerCase() !== levelFilter.toLowerCase()
      ) {
        return false;
      }
      if (openOnly) {
        const spotsLeft = Math.max(m.max_slots - m.slots_taken, 0);
        if (m.status !== 'open' || spotsLeft <= 0) return false;
      }
      return true;
    });
  }, [initialMatches, sportFilter, levelFilter, openOnly]);

  const weekDays = useMemo(() => getWeekDays(weekOffset), [weekOffset]);

  const matchesByDay = useMemo(() => {
    const map = new Map<string, PublicMatch[]>();
    for (const m of filteredMatches) {
      const key = getVnDateKey(m.starts_at);
      if (!key) continue;
      const list = map.get(key) ?? [];
      list.push(m);
      map.set(key, list);
    }
    return map;
  }, [filteredMatches]);

  const calendarVisibleDays = useMemo(() => {
    if (selectedDayKey) {
      return weekDays.filter((d) => d.dateKey === selectedDayKey);
    }
    return weekDays;
  }, [weekDays, selectedDayKey]);

  return (
    <div className="space-y-6">
      {/* Compact Athletic Hero + Quick Join Bar */}
      <section className="relative overflow-hidden rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <MatchMateLogo variant="full" size="md" />
          <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-100 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-zinc-900 dark:border-volt/30 dark:bg-volt/10 dark:text-volt">
            <Zap className="h-3.5 w-3.5" />
            <span>{t('homeHeroBadge')}</span>
          </span>
        </div>

        <h1 className="mt-4 text-2xl font-extrabold uppercase tracking-tight text-zinc-950 dark:text-white sm:text-3xl">
          {t('homeHeroTitle')}
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          {t('homeHeroSubtitle')}
        </p>

        {/* Compact Quick Join Bar */}
        <form
          onSubmit={handleQuickJoin}
          className="mt-4 flex flex-col gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-2.5 dark:border-zinc-800 dark:bg-zinc-950 sm:flex-row sm:items-center"
        >
          <div className="flex items-center gap-2 px-2 text-xs font-extrabold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            <Ticket className="h-4 w-4 shrink-0 text-zinc-950 dark:text-volt" />
            <span className="whitespace-nowrap">{t('homeQuickJoinLabel')}</span>
          </div>
          <div className="flex flex-1 gap-2">
            <input
              type="text"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              placeholder={t('homeCodePlaceholder')}
              aria-label={t('homeQuickJoinLabel')}
              className="h-10 min-w-0 flex-1 rounded-xl border border-zinc-300 bg-white px-3 font-mono text-sm font-bold tracking-wider text-zinc-950 outline-none transition placeholder:font-sans placeholder:text-xs placeholder:font-normal placeholder:tracking-normal placeholder:text-zinc-400 focus:border-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:focus:border-volt"
            />
            <button
              type="submit"
              className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-volt px-4 text-xs font-extrabold uppercase tracking-wide text-zinc-950 shadow-sm transition hover:bg-volt-hover"
            >
              <span>{t('homeGoBtn')}</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </form>
        {codeError && (
          <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
            {codeError}
          </p>
        )}
      </section>

      {/* My Recent Bookings */}
      <MyBookingsBanner variant="section" />

      {/* Public Discovery Feed & Weekly Calendar */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold uppercase tracking-tight text-zinc-950 dark:text-white">
              {t('homeFeedTitle')}
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {t('homeFeedSubtitle')}
            </p>
          </div>

          {/* Feed vs Weekly Calendar Toggle */}
          <div className="inline-flex rounded-full border border-zinc-200 bg-white p-1 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <button
              type="button"
              onClick={() => setViewMode('feed')}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-extrabold uppercase tracking-wide transition ${
                viewMode === 'feed'
                  ? 'bg-volt text-zinc-950 shadow-sm'
                  : 'text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span>{t('homeViewFeed')}</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('calendar')}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-extrabold uppercase tracking-wide transition ${
                viewMode === 'calendar'
                  ? 'bg-volt text-zinc-950 shadow-sm'
                  : 'text-zinc-600 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white'
              }`}
            >
              <Calendar className="h-3.5 w-3.5" />
              <span>{t('homeViewCalendar')}</span>
            </button>
          </div>
        </div>

        {/* Filters Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          {/* Sport Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSportFilter('all')}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                sportFilter === 'all'
                  ? 'bg-zinc-950 text-volt dark:bg-volt dark:text-zinc-950'
                  : 'border border-zinc-200 bg-zinc-50 text-zinc-600 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300'
              }`}
            >
              {t('homeFilterSportAll')}
            </button>
            {sportOptions.map((sp) => (
              <button
                key={sp}
                type="button"
                onClick={() => setSportFilter(sp)}
                className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                  sportFilter.toLowerCase() === sp.toLowerCase()
                    ? 'bg-zinc-950 text-volt dark:bg-volt dark:text-zinc-950'
                    : 'border border-zinc-200 bg-zinc-50 text-zinc-600 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300'
                }`}
              >
                {sp}
              </button>
            ))}
          </div>

          {/* Level Select & Open Slots Toggle */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
              aria-label={t('level')}
              className="h-8 rounded-full border border-zinc-200 bg-zinc-50 px-3 text-xs font-bold text-zinc-700 outline-none focus:border-zinc-950 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:focus:border-volt"
            >
              <option value="all">{t('homeFilterLevelAll')}</option>
              {levelOptions.map((lv) => (
                <option key={lv} value={lv}>
                  {lv}
                </option>
              ))}
            </select>

            <button
              type="button"
              role="switch"
              aria-checked={openOnly}
              onClick={() => setOpenOnly((prev) => !prev)}
              className={`inline-flex h-8 items-center gap-2 rounded-full border px-3 text-xs font-bold transition ${
                openOnly
                  ? 'border-volt bg-volt/20 text-zinc-950 dark:bg-volt/15 dark:text-volt'
                  : 'border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300'
              }`}
            >
              <span
                className={`h-2 w-2 rounded-full ${
                  openOnly ? 'bg-emerald-500 dark:bg-volt' : 'bg-zinc-400'
                }`}
              />
              <span>{t('homeFilterOpenOnly')}</span>
            </button>
          </div>
        </div>

        {/* FEED VIEW */}
        {viewMode === 'feed' && (
          <>
            {filteredMatches.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                {t('homeNoMatchesFilter')}
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {filteredMatches.map((m) => {
                  const spotsLeft = Math.max(m.max_slots - m.slots_taken, 0);
                  const pct =
                    m.max_slots > 0
                      ? Math.min(100, Math.round((m.slots_taken / m.max_slots) * 100))
                      : 0;

                  return (
                    <Link
                      key={m.id}
                      href={`/keo/${m.short_code}`}
                      className="group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-950 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-volt"
                    >
                      <div className="h-1 w-full bg-volt" />
                      <div className="space-y-3 p-5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <span className="rounded-full bg-zinc-950 px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-wider text-volt dark:bg-volt dark:text-zinc-950">
                              {m.sport}
                            </span>
                            <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 font-mono text-[11px] font-bold text-zinc-700 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300">
                              #{m.short_code}
                            </span>
                          </div>
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase ${
                              m.status === 'open'
                                ? 'bg-emerald-500/15 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-400'
                                : 'bg-amber-500/15 text-amber-700 dark:bg-amber-400/15 dark:text-amber-400'
                            }`}
                          >
                            {translateMatchStatus(m.status, t)}
                          </span>
                        </div>

                        <div>
                          <h3 className="line-clamp-2 text-base font-extrabold uppercase tracking-tight text-zinc-950 transition group-hover:text-zinc-700 dark:text-white dark:group-hover:text-volt">
                            {m.title}
                          </h3>
                          <div className="mt-2 space-y-1 text-xs text-zinc-600 dark:text-zinc-300">
                            <p className="flex items-center gap-1.5 font-semibold">
                              <Calendar className="h-3.5 w-3.5 shrink-0 text-zinc-950 dark:text-volt" />
                              <span>
                                {formatMatchDateTimeRange(m.starts_at, m.notes, locale)}
                              </span>
                            </p>
                            <p className="flex items-center gap-1.5">
                              <MapPin className="h-3.5 w-3.5 shrink-0 text-rose-500" />
                              <span className="truncate">{m.location_name}</span>
                            </p>
                            {m.level && (
                              <p className="flex items-center gap-1.5">
                                <Sparkles className="h-3.5 w-3.5 shrink-0 text-zinc-950 dark:text-volt" />
                                <span>
                                  {t('level')}:{' '}
                                  <strong className="text-zinc-900 dark:text-white">
                                    {m.level}
                                  </strong>
                                </span>
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Perforated Divider */}
                      <div className="relative flex items-center">
                        <span
                          aria-hidden="true"
                          className="-ml-2.5 h-5 w-5 shrink-0 rounded-full border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950"
                        />
                        <div className="w-full border-t border-dashed border-zinc-200 dark:border-zinc-800" />
                        <span
                          aria-hidden="true"
                          className="-mr-2.5 h-5 w-5 shrink-0 rounded-full border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950"
                        />
                      </div>

                      <div className="space-y-2.5 px-5 pb-4 pt-3">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="tabular-nums text-lg font-black text-zinc-950 dark:text-white">
                            {formatVnd(m.fee_per_slot, locale)}{' '}
                            <span className="text-[11px] font-bold uppercase text-zinc-500">
                              {t('perSlot')}
                            </span>
                          </span>
                          <span className="inline-flex items-center gap-1 text-xs font-extrabold">
                            <Users className="h-3.5 w-3.5 text-zinc-400" />
                            {spotsLeft > 0 ? (
                              <span className="tabular-nums text-emerald-700 dark:text-volt">
                                {spotsLeft} {t('slotsLeft')}
                              </span>
                            ) : (
                              <span className="text-amber-600 dark:text-amber-400">
                                {t('waitlistBadge')} ({m.slots_taken}/{m.max_slots})
                              </span>
                            )}
                          </span>
                        </div>

                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                          <div
                            className="h-full rounded-full bg-zinc-950 dark:bg-volt"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* WEEKLY CALENDAR VIEW (Mon - Sun) */}
        {viewMode === 'calendar' && (
          <div className="space-y-4 rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setWeekOffset((w) => w - 1);
                    setSelectedDayKey(null);
                  }}
                  className="inline-flex h-8 items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-3 text-xs font-bold text-zinc-700 transition hover:border-zinc-950 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-volt"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span>{t('homePrevWeek')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWeekOffset(0);
                    setSelectedDayKey(null);
                  }}
                  className="h-8 rounded-full border border-zinc-200 bg-zinc-50 px-3 text-xs font-bold text-zinc-700 transition hover:border-zinc-950 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-volt"
                >
                  {t('homeThisWeek')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setWeekOffset((w) => w + 1);
                    setSelectedDayKey(null);
                  }}
                  className="inline-flex h-8 items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-3 text-xs font-bold text-zinc-700 transition hover:border-zinc-950 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-volt"
                >
                  <span>{t('homeNextWeek')}</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>

              {selectedDayKey && (
                <button
                  type="button"
                  onClick={() => setSelectedDayKey(null)}
                  className="text-xs font-bold text-zinc-500 underline underline-offset-4 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-volt"
                >
                  {t('allFilter')}
                </button>
              )}
            </div>

            {/* Mon-Sun Strip */}
            <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
              {weekDays.map((day) => {
                const count = (matchesByDay.get(day.dateKey) ?? []).length;
                const isSelected = selectedDayKey === day.dateKey;
                return (
                  <button
                    key={day.dateKey}
                    type="button"
                    onClick={() =>
                      setSelectedDayKey((prev) =>
                        prev === day.dateKey ? null : day.dateKey
                      )
                    }
                    className={`flex flex-col items-center justify-center rounded-2xl border px-1 py-2.5 text-center transition ${
                      isSelected
                        ? 'border-volt bg-volt text-zinc-950 shadow-sm'
                        : count > 0
                          ? 'border-zinc-900/20 bg-zinc-950 text-white dark:border-volt/50 dark:bg-volt/15 dark:text-white'
                          : 'border-zinc-200 bg-zinc-50 text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400'
                    }`}
                  >
                    <span className="text-[10px] font-extrabold uppercase tracking-wider">
                      {day.weekdayLabel}
                    </span>
                    <span className="mt-0.5 tabular-nums text-xs font-black sm:text-sm">
                      {day.dayNum}
                    </span>
                    <span className="mt-1 flex h-4 items-center justify-center">
                      {count > 0 ? (
                        <span
                          className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-black ${
                            isSelected
                              ? 'bg-zinc-950 text-volt'
                              : 'bg-volt text-zinc-950'
                          }`}
                        >
                          {count}
                        </span>
                      ) : day.isToday ? (
                        <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
                      ) : null}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Sessions for the selected week / day */}
            <div className="space-y-3 pt-1">
              {calendarVisibleDays.map((day) => {
                const dayMatches = matchesByDay.get(day.dateKey) ?? [];
                if (!selectedDayKey && dayMatches.length === 0) return null;

                return (
                  <div
                    key={day.dateKey}
                    className="space-y-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-950"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold uppercase tracking-wider text-zinc-700 dark:text-volt">
                        {day.weekdayLabel} · {day.dayNum}
                      </span>
                      <span className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                        {dayMatches.length > 0
                          ? t('homeSessionsCount', { count: dayMatches.length })
                          : t('homeDayNoSessions')}
                      </span>
                    </div>

                    {dayMatches.length > 0 && (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {dayMatches.map((m) => {
                          const spotsLeft = Math.max(m.max_slots - m.slots_taken, 0);
                          return (
                            <Link
                              key={m.id}
                              href={`/keo/${m.short_code}`}
                              className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white p-3 transition hover:border-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-volt"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="rounded bg-zinc-950 px-1.5 py-0.5 text-[10px] font-extrabold uppercase text-volt dark:bg-volt dark:text-zinc-950">
                                    {m.sport}
                                  </span>
                                  <span className="font-mono text-[11px] font-bold text-zinc-500">
                                    #{m.short_code}
                                  </span>
                                </div>
                                <p className="mt-1 truncate text-sm font-extrabold text-zinc-950 dark:text-white">
                                  {m.title}
                                </p>
                                <p className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                                  {formatMatchDateTimeRange(m.starts_at, m.notes, locale)} ·{' '}
                                  {m.location_name}
                                </p>
                              </div>
                              <div className="shrink-0 text-right">
                                <p className="tabular-nums text-xs font-black text-zinc-950 dark:text-white">
                                  {formatVnd(m.fee_per_slot, locale)}
                                </p>
                                <p className="mt-0.5 tabular-nums text-[11px] font-bold text-emerald-600 dark:text-volt">
                                  {spotsLeft > 0
                                    ? `${spotsLeft} ${t('slotsLeft')}`
                                    : t('waitlistBadge')}
                                </p>
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {!selectedDayKey &&
                weekDays.every((d) => (matchesByDay.get(d.dateKey) ?? []).length === 0) && (
                  <p className="rounded-2xl border border-dashed border-zinc-300 p-6 text-center text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                    {t('homeNoMatchesFilter')}
                  </p>
                )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
