'use client';

import { useEffect, useState } from 'react';
import { Download, Image as ImageIcon, X } from 'lucide-react';
import { useLocale } from '@/lib/i18n/LocaleProvider';
import { formatMatchDateTimeRange, formatVnd } from '@/lib/format';
import { downloadDataUrlPng, renderRosterPosterPng } from '@/lib/canvas-exports';
import type { PublicMatch } from '@/lib/types';

interface RosterPosterModalProps {
  open: boolean;
  onClose: () => void;
  match: PublicMatch;
  registrations: Array<{
    display_name: string;
    slots: number;
    status: string;
  }>;
  siteUrl: string;
}

export function RosterPosterModal({
  open,
  onClose,
  match,
  registrations,
  siteUrl,
}: RosterPosterModalProps) {
  const { locale, t } = useLocale();
  const [posterUrl, setPosterUrl] = useState('');
  const [rendering, setRendering] = useState(false);

  useEffect(() => {
    if (!open) return;

    const base =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : siteUrl.replace(/\/$/, '');
    const bookingUrl = `${base}/keo/${match.short_code}`;

    const activeRoster = registrations
      .filter((r) => r.status === 'confirmed' || r.status === 'pending_payment')
      .map((r) => ({
        displayName: r.display_name,
        slots: r.slots,
        status: r.status,
      }));

    let cancelled = false;
    setRendering(true);
    void renderRosterPosterPng({
      matchTitle: match.title,
      sport: match.sport,
      shortCode: match.short_code,
      dateTimeText: formatMatchDateTimeRange(match.starts_at, match.notes, locale),
      locationName: match.location_name,
      courtNumbers: match.court_numbers,
      level: match.level,
      feeText: `${formatVnd(match.fee_per_slot, locale)}/slot`,
      slotsTaken: match.slots_taken,
      maxSlots: match.max_slots,
      roster: activeRoster,
      bookingUrl,
    })
      .then((url) => {
        if (!cancelled) setPosterUrl(url);
      })
      .catch(() => {
        if (!cancelled) setPosterUrl('');
      })
      .finally(() => {
        if (!cancelled) setRendering(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, match, registrations, siteUrl, locale]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/80 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900 sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-zinc-200 pb-3 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-zinc-950 dark:text-volt" />
            <h2 className="text-base font-extrabold uppercase tracking-tight text-zinc-950 dark:text-white">
              {t('hostPosterModalTitle')}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            className="rounded-full border border-zinc-200 p-1.5 text-zinc-500 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4">
          {rendering ? (
            <div className="flex h-64 items-center justify-center rounded-2xl border border-dashed border-zinc-300 text-xs text-zinc-500 dark:border-zinc-700">
              ...
            </div>
          ) : posterUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={posterUrl}
              alt={t('hostPosterModalTitle')}
              className="w-full rounded-2xl border border-zinc-800 shadow-lg"
            />
          ) : (
            <p className="text-xs text-rose-500">{t('errGeneric')}</p>
          )}
        </div>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="h-11 flex-1 rounded-xl border border-zinc-300 text-xs font-bold uppercase text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
          >
            {t('close')}
          </button>
          <button
            type="button"
            disabled={!posterUrl}
            onClick={() =>
              downloadDataUrlPng(
                posterUrl,
                `matchmate-${match.short_code}-roster.png`
              )
            }
            className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-volt text-xs font-extrabold uppercase tracking-wide text-zinc-950 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            <span>{t('hostPosterDownloadPng')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
