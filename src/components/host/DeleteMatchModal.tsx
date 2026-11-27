'use client';

import { useState } from 'react';
import { AlertTriangle, Lock, Trash2, X } from 'lucide-react';
import { useLocale } from '@/lib/i18n/LocaleProvider';

interface DeleteMatchModalProps {
  matchId: string;
  matchTitle: string;
  shortCode: string;
  onClose: () => void;
  onDeleted: () => void;
}

export function DeleteMatchModal({
  matchId,
  matchTitle,
  shortCode,
  onClose,
  onDeleted,
}: DeleteMatchModalProps) {
  const { t } = useLocale();
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setError(t('hostDeletePasswordRequired'));
      return;
    }

    setError('');
    setSubmitting(true);
    try {
      const res = await fetch(`/api/host/matches/${matchId}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };

      if (!res.ok || !data.ok) {
        if (data.error === 'invalid_password') {
          setError(t('hostDeleteInvalidPassword'));
        } else if (data.error === 'password_required') {
          setError(t('hostDeletePasswordRequired'));
        } else {
          setError(t('errGeneric'));
        }
        setSubmitting(false);
        return;
      }

      onDeleted();
    } catch {
      setError(t('errGeneric'));
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={t('hostDeleteModalTitle')}
    >
      <div className="w-full max-w-md rounded-3xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 dark:bg-rose-950/80 dark:text-rose-400">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-base font-extrabold uppercase tracking-tight text-zinc-950 dark:text-white">
                {t('hostDeleteModalTitle')}
              </h2>
              <p className="font-mono text-xs font-bold text-zinc-500 dark:text-zinc-400">
                #{shortCode}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 text-zinc-500 transition hover:text-zinc-950 dark:border-zinc-700 dark:text-zinc-400 dark:hover:text-white"
            aria-label={t('close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50/80 p-3.5 dark:border-rose-900/60 dark:bg-rose-950/30">
          <p className="truncate text-sm font-extrabold text-zinc-950 dark:text-white">
            {matchTitle}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-rose-800 dark:text-rose-300">
            {t('hostDeleteModalDesc')}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <label className="block space-y-1.5">
            <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
              <Lock className="h-3.5 w-3.5" />
              <span>{t('hostDeletePasswordLabel')}</span>
            </span>
            <input
              type="password"
              autoFocus
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('hostDeletePasswordPlaceholder')}
              className="h-11 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3.5 text-sm text-zinc-950 outline-none transition focus:border-rose-500 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white dark:focus:border-rose-400"
            />
          </label>

          {error && (
            <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="h-10 rounded-xl border border-zinc-200 bg-white px-4 text-xs font-bold text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {t('cancelAction')}
            </button>
            <button
              type="submit"
              disabled={submitting || !password.trim()}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-rose-600 px-4 text-xs font-extrabold uppercase tracking-wide text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>
                {submitting ? t('hostDeleteDeleting') : t('hostDeleteConfirmBtn')}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
