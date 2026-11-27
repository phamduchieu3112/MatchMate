'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useLocale } from '@/lib/i18n/LocaleProvider';
import {
  composeNotesWithTimeRange,
  extractMatchTimeRange,
  stripTimeRangeFromNotes,
} from '@/lib/format';
import type { PublicMatch } from '@/lib/types';

interface DateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function isoToVietnamParts(iso: string): DateTimeParts {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    const now = new Date();
    return {
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      day: now.getDate(),
      hour: 18,
      minute: 0,
    };
  }
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(d);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  const rawHour = get('hour');
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: rawHour === 24 ? 0 : rawHour,
    minute: get('minute'),
  };
}

function partsToVietnamIso(p: DateTimeParts): string {
  const maxDay = getDaysInMonth(p.year, p.month);
  const safeDay = Math.min(p.day, maxDay);
  return `${p.year}-${pad2(p.month)}-${pad2(safeDay)}T${pad2(p.hour)}:${pad2(p.minute)}:00+07:00`;
}

function getInitialEndTime(
  startParts: DateTimeParts,
  notes: string | null
): { hour: number; minute: number } {
  const parsed = extractMatchTimeRange(notes);
  if (parsed) {
    const [eh, em] = parsed.endTime.split(':').map(Number);
    return { hour: eh, minute: em };
  }
  const d = new Date(
    startParts.year,
    startParts.month - 1,
    startParts.day,
    startParts.hour,
    startParts.minute + 120
  );
  return { hour: d.getHours(), minute: d.getMinutes() };
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i);
const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, i) => i * 5);

