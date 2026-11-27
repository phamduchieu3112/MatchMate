'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, X } from 'lucide-react';
import { useLocale } from '@/lib/i18n/LocaleProvider';
import { formatVnd } from '@/lib/format';
import { TurnstileWidget } from '@/components/player/TurnstileWidget';
import { saveStoredBooking } from '@/components/player/MyBookingsBanner';

const PROFILE_KEY = 'matchmate_player_profile';

interface BookingSheetProps {
  open: boolean;
  onClose: () => void;
  matchId: string;
  shortCode: string;
  startsAt: string;
  cancelCutoffHours: number;
  feePerSlot: number;
  initialSlots?: number;
  isWaitlistMode: boolean;
}

function generateUuidV4(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function BookingSheet({
  open,
  onClose,
  matchId,
  shortCode,
  startsAt,
  cancelCutoffHours,
  feePerSlot,
  initialSlots = 1,
  isWaitlistMode,
}: BookingSheetProps) {
  const { locale, t } = useLocale();
  const router = useRouter();

  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [slots, setSlots] = useState(initialSlots);
  const [pin, setPin] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setSlots(Math.min(4, Math.max(1, initialSlots)));
    setIdempotencyKey(generateUuidV4());
    setTurnstileToken('');
    setError('');
    try {
      const saved = window.localStorage.getItem(PROFILE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as { name?: string; contact?: string };
        if (parsed.name) setName(parsed.name);
        if (parsed.contact) setContact(parsed.contact);
      }
    } catch {
      // Ignore storage read failure
    }
  }, [open, initialSlots]);

  const handleVerify = useCallback((token: string) => {
    setTurnstileToken(token);
  }, []);

  const handleExpire = useCallback(() => {
    setTurnstileToken('');
  }, []);

  if (!open) return null;

  const cutoffMs =
    new Date(startsAt).getTime() - cancelCutoffHours * 60 * 60 * 1000;
  const isWithinCutoff = Date.now() > cutoffMs;

  const mapServerError = (code: string) => {
    switch (code) {
      case 'invalid_phone':
        return t('errInvalidPhone');
      case 'invalid_pin':
        return t('errInvalidPin');
      case 'per_match_cap':
        return t('errPerMatchCap');
      case 'concurrent_cap':
        return t('errConcurrentCap');
      case 'waitlist_cap':
        return t('errWaitlistCap');
      case 'cooldown':
        return t('errCooldown');
      case 'ip_hold_cap':
        return t('errIpHoldCap');
      case 'rate_limited':
        return t('errRateLimit');
      case 'turnstile_required':
      case 'turnstile_failed':
        return t('turnstileRequired');
      default:
        return t('errGeneric');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const digits = contact.replace(/[^0-9]/g, '');
    if (digits.length < 9 || digits.length > 11) {
      setError(t('errInvalidPhone'));
      return;
    }
    if (!/^[0-9]{4}$/.test(pin)) {
      setError(t('errInvalidPin'));
      return;
    }
    if (!turnstileToken) {
      setError(t('turnstileRequired'));
      return;
    }

    try {
      window.localStorage.setItem(
        PROFILE_KEY,
        JSON.stringify({ name: name.trim(), contact: contact.trim() })
      );
    } catch {
      // Ignore
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/book', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
        },
        body: JSON.stringify({
          matchId,
          name: name.trim(),
          contact: contact.trim(),
          slots,
          pin,
          turnstileToken,
        }),
      });

      const payload = (await res.json()) as {
        registration_id?: string;
        error?: string;
      };

      if (!res.ok || !payload.registration_id) {
        setError(mapServerError(payload.error ?? ''));
        setSubmitting(false);
        return;
      }

      saveStoredBooking({
        matchId,
        registrationId: payload.registration_id,
        shortCode,
      });

      router.push(`/dang-ky/${payload.registration_id}`);
    } catch {
      setError(t('errGeneric'));
      setSubmitting(false);
    }
  };

  const totalPrice = feePerSlot * slots;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/75 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900 sm:rounded-3xl sm:p-6">
        <div className="flex items-center justify-between border-b border-zinc-200 pb-3 dark:border-zinc-800">
          <div>
            <p className="font-mono text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              #{shortCode}
            </p>
            <h2 className="text-lg font-extrabold uppercase tracking-tight text-zinc-950 dark:text-white">
              {isWaitlistMode ? t('joinWaitlistBtn') : t('sheetTitle')}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-zinc-200 p-1.5 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-950 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
            aria-label={t('close')}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {isWithinCutoff && (
          <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-medium text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/50 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{t('lateCutoffWarning', { hours: cancelCutoffHours })}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Large 4-column Slot Selector */}
          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-extrabold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                {t('selectSlotsTitle')}
              </label>
              <span className="tabular-nums text-xs font-bold text-zinc-950 dark:text-volt">
                {t('totalAmount')}: {formatVnd(totalPrice, locale)}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-4 gap-2.5">
              {[1, 2, 3, 4].map((num) => {
                const selected = slots === num;
                return (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setSlots(num)}
                    aria-pressed={selected}
                    className={`flex flex-col items-center justify-center rounded-2xl border py-3 transition ${
                      selected
                        ? 'border-volt bg-volt/20 text-zinc-950 shadow-volt dark:bg-volt/10 dark:text-white'
                        : 'border-zinc-200 bg-zinc-50 text-zinc-600 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:border-zinc-700'
                    }`}
                  >
                    <span
                      className={`tabular-nums text-2xl font-black leading-none ${
                        selected
                          ? 'text-zinc-950 dark:text-volt'
                          : 'text-zinc-700 dark:text-zinc-300'
                      }`}
                    >
                      {num}
                    </span>
                    <span className="mt-1 text-[11px] font-bold uppercase tracking-wide">
                      {num === 1 ? t('slotSingular') : t('slotPlural')}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-extrabold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
              {t('fieldName')}
            </label>
            <input
              type="text"
              required
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('fieldNamePlaceholder')}
              className="mt-1.5 h-11 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3 text-sm text-zinc-950 outline-none transition focus:border-zinc-950 focus:ring-2 focus:ring-zinc-950/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white dark:focus:border-volt dark:focus:ring-volt/25"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-extrabold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                {t('fieldPhone')}
              </label>
              <input
                type="tel"
                required
                inputMode="tel"
                maxLength={30}
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder={t('fieldPhonePlaceholder')}
                className="mt-1.5 h-11 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3 text-sm tabular-nums text-zinc-950 outline-none transition focus:border-zinc-950 focus:ring-2 focus:ring-zinc-950/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white dark:focus:border-volt dark:focus:ring-volt/25"
              />
            </div>

            <div>
              <label className="block text-xs font-extrabold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                {t('fieldPin')}
              </label>
              <input
                type="password"
                required
                inputMode="numeric"
                pattern="[0-9]{4}"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="••••"
                className="mt-1.5 h-11 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3 text-center font-mono text-base font-bold tracking-[0.35em] text-zinc-950 outline-none transition focus:border-zinc-950 focus:ring-2 focus:ring-zinc-950/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white dark:focus:border-volt dark:focus:ring-volt/25"
              />
            </div>
          </div>

          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {t('fieldPinHint')}
          </p>

          <TurnstileWidget onVerify={handleVerify} onExpire={handleExpire} />

          {error && (
            <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-volt text-sm font-extrabold uppercase tracking-wide text-zinc-950 shadow-sm transition hover:bg-volt-hover disabled:opacity-60"
          >
            <span>{submitting ? t('submitting') : t('submitBook')}</span>
            {!submitting && (
              <span className="tabular-nums">· {formatVnd(totalPrice, locale)}</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
