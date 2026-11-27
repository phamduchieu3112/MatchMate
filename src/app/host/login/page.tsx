'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Lock } from 'lucide-react';
import { useLocale } from '@/lib/i18n/LocaleProvider';
import { MatchMateLogo } from '@/components/MatchMateLogo';

export default function HostLoginPage() {
  const { t } = useLocale();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/host/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        setError(t('errGeneric'));
        setLoading(false);
        return;
      }
      router.push('/host');
      router.refresh();
    } catch {
      setError(t('errGeneric'));
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-md space-y-4 pt-4">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3.5 py-1.5 text-xs font-bold text-zinc-700 shadow-sm transition hover:border-zinc-950 hover:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-volt dark:hover:text-white"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        <span>{t('backToHome')}</span>
      </Link>

      <div className="overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="h-1.5 w-full bg-volt" />
        <div className="p-6 sm:p-7">
          <MatchMateLogo variant="full" size="md" badge={t('hostBadge')} />

          <div className="mt-5 flex items-center gap-2">
            <Lock className="h-4 w-4 text-zinc-950 dark:text-volt" />
            <h1 className="text-xl font-extrabold uppercase tracking-tight text-zinc-950 dark:text-white">
              {t('hostLoginTitle')}
            </h1>
          </div>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {t('hostLoginSubtitle')}
          </p>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label className="block text-xs font-extrabold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                {t('hostEmail')}
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1.5 h-11 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3 text-sm text-zinc-950 outline-none transition focus:border-zinc-950 focus:ring-2 focus:ring-zinc-950/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white dark:focus:border-volt dark:focus:ring-volt/25"
              />
            </div>

            <div>
              <label className="block text-xs font-extrabold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                {t('hostPassword')}
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1.5 h-11 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3 text-sm text-zinc-950 outline-none transition focus:border-zinc-950 focus:ring-2 focus:ring-zinc-950/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white dark:focus:border-volt dark:focus:ring-volt/25"
              />
            </div>

            {error && (
              <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="h-12 w-full rounded-xl bg-volt text-sm font-extrabold uppercase tracking-wide text-zinc-950 shadow-sm transition hover:bg-volt-hover disabled:opacity-60"
            >
              {loading ? t('submitting') : t('hostLoginBtn')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
