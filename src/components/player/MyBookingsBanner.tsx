'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowUpRight, Ticket } from 'lucide-react';
import { useLocale } from '@/lib/i18n/LocaleProvider';
import type { StoredBookingRef } from '@/lib/types';

const STORAGE_KEY = 'matchmate_bookings';

export function readStoredBookings(): StoredBookingRef[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is StoredBookingRef =>
        Boolean(item) &&
        typeof item.matchId === 'string' &&
        typeof item.registrationId === 'string' &&
        typeof item.shortCode === 'string'
    );
  } catch {
    return [];
  }
}

export function saveStoredBooking(entry: StoredBookingRef) {
  if (typeof window === 'undefined') return;
  try {
    const current = readStoredBookings().filter(
      (item) => item.registrationId !== entry.registrationId
    );
    const next = [entry, ...current].slice(0, 10);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage failures
  }
}

export function removeStoredBooking(registrationId: string) {
  if (typeof window === 'undefined') return;
  try {
    const current = readStoredBookings();
    const next = current.filter((item) => item.registrationId !== registrationId);
    if (next.length !== current.length) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
  } catch {
    // Ignore storage failures
  }
}

export function retainStoredBookings(validRegistrationIds: Set<string>): StoredBookingRef[] {
  if (typeof window === 'undefined') return [];
  const current = readStoredBookings();
  const next = current.filter((item) => validRegistrationIds.has(item.registrationId));
  if (next.length !== current.length) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Ignore storage failures
    }
  }
  return next;
}

interface MyBookingsBannerProps {
  filterMatchId?: string;
  variant?: 'banner' | 'section';
}

export function MyBookingsBanner({
  filterMatchId,
  variant = 'banner',
}: MyBookingsBannerProps) {
  const { t } = useLocale();
  const [items, setItems] = useState<StoredBookingRef[]>([]);

  useEffect(() => {
    let active = true;

    const applyFilter = (list: StoredBookingRef[]) =>
      filterMatchId ? list.filter((b) => b.matchId === filterMatchId) : list;

    const syncBookings = async () => {
      const all = readStoredBookings();
      if (!active) return;
      setItems(applyFilter(all));

      if (all.length === 0) return;

      try {
        const res = await fetch('/api/bookings/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
          body: JSON.stringify({
            bookings: all.map((b) => ({
              matchId: b.matchId,
              registrationId: b.registrationId,
            })),
          }),
        });
        if (!res.ok || !active) return;
        const data = (await res.json()) as { validRegistrationIds?: string[] };
        if (!Array.isArray(data.validRegistrationIds) || !active) return;

        const validSet = new Set(data.validRegistrationIds);
        const synced = retainStoredBookings(validSet);
        if (active) {
          setItems(applyFilter(synced));
        }
      } catch {
        // Keep cached bookings if offline/transient error
      }
    };

    void syncBookings();

    const onVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible') {
        void syncBookings();
      }
    };
    window.addEventListener('focus', onVisibilityOrFocus);
    document.addEventListener('visibilitychange', onVisibilityOrFocus);

    return () => {
      active = false;
      window.removeEventListener('focus', onVisibilityOrFocus);
      document.removeEventListener('visibilitychange', onVisibilityOrFocus);
    };
  }, [filterMatchId]);

  if (items.length === 0) return null;

  if (variant === 'section') {
    return (
      <section className="w-full min-w-0 max-w-full rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-950 text-volt dark:bg-volt/15 dark:text-volt">
              <Ticket className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-zinc-950 dark:text-white">
                {t('myBookingsTitle')}
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {t('homeRecentBookings')}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
          {items.slice(0, 4).map((item) => (
            <Link
              key={item.registrationId}
              href={`/dang-ky/${item.registrationId}`}
              className="group flex min-w-0 max-w-full items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-3 transition hover:border-zinc-950 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-volt"
            >
              <div className="flex items-center gap-2.5">
                <span className="rounded-md bg-zinc-950 px-2 py-1 font-mono text-xs font-bold text-volt dark:bg-volt dark:text-zinc-950">
                  #{item.shortCode}
                </span>
                <span className="text-xs font-bold uppercase tracking-wide text-zinc-700 dark:text-zinc-200">
                  {t('myBookingsOpen')}
                </span>
              </div>
              <ArrowUpRight className="h-4 w-4 text-zinc-400 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-zinc-950 dark:group-hover:text-volt" />
            </Link>
          ))}
        </div>
      </section>
    );
  }

  return (
    <div className="sticky top-16 z-30 w-full min-w-0 max-w-full rounded-2xl border border-zinc-200 bg-white/95 p-3 shadow-sm backdrop-blur-md dark:border-volt/30 dark:bg-zinc-900/95">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-zinc-900 dark:text-white">
          <Ticket className="h-4 w-4 shrink-0 text-zinc-950 dark:text-volt" />
          <span>{t('myBookingsTitle')}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {items.slice(0, 3).map((item) => (
            <Link
              key={item.registrationId}
              href={`/dang-ky/${item.registrationId}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-zinc-950 px-3 py-1.5 text-xs font-bold text-volt transition hover:opacity-90 dark:bg-volt dark:text-zinc-950"
            >
              <span className="font-mono">#{item.shortCode}</span>
              <span>· {t('myBookingsOpen')}</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