export function EditMatchModal({
  open,
  match,
  onClose,
  onSaved,
}: {
  open: boolean;
  match: PublicMatch;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { locale, t } = useLocale();

  const [sport, setSport] = useState(match.sport);
  const [title, setTitle] = useState(match.title);
  const [startParts, setStartParts] = useState<DateTimeParts>(() =>
    isoToVietnamParts(match.starts_at)
  );
  const [endHour, setEndHour] = useState(() =>
    getInitialEndTime(isoToVietnamParts(match.starts_at), match.notes).hour
  );
  const [endMinute, setEndMinute] = useState(() =>
    getInitialEndTime(isoToVietnamParts(match.starts_at), match.notes).minute
  );
  const [lockParts, setLockParts] = useState<DateTimeParts>(() =>
    isoToVietnamParts(match.lock_at)
  );
  const [locationName, setLocationName] = useState(match.location_name);
  const [mapUrl, setMapUrl] = useState(match.map_url ?? '');
  const [level, setLevel] = useState(match.level ?? '');
  const [feePerSlot, setFeePerSlot] = useState(match.fee_per_slot);
  const [maxSlots, setMaxSlots] = useState(match.max_slots);
  const [courtNumbers, setCourtNumbers] = useState(match.court_numbers ?? '');
  const [cancelCutoffHours, setCancelCutoffHours] = useState(
    match.cancel_cutoff_hours
  );
  const [holdMinutes, setHoldMinutes] = useState(match.hold_minutes);
  const [notes, setNotes] = useState(() => stripTimeRangeFromNotes(match.notes) ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const nextStart = isoToVietnamParts(match.starts_at);
    const nextEnd = getInitialEndTime(nextStart, match.notes);
    setSport(match.sport);
    setTitle(match.title);
    setStartParts(nextStart);
    setEndHour(nextEnd.hour);
    setEndMinute(nextEnd.minute);
    setLockParts(isoToVietnamParts(match.lock_at));
    setLocationName(match.location_name);
    setMapUrl(match.map_url ?? '');
    setLevel(match.level ?? '');
    setFeePerSlot(match.fee_per_slot);
    setMaxSlots(match.max_slots);
    setCourtNumbers(match.court_numbers ?? '');
    setCancelCutoffHours(match.cancel_cutoff_hours);
    setHoldMinutes(match.hold_minutes);
    setNotes(stripTimeRangeFromNotes(match.notes) ?? '');
    setError('');
  }, [open, match]);

  if (!open) return null;

  const sportPresets = [
    t('sportBadminton'),
    t('sportPickleball'),
    t('sportTennis'),
    t('sportFootball'),
    t('sportVolleyball'),
    t('sportBasketball'),
    t('sportTableTennis'),
    t('sportBilliards'),
    t('sportRunning'),
  ];

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from(
    new Set([currentYear, currentYear + 1, currentYear + 2, startParts.year, lockParts.year])
  ).sort((a, b) => a - b);

  const monthNames =
    locale === 'en'
      ? ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      : Array.from({ length: 12 }, (_, i) => `Tháng ${i + 1}`);

  const startDaysCount = getDaysInMonth(startParts.year, startParts.month);
  const lockDaysCount = getDaysInMonth(lockParts.year, lockParts.month);

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
    setFeePerSlot(Math.min(Number(digits), 100_000_000));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const startsIso = partsToVietnamIso(startParts);
    const lockIso = partsToVietnamIso(lockParts);

    if (new Date(lockIso).getTime() > new Date(startsIso).getTime()) {
      setError(t('errLockAfterStart'));
      return;
    }

    if (maxSlots < match.slots_taken) {
      setError(t('errMaxSlotsBelowTaken', { taken: match.slots_taken }));
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/host/matches/${match.id}/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sport,
          title,
          starts_at: startsIso,
          lock_at: lockIso,
          location_name: locationName,
          map_url: mapUrl.trim() || null,
          level: level.trim() || null,
          fee_per_slot: Number(feePerSlot),
          max_slots: Number(maxSlots),
          court_numbers: courtNumbers.trim() || null,
          cancel_cutoff_hours: Number(cancelCutoffHours),
          hold_minutes: Number(holdMinutes),
          notes: composeNotesWithTimeRange(
            `${pad2(startParts.hour)}:${pad2(startParts.minute)}`,
            `${pad2(endHour)}:${pad2(endMinute)}`,
            notes
          ),
        }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        if (payload.error === 'max_slots_below_taken') {
          setError(t('errMaxSlotsBelowTaken', { taken: match.slots_taken }));
        } else if (payload.error === 'lock_after_start') {
          setError(t('errLockAfterStart'));
        } else {
          setError(payload.error || t('errGeneric'));
        }
        setSaving(false);
        return;
      }
      setSaving(false);
      onSaved();
      onClose();
    } catch {
      setError(t('errGeneric'));
      setSaving(false);
    }
  };

  const inputClass =
    'mt-1.5 h-10 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3 text-sm text-zinc-950 outline-none transition focus:border-zinc-950 focus:ring-2 focus:ring-zinc-950/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white dark:focus:border-volt dark:focus:ring-volt/25';
  const selectClass =
    'h-9 w-full rounded-xl border border-zinc-300 bg-white px-2 text-xs font-semibold tabular-nums text-zinc-950 outline-none transition focus:border-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:focus:border-volt';
  const labelClass =
    'block text-[11px] font-extrabold uppercase tracking-wider text-zinc-700 dark:text-zinc-300';

  const startMinuteOptions = MINUTE_OPTIONS.includes(startParts.minute)
    ? MINUTE_OPTIONS
    : [...MINUTE_OPTIONS, startParts.minute].sort((a, b) => a - b);
  const endMinuteOptions = MINUTE_OPTIONS.includes(endMinute)
    ? MINUTE_OPTIONS
    : [...MINUTE_OPTIONS, endMinute].sort((a, b) => a - b);
  const lockMinuteOptions = MINUTE_OPTIONS.includes(lockParts.minute)
    ? MINUTE_OPTIONS
    : [...MINUTE_OPTIONS, lockParts.minute].sort((a, b) => a - b);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 p-3 backdrop-blur-sm sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t('hostEditMatchTitle')}
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
        <div className="h-1.5 w-full bg-volt" />
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <h2 className="text-base font-extrabold uppercase tracking-tight text-zinc-950 dark:text-white">
            {t('hostEditMatchTitle')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('hostEditMatchClose')}
            className="rounded-full p-1.5 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-950 dark:hover:bg-zinc-800 dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto p-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>{t('fieldSport')}</label>
              <input
                type="text"
                required
                maxLength={40}
                value={sport}
                onChange={(e) => setSport(e.target.value)}
                className={inputClass}
              />
              <div className="mt-1.5 flex flex-wrap gap-1">
                {sportPresets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setSport(preset)}
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold transition ${
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
                className={inputClass}
              />
            </div>

            {/* Start Date & Time */}
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50/80 p-3 dark:border-zinc-800 dark:bg-zinc-950/70 sm:col-span-2">
              <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                {t('startsAt')}
              </p>
              <div className="grid grid-cols-5 gap-2">
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
                <select
                  value={startParts.year}
                  onChange={(e) => {
                    const nextYear = Number(e.target.value);
                    setStartParts((p) => ({
                      ...p,
                      year: nextYear,
                      day: Math.min(p.day, getDaysInMonth(nextYear, p.month)),
                    }));
                  }}
                  className={selectClass}
                >
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
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
                <select
                  value={startParts.minute}
                  onChange={(e) =>
                    setStartParts((p) => ({ ...p, minute: Number(e.target.value) }))
                  }
                  className={selectClass}
                >
                  {startMinuteOptions.map((m) => (
                    <option key={m} value={m}>
                      {pad2(m)}
                    </option>
                  ))}
                </select>
              </div>

              <p className="mb-2 mt-3 text-[11px] font-extrabold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                {t('endsAt')}
              </p>
              <div className="grid max-w-xs grid-cols-2 gap-2">
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
                  {endMinuteOptions.map((m) => (
                    <option key={m} value={m}>
                      {pad2(m)}
                    </option>
                  ))}
                </select>
              </div>

              <p className="mb-2 mt-3 text-[11px] font-extrabold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                {t('lockAt')}
              </p>
              <div className="grid grid-cols-5 gap-2">
                <select
                  value={Math.min(lockParts.day, lockDaysCount)}
                  onChange={(e) =>
                    setLockParts((p) => ({ ...p, day: Number(e.target.value) }))
                  }
                  className={selectClass}
                >
                  {Array.from({ length: lockDaysCount }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>
                      {pad2(d)}
                    </option>
                  ))}
                </select>
                <select
                  value={lockParts.month}
                  onChange={(e) => {
                    const nextMonth = Number(e.target.value);
                    setLockParts((p) => ({
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
                  value={lockParts.year}
                  onChange={(e) => {
                    const nextYear = Number(e.target.value);
                    setLockParts((p) => ({
                      ...p,
                      year: nextYear,
                      day: Math.min(p.day, getDaysInMonth(nextYear, p.month)),
                    }));
                  }}
                  className={selectClass}
                >
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
                <select
                  value={lockParts.hour}
                  onChange={(e) =>
                    setLockParts((p) => ({ ...p, hour: Number(e.target.value) }))
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
                  value={lockParts.minute}
                  onChange={(e) =>
                    setLockParts((p) => ({ ...p, minute: Number(e.target.value) }))
                  }
                  className={selectClass}
                >
                  {lockMinuteOptions.map((m) => (
                    <option key={m} value={m}>
                      {pad2(m)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className={labelClass}>{t('location')}</label>
              <input
                type="text"
                required
                maxLength={160}
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
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
                  placeholder="30.000"
                  className="h-10 w-full rounded-xl border border-zinc-300 bg-zinc-50 pl-3 pr-14 text-sm font-bold tabular-nums text-zinc-950 outline-none transition focus:border-zinc-950 focus:ring-2 focus:ring-zinc-950/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white dark:focus:border-volt dark:focus:ring-volt/25"
                />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-md bg-zinc-200 px-2 py-0.5 text-[10px] font-extrabold tracking-wider text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                  VND
                </span>
              </div>
            </div>

            <div>
              <label className={labelClass}>{t('fieldMaxSlots')}</label>
              <input
                type="number"
                min={Math.max(1, match.slots_taken)}
                required
                value={maxSlots}
                onChange={(e) => setMaxSlots(Number(e.target.value))}
                className={`${inputClass} tabular-nums`}
              />
            </div>

            <div>
              <label className={labelClass}>{t('fieldCourtNumbers')}</label>
              <input
                type="text"
                maxLength={80}
                value={courtNumbers}
                onChange={(e) => setCourtNumbers(e.target.value)}
                placeholder={t('fieldCourtNumbersPlaceholder')}
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>{t('level')}</label>
              <input
                type="text"
                maxLength={60}
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

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-xl border border-zinc-200 bg-white px-4 text-xs font-bold text-zinc-700 transition hover:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
            >
              {t('hostEditMatchClose')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="h-10 rounded-xl bg-volt px-5 text-xs font-extrabold uppercase tracking-wide text-zinc-950 shadow-sm transition hover:bg-volt-hover disabled:opacity-60"
            >
              {saving ? t('hostEditMatchSaving') : t('hostEditMatchSave')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
