'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowRight,
  Clock,
  QrCode,
  ShieldCheck,
  Ticket,
  UserCheck,
  Zap,
} from 'lucide-react';
import { useLocale } from '@/lib/i18n/LocaleProvider';
import { extractMatchCode } from '@/lib/ui-helpers';
import { MatchMateLogo } from '@/components/MatchMateLogo';
import { MyBookingsBanner } from '@/components/player/MyBookingsBanner';

export default function HomePage() {
  const { t } = useLocale();
  const router = useRouter();
  const [codeInput, setCodeInput] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = extractMatchCode(codeInput);
    if (!/^[A-Z0-9]{6}$/.test(cleaned)) {
      setError(t('homeInvalidCode'));
      return;
    }
    setError('');
    router.push(`/keo/${cleaned}`);
  };

  return (
    <div className="space-y-6">
      {/* Athletic Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <MatchMateLogo variant="full" size="lg" />
          <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-100 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-zinc-900 dark:border-volt/30 dark:bg-volt/10 dark:text-volt">
            <Zap className="h-3.5 w-3.5" />
            <span>{t('homeHeroBadge')}</span>
          </span>
        </div>

        <h1 className="mt-5 text-2xl font-extrabold uppercase tracking-tight text-zinc-950 dark:text-white sm:text-4xl">
          {t('homeHeroTitle')}
        </h1>
        <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-zinc-600 dark:text-zinc-400 sm:text-base">
          {t('homeHeroSubtitle')}
        </p>

        <div className="mt-5 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
            <Clock className="h-3.5 w-3.5 text-zinc-950 dark:text-volt" />
            <span>{t('homeFeatureInstant')}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
            <QrCode className="h-3.5 w-3.5 text-zinc-950 dark:text-volt" />
            <span>{t('homeFeatureVietQr')}</span>
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
            <UserCheck className="h-3.5 w-3.5 text-zinc-950 dark:text-volt" />
            <span>{t('homeFeatureNoAccount')}</span>
          </span>
        </div>
      </section>

      {/* Quick Join Match by Code Ticket Card */}
      <section className="relative rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-center gap-2">
          <Ticket className="h-4 w-4 text-zinc-950 dark:text-volt" />
          <p className="text-xs font-extrabold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            {t('homeJoinCardTitle')}
          </p>
        </div>

        <h2 className="mt-1.5 text-xl font-extrabold uppercase tracking-tight text-zinc-950 dark:text-white">
          {t('homeTitle')}
        </h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {t('homeSubtitle')}
        </p>

        <div className="my-5 border-t border-dashed border-zinc-200 dark:border-zinc-800" />

        <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value)}
            placeholder={t('homeCodePlaceholder')}
            aria-label={t('homeJoinCardTitle')}
            className="h-12 flex-1 rounded-xl border border-zinc-300 bg-zinc-50 px-4 font-mono text-base font-bold tracking-wider text-zinc-950 outline-none transition placeholder:font-sans placeholder:text-sm placeholder:font-normal placeholder:tracking-normal placeholder:text-zinc-400 focus:border-zinc-950 focus:ring-2 focus:ring-zinc-950/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white dark:focus:border-volt dark:focus:ring-volt/25"
          />
          <button
            type="submit"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-volt px-6 text-sm font-extrabold uppercase tracking-wide text-zinc-950 shadow-sm transition hover:bg-volt-hover active:scale-[0.99]"
          >
            <span>{t('homeGoBtn')}</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>

        {t('homeCodeHint') && (
          <p className="mt-2.5 text-xs text-zinc-500 dark:text-zinc-400">
            {t('homeCodeHint')}
          </p>
        )}

        {error && (
          <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
            {error}
          </p>
        )}
      </section>

      {/* My Recent Bookings */}
      <MyBookingsBanner variant="section" />

      {/* Subtle Host Portal Link */}
      <Link
        href="/host"
        className="group flex items-center justify-between rounded-2xl border border-zinc-200 bg-white px-5 py-4 shadow-sm transition hover:border-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-volt"
      >
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-950 text-volt dark:bg-zinc-800">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-extrabold uppercase tracking-tight text-zinc-950 dark:text-white">
              {t('hostLink')}
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {t('homeHostCtaSub')}
            </p>
          </div>
        </div>
        <ArrowRight className="h-4 w-4 text-zinc-400 transition group-hover:translate-x-1 group-hover:text-zinc-950 dark:group-hover:text-volt" />
      </Link>
    </div>
  );
}
