'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Calendar, Clock } from 'lucide-react';
import { useLocale } from '@/lib/i18n/LocaleProvider';

interface DateTimeParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number; // 0-59
}

const pad2 = (n: number) => String(n).padStart(2, '0');

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function partsToVietnamIso(p: DateTimeParts): string {
  const maxDay = getDaysInMonth(p.year, p.month);
  const safeDay = Math.min(p.day, maxDay);
  return `${p.year}-${pad2(p.month)}-${pad2(safeDay)}T${pad2(p.hour)}:${pad2(p.minute)}:00+07:00`;
}

function addMinutesToParts(p: DateTimeParts, deltaMinutes: number): DateTimeParts {
  const d = new Date(p.year, p.month - 1, p.day, p.hour, p.minute + deltaMinutes);
  return {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
    hour: d.getHours(),
    minute: d.getMinutes(),
  };
}

function getDefaultStartParts(): DateTimeParts {
  const now = new Date();
  now.setDate(now.getDate() + 1);
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
    hour: 17,
    minute: 30,
  };
}

function formatReadableDate(p: DateTimeParts, locale: 'vi' | 'en'): string {
  const d = new Date(partsToVietnamIso(p));
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

const MINUTE_OPTIONS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i);

export function CreateMatchForm() {
  const { locale, t } = useLocale();
  const router = useRouter();

  const initialStart = useMemo(() => getDefaultStartParts(), []);

  const [sport, setSport] = useState(t('sportBadminton'));
  const [title, setTitle] = useState('');
  const [startParts, setStartParts] = useState<DateTimeParts>(initialStart);
  const [endHour, setEndHour] = useState(19);
  const [endMinute, setEndMinute] = useState(30);
  const [lockMode, setLockMode] = useState<'start' | '1h' | '2h' | 'custom'>('1h');
  const [customLockParts, setCustomLockParts] = useState<DateTimeParts>(() =>
    addMinutesToParts(initialStart, -60)
  );
  const [locationName, setLocationName] = useState('');
  const [mapUrl, setMapUrl] = useState('');
  const [level, setLevel] = useState('Từ yếu đến trung bình yếu');
  const [feePerSlot, setFeePerSlot] = useState(80000);
  const [maxSlots, setMaxSlots] = useState(1);
  const [courts, setCourts] = useState(1);
  const [cancelCutoffHours, setCancelCutoffHours] = useState(12);
  const [holdMinutes, setHoldMinutes] = useState(15);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const sportPresets = [
    t('sportBadminton'),
    t('sportPickleball'),
    t('sportTennis'),
    t('sportFootball'),
  ];

  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear, currentYear + 1, currentYear + 2];
  const monthNames =
    locale === 'en'
      ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      : Array.from({ length: 12 }, (_, i) => `Tháng ${i + 1}`);

  const startDaysCount = getDaysInMonth(startParts.year, startParts.month);
  const lockDaysCount = getDaysInMonth(customLockParts.year, customLockParts.month);

  const effectiveLockParts = useMemo(() => {
    if (lockMode === 'start') return startParts;
    if (lockMode === '1h') return addMinutesToParts(startParts, -60);
    if (lockMode === '2h') return addMinutesToParts(startParts, -120);
    return customLockParts;
  }, [lockMode, startParts, customLockParts]);

  const applyQuickDate = (mode: 'today' | 'tomorrow' | 'sat' | 'sun') => {
    const d = new Date();
    if (mode === 'tomorrow') {
      d.setDate(d.getDate() + 1);
    } else if (mode === 'sat') {
      const diff = (6 - d.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + diff);
    } else if (mode === 'sun') {
      const diff = (0 - d.getDay() + 7) % 7 || 7;
      d.setDate(d.getDate() + diff);
    }
    setStartParts((prev) => ({
      ...prev,
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      day: d.getDate(),
    }));
  };

  const applyDuration = (minutes: number) => {
    const end = addMinutesToParts(startParts, minutes);
    setEndHour(end.hour);
    setEndMinute(end.minute);
  };

  const formattedFee =
    feePerSlot > 0
      ? new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'vi-VN').format(feePerSlot)
      : '';

  const handleFeeChange = (raw: string) => {
    const digits = raw.replace(/[^0-9]/g, '');
    if (!digits) {
      setFeePerSlot(0);
      return;
    }
    const num = Math.min(Number(digits), 100_000_000);
    setFeePerSlot(num);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const startsIso = partsToVietnamIso(startParts);
    const lockIso = partsToVietnamIso(effectiveLockParts);

    if (new Date(lockIso).getTime() > new Date(startsIso).getTime()) {
      setError(t('errLockAfterStart'));
      return;
    }

    const startTimeStr = `${pad2(startParts.hour)}:${pad2(startParts.minute)}`;
    const endTimeStr = `${pad2(endHour)}:${pad2(endMinute)}`;
    const timeRangeLabel = `${startTimeStr} - ${endTimeStr}`;
    const trimmedNotes = notes.trim();
    const finalNotes =
      !trimmedNotes.includes(timeRangeLabel) && !title.includes(endTimeStr)
        ? trimmedNotes
          ? `${timeRangeLabel} · ${trimmedNotes}`
          : timeRangeLabel
        : trimmedNotes || null;

    setSaving(true);
    try {
      const res = await fetch('/api/host/matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sport,
          title,
          starts_at: startsIso,
          lock_at: lockIso,
          location_name: locationName,
          map_url: mapUrl || null,
          level: level || null,
          fee_per_slot: Number(feePerSlot),
          max_slots: Number(maxSlots),
          courts: Number(courts),
          cancel_cutoff_hours: Number(cancelCutoffHours),
          hold_minutes: Number(holdMinutes),
          notes: finalNotes,
        }),
      });
      const payload = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !payload.id) {
        setError(payload.error || t('errGeneric'));
        setSaving(false);
        return;
      }
      router.push(`/host/matches/${payload.id}`);
      router.refresh();
    } catch {
      setError(t('errGeneric'));
      setSaving(false);
    }
  };

  const inputClass =
    'mt-1.5 h-11 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3 text-sm text-zinc-950 outline-none transition focus:border-zinc-950 focus:ring-2 focus:ring-zinc-950/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white dark:focus:border-volt dark:focus:ring-volt/25';
  const selectClass =
    'h-10 w-full rounded-xl border border-zinc-300 bg-white px-2.5 text-sm font-semibold tabular-nums text-zinc-950 outline-none transition focus:border-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:focus:border-volt';
  const labelClass =
    'block text-xs font-extrabold uppercase tracking-wider text-zinc-700 dark:text-zinc-300';

  return (
    <div className="space-y-4">
      <Link
        href="/host"
        className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3.5 py-1.5 text-xs font-bold text-zinc-700 shadow-sm transition hover:border-zinc-950 hover:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-volt dark:hover:text-white"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        <span>{t('hostDashboardTitle')}</span>
      </Link>

      <form
        onSubmit={handleSubmit}
        className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
      >
        <div className="h-1.5 w-full bg-volt" />
        <div className="space-y-5 p-6">
          <h1 className="text-xl font-extrabold uppercase tracking-tight text-zinc-950 dark:text-white">
            {t('hostCreateMatch')}
          </h1>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>{t('fieldSport')}</label>
              <input
                type="text"
                required
                value={sport}
                onChange={(e) => setSport(e.target.value)}
                className={inputClass}
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {sportPresets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setSport(preset)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-bold transition ${
                      sport === preset
                        ? 'bg-volt text-zinc-950'
                        : 'border border-zinc-200 bg-zinc-50 text-zinc-600 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className={labelClass}>{t('fieldTitle')}</label>
              <input
                type="text"
                required
                maxLength={120}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t('fieldTitlePlaceholder')}
                className={inputClass}
              />
            </div>

            {/* Localized Date & Time Schedule Card */}
            <div className="space-y-4 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-4 dark:border-zinc-800 dark:bg-zinc-950/70 sm:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-zinc-900 dark:text-white">
                  <Calendar className="h-4 w-4 text-zinc-950 dark:text-volt" />
                  <span>{t('startsAt')}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      ['today', t('quickToday')],
                      ['tomorrow', t('quickTomorrow')],
                      ['sat', t('quickSat')],
                      ['sun', t('quickSun')],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => applyQuickDate(key)}
                      className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-bold text-zinc-700 transition hover:border-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-volt"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Start Date + Time Selectors */}
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
                <div>
                  <span className="mb-1 block text-[11px] font-bold text-zinc-500 dark:text-zinc-400">
                    {t('dateDayLabel')}
                  </span>
                  <select
                    value={Math.min(startParts.day, startDaysCount)}
                    onChange={(e) =>
                      setStartParts((p) => ({ ...p, day: Number(e.target.value) }))
                    }
                    className={selectClass}
                  >
                    {Array.from({ length: startDaysCount }, (_, i) => i + 1).map((d) => (
                      <option key={d} value={d}>
                        {pad2(d)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <span className="mb-1 block text-[11px] font-bold text-zinc-500 dark:text-zinc-400">
                    {t('dateMonthLabel')}
                  </span>
                  <select
                    value={startParts.month}
                    onChange={(e) => {
                      const nextMonth = Number(e.target.value);
                      setStartParts((p) => ({
                        ...p,
                        month: nextMonth,
                        day: Math.min(p.day, getDaysInMonth(p.year, nextMonth)),
                      }));
                    }}
                    className={selectClass}
                  >
                    {monthNames.map((name, idx) => (
                      <option key={name} value={idx + 1}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <span className="mb-1 block text-[11px] font-bold text-zinc-500 dark:text-zinc-400">
                    {t('dateYearLabel')}
                  </span>
                  <select
                    value={startParts.year}
                    onChange={(e) =>
                      setStartParts((p) => ({ ...p, year: Number(e.target.value) }))
                    }
                    className={selectClass}
                  >
                    {yearOptions.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <span className="mb-1 block text-[11px] font-bold text-zinc-500 dark:text-zinc-400">
                    {t('timeHourLabel')}
                  </span>
                  <select
                    value={startParts.hour}
                    onChange={(e) =>
                      setStartParts((p) => ({ ...p, hour: Number(e.target.value) }))
                    }
                    className={selectClass}
                  >
                    {HOUR_OPTIONS.map((h) => (
                      <option key={h} value={h}>
                        {pad2(h)}h
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <span className="mb-1 block text-[11px] font-bold text-zinc-500 dark:text-zinc-400">
                    {t('timeMinuteLabel')}
                  </span>
                  <select
                    value={startParts.minute}
                    onChange={(e) =>
                      setStartParts((p) => ({ ...p, minute: Number(e.target.value) }))
                    }
                    className={selectClass}
                  >
                    {MINUTE_OPTIONS.map((m) => (
                      <option key={m} value={m}>
                        {pad2(m)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* End Time Row */}
              <div className="border-t border-dashed border-zinc-200 pt-3.5 dark:border-zinc-800">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-zinc-900 dark:text-white">
                    <Clock className="h-4 w-4 text-zinc-950 dark:text-volt" />
                    <span>{t('endsAt')}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      [90, '+1.5h'],
                      [120, '+2h'],
                      [180, '+3h'],
                    ].map(([mins, label]) => (
                      <button
                        key={String(label)}
                        type="button"
                        onClick={() => applyDuration(Number(mins))}
                        className="rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-[11px] font-bold text-zinc-700 transition hover:border-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-volt"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-2.5 grid max-w-xs grid-cols-2 gap-2.5">
                  <select
                    aria-label={t('endsAt')}
                    value={endHour}
                    onChange={(e) => setEndHour(Number(e.target.value))}
                    className={selectClass}
                  >
                    {HOUR_OPTIONS.map((h) => (
                      <option key={h} value={h}>
                        {pad2(h)}h
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label={t('timeMinuteLabel')}
                    value={endMinute}
                    onChange={(e) => setEndMinute(Number(e.target.value))}
                    className={selectClass}
                  >
                    {MINUTE_OPTIONS.map((m) => (
                      <option key={m} value={m}>
                        {pad2(m)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Lock Time Row */}
              <div className="border-t border-dashed border-zinc-200 pt-3.5 dark:border-zinc-800">
                <span className={labelClass}>{t('lockAt')}</span>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(
                    [
                      ['start', t('lockPresetStart')],
                      ['1h', t('lockPreset1h')],
                      ['2h', t('lockPreset2h')],
                      ['custom', t('lockPresetCustom')],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setLockMode(key);
                        if (key === 'custom') {
                          setCustomLockParts(effectiveLockParts);
                        }
                      }}
                      className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                        lockMode === key
                          ? 'bg-volt text-zinc-950'
                          : 'border border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {lockMode === 'custom' && (
                  <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-5">
                    <select
                      value={Math.min(customLockParts.day, lockDaysCount)}
                      onChange={(e) =>
                        setCustomLockParts((p) => ({
                          ...p,
                          day: Number(e.target.value),
                        }))
                      }
                      className={selectClass}
                    >
                      {Array.from({ length: lockDaysCount }, (_, i) => i + 1).map(
                        (d) => (
                          <option key={d} value={d}>
                            {pad2(d)}
                          </option>
                        )
                      )}
                    </select>
                    <select
                      value={customLockParts.month}
                      onChange={(e) => {
                        const nextMonth = Number(e.target.value);
                        setCustomLockParts((p) => ({
                          ...p,
                          month: nextMonth,
                          day: Math.min(p.day, getDaysInMonth(p.year, nextMonth)),
                        }));
                      }}
                      className={selectClass}
                    >
                      {monthNames.map((name, idx) => (
                        <option key={name} value={idx + 1}>
                          {name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={customLockParts.year}
                      onChange={(e) =>
                        setCustomLockParts((p) => ({
                          ...p,
                          year: Number(e.target.value),
                        }))
                      }
                      className={selectClass}
                    >
                      {yearOptions.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                    <select
                      value={customLockParts.hour}
                      onChange={(e) =>
                        setCustomLockParts((p) => ({
                          ...p,
                          hour: Number(e.target.value),
                        }))
                      }
                      className={selectClass}
                    >
                      {HOUR_OPTIONS.map((h) => (
                        <option key={h} value={h}>
                          {pad2(h)}h
                        </option>
                      ))}
                    </select>
                    <select
                      value={customLockParts.minute}
                      onChange={(e) =>
                        setCustomLockParts((p) => ({
                          ...p,
                          minute: Number(e.target.value),
                        }))
                      }
                      className={selectClass}
                    >
                      {MINUTE_OPTIONS.map((m) => (
                        <option key={m} value={m}>
                          {pad2(m)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Live Localized Preview Strip */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-xs dark:border-zinc-800 dark:bg-zinc-900">
                <span className="font-bold text-zinc-900 dark:text-white">
                  {formatReadableDate(startParts, locale)} ·{' '}
                  <span className="tabular-nums text-zinc-950 dark:text-volt">
                    {pad2(startParts.hour)}:{pad2(startParts.minute)} – {pad2(endHour)}:
                    {pad2(endMinute)}
                  </span>
                </span>
                <span className="tabular-nums text-zinc-500 dark:text-zinc-400">
                  {t('lockAt')}: {pad2(effectiveLockParts.hour)}:
                  {pad2(effectiveLockParts.minute)} ({pad2(effectiveLockParts.day)}/
                  {pad2(effectiveLockParts.month)})
                </span>
              </div>
            </div>

            <div>
              <label className={labelClass}>{t('location')}</label>
              <input
                type="text"
                required
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
                placeholder={t('fieldLocationPlaceholder')}
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>{t('fieldMapUrl')}</label>
              <input
                type="url"
                value={mapUrl}
                onChange={(e) => setMapUrl(e.target.value)}
                placeholder="https://maps.app.goo.gl/..."
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>{t('feePerSlot')}</label>
              <div className="relative mt-1.5">
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  value={formattedFee}
                  onChange={(e) => handleFeeChange(e.target.value)}
                  placeholder="50.000"
                  className="h-11 w-full rounded-xl border border-zinc-300 bg-zinc-50 pl-3 pr-14 text-sm font-bold tabular-nums text-zinc-950 outline-none transition focus:border-zinc-950 focus:ring-2 focus:ring-zinc-950/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white dark:focus:border-volt dark:focus:ring-volt/25"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-md bg-zinc-200 px-2 py-0.5 text-[11px] font-extrabold tracking-wider text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  VND
                </span>
              </div>
            </div>

            <div>
              <label className={labelClass}>{t('fieldMaxSlots')}</label>
              <input
                type="number"
                min={1}
                required
                value={maxSlots}
                onChange={(e) => setMaxSlots(Number(e.target.value))}
                className={`${inputClass} tabular-nums`}
              />
            </div>

            <div>
              <label className={labelClass}>{t('courts')}</label>
              <input
                type="number"
                min={1}
                value={courts}
                onChange={(e) => setCourts(Number(e.target.value))}
                className={`${inputClass} tabular-nums`}
              />
            </div>

            <div>
              <label className={labelClass}>{t('level')}</label>
              <input
                type="text"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                placeholder={t('fieldLevelPlaceholder')}
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>{t('fieldCancelCutoff')}</label>
              <input
                type="number"
                min={0}
                value={cancelCutoffHours}
                onChange={(e) => setCancelCutoffHours(Number(e.target.value))}
                className={`${inputClass} tabular-nums`}
              />
            </div>

            <div>
              <label className={labelClass}>{t('fieldHoldMinutes')}</label>
              <input
                type="number"
                min={1}
                value={holdMinutes}
                onChange={(e) => setHoldMinutes(Number(e.target.value))}
                className={`${inputClass} tabular-nums`}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>{t('notes')}</label>
            <textarea
              maxLength={500}
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-zinc-300 bg-zinc-50 p-3 text-sm text-zinc-950 outline-none transition focus:border-zinc-950 focus:ring-2 focus:ring-zinc-950/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white dark:focus:border-volt dark:focus:ring-volt/25"
            />
          </div>

          {error && (
            <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="h-12 w-full rounded-xl bg-volt text-sm font-extrabold uppercase tracking-wide text-zinc-950 shadow-sm transition hover:bg-volt-hover disabled:opacity-60"
          >
            {saving ? t('submitting') : t('hostCreateMatch')}
          </button>
        </div>
      </form>
    </div>
  );
}
