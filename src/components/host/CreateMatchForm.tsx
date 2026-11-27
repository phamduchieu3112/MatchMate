'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useLocale } from '@/lib/i18n/LocaleProvider';

function toVietnamOffsetIso(localDateTime: string): string {
  // datetime-local gives "YYYY-MM-DDTHH:mm"
  if (!localDateTime) return '';
  return `${localDateTime}:00+07:00`;
}

export function CreateMatchForm() {
  const { t } = useLocale();
  const router = useRouter();
  const [sport, setSport] = useState(t('sportBadminton'));
  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [lockAt, setLockAt] = useState('');
  const [locationName, setLocationName] = useState('');
  const [mapUrl, setMapUrl] = useState('');
  const [level, setLevel] = useState('');
  const [feePerSlot, setFeePerSlot] = useState(80000);
  const [maxSlots, setMaxSlots] = useState(12);
  const [courts, setCourts] = useState(2);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const res = await fetch('/api/host/matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sport,
          title,
          starts_at: toVietnamOffsetIso(startsAt),
          lock_at: toVietnamOffsetIso(lockAt),
          location_name: locationName,
          map_url: mapUrl || null,
          level: level || null,
          fee_per_slot: Number(feePerSlot),
          max_slots: Number(maxSlots),
          courts: Number(courts),
          cancel_cutoff_hours: Number(cancelCutoffHours),
          hold_minutes: Number(holdMinutes),
          notes: notes || null,
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

            <div>
              <label className={labelClass}>{t('startsAt')} (+07:00)</label>
              <input
                type="datetime-local"
                required
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label className={labelClass}>{t('lockAt')} (+07:00)</label>
              <input
                type="datetime-local"
                required
                value={lockAt}
                onChange={(e) => setLockAt(e.target.value)}
                className={inputClass}
              />
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
              <input
                type="number"
                min={0}
                required
                value={feePerSlot}
                onChange={(e) => setFeePerSlot(Number(e.target.value))}
                className={`${inputClass} tabular-nums`}
              />
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
