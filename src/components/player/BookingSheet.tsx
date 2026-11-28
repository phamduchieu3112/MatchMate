'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Check,
  Copy,
  Info,
  RefreshCw,
  Users,
  X,
} from 'lucide-react';
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
  maxBookableSlots?: number;
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

function generateRandomPin(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return String(arr[0] % 10000).padStart(4, '0');
  }
  return String(Math.floor(Math.random() * 10000)).padStart(4, '0');
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
  maxBookableSlots = 4,
  isWaitlistMode,
}: BookingSheetProps) {
  const { locale, t } = useLocale();
  const router = useRouter();

  const maxSlots = Math.max(1, maxBookableSlots);
  const quickSlotOptions = [1, 2, 3, 4].filter((n) => n <= maxSlots);

  const [memberNames, setMemberNames] = useState<string[]>(['']);
  const [contact, setContact] = useState('');
  const [slots, setSlots] = useState(Math.min(maxSlots, Math.max(1, initialSlots)));
  const [pin, setPin] = useState('');
  const [pinCopied, setPinCopied] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    const clampedSlots = Math.min(maxSlots, Math.max(1, initialSlots));
    setSlots(clampedSlots);
    setPin(generateRandomPin());
    setPinCopied(false);
    setIdempotencyKey(generateUuidV4());
    setTurnstileToken('');
    setError('');
    try {
      const saved = window.localStorage.getItem(PROFILE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as { name?: string; contact?: string };
        setMemberNames((prev) => {
          const next = Array.from({ length: Math.max(clampedSlots, prev.length, 1) }, (_, idx) =>
            prev[idx] ?? ''
          );
          if (parsed.name && !next[0]) {
            next[0] = parsed.name;
          }
          return next;
        });
        if (parsed.contact) setContact(parsed.contact);
      } else {
        setMemberNames((prev) =>
          Array.from({ length: Math.max(clampedSlots, prev.length, 1) }, (_, idx) => prev[idx] ?? '')
        );
      }
    } catch {
      setMemberNames((prev) =>
        Array.from({ length: Math.max(clampedSlots, prev.length, 1) }, (_, idx) => prev[idx] ?? '')
      );
    }
  }, [open, initialSlots, maxSlots]);

  const updateSlotCount = (nextCount: number) => {
    const clamped = Math.max(1, Math.min(maxSlots, nextCount));
    setSlots(clamped);
    setMemberNames((prev) =>
      Array.from({ length: Math.max(clamped, prev.length) }, (_, idx) => prev[idx] ?? '')
    );
  };

  const updateMemberName = (index: number, value: string) => {
    setMemberNames((prev) => {
      const next = Array.from({ length: Math.max(slots, prev.length) }, (_, idx) => prev[idx] ?? '');
      next[index] = value;
      return next;
    });
  };

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
      case 'invalid_slots':
        return t('errSlotsExceedMax', { max: maxSlots });
      case 'missing_member_names':
        return t('errMissingMemberNames');
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

    const activeNames = Array.from({ length: slots }, (_, idx) =>
      (memberNames[idx] ?? '').trim()
    );
    if (activeNames.some((n) => n.length === 0)) {
      setError(t('errMissingMemberNames'));
      return;
    }

    if (slots < 1 || slots > maxSlots) {
      setError(t('errSlotsExceedMax', { max: maxSlots }));
      return;
    }

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
        JSON.stringify({ name: activeNames[0], contact: contact.trim() })
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
          name: activeNames[0],
          memberNames: activeNames,
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
      <div className="flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-800 dark:bg-zinc-900 sm:rounded-3xl">
        {/* Sticky Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 px-5 pb-3 pt-4 dark:border-zinc-800 sm:px-6 sm:pt-5">
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

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          {/* Scrollable Form Body */}
          <div className="min-w-0 flex-1 space-y-3.5 overflow-y-auto px-5 py-4 sm:px-6">
            {isWithinCutoff && (
              <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs font-medium text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/50 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{t('lateCutoffWarning', { hours: cancelCutoffHours })}</span>
              </div>
            )}

            {/* Slot Selector (quick 1-4 chips + optional custom picker up to maxSlots) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-extrabold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                  {t('selectSlotsTitle')}
                </label>
                <span className="tabular-nums text-xs font-bold text-zinc-950 dark:text-volt">
                  {t('totalAmount')}: {formatVnd(totalPrice, locale)}
                </span>
              </div>

              <div
                className={`grid gap-2 ${
                  quickSlotOptions.length === 1
                    ? 'grid-cols-1'
                    : quickSlotOptions.length === 2
                      ? 'grid-cols-2'
                      : quickSlotOptions.length === 3
                        ? 'grid-cols-3'
                        : 'grid-cols-4'
                }`}
              >
                {quickSlotOptions.map((num) => {
                  const selected = slots === num;
                  return (
                    <button
                      key={num}
                      type="button"
                      onClick={() => updateSlotCount(num)}
                      aria-pressed={selected}
                      className={`flex flex-col items-center justify-center rounded-2xl border py-2.5 transition ${
                        selected
                          ? 'border-volt bg-volt/20 text-zinc-950 shadow-volt dark:bg-volt/10 dark:text-white'
                          : 'border-zinc-200 bg-zinc-50 text-zinc-600 hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:border-zinc-700'
                      }`}
                    >
                      <span
                        className={`tabular-nums text-xl font-black leading-none ${
                          selected
                            ? 'text-zinc-950 dark:text-volt'
                            : 'text-zinc-700 dark:text-zinc-300'
                        }`}
                      >
                        {num}
                      </span>
                      <span className="mt-1 text-[10px] font-bold uppercase tracking-wide">
                        {num === 1 ? t('slotSingular') : t('slotPlural')}
                      </span>
                    </button>
                  );
                })}
              </div>

              {maxSlots > 4 && (
                <div className="flex items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950">
                  <div className="min-w-0">
                    <p className="text-[11px] font-extrabold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                      {t('customSlotsLabel')}
                    </p>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      {t('customSlotsHint', { max: maxSlots })}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => updateSlotCount(slots - 1)}
                      disabled={slots <= 1}
                      aria-label="-"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-300 bg-white text-sm font-black text-zinc-800 transition hover:border-zinc-950 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-volt"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={maxSlots}
                      value={slots}
                      onChange={(e) => {
                        const parsed = Number.parseInt(e.target.value, 10);
                        if (Number.isNaN(parsed)) return;
                        updateSlotCount(parsed);
                      }}
                      aria-label={t('customSlotsLabel')}
                      className="h-8 w-14 rounded-lg border border-zinc-300 bg-white text-center font-mono text-sm font-black tabular-nums text-zinc-950 outline-none focus:border-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-volt dark:focus:border-volt"
                    />
                    <button
                      type="button"
                      onClick={() => updateSlotCount(slots + 1)}
                      disabled={slots >= maxSlots}
                      aria-label="+"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-300 bg-white text-sm font-black text-zinc-800 transition hover:border-zinc-950 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-volt"
                    >
                      +
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Player Name(s) */}
            {slots === 1 ? (
              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                  {t('fieldName')}
                </label>
                <input
                  type="text"
                  required
                  maxLength={60}
                  value={memberNames[0] ?? ''}
                  onChange={(e) => updateMemberName(0, e.target.value)}
                  placeholder={t('fieldNamePlaceholder')}
                  className="mt-1.5 h-10 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3 text-sm text-zinc-950 outline-none transition focus:border-zinc-950 focus:ring-2 focus:ring-zinc-950/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white dark:focus:border-volt dark:focus:ring-volt/25"
                />
              </div>
            ) : (
              <div className="space-y-3 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-3.5 dark:border-zinc-800 dark:bg-zinc-950/70">
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-zinc-950 px-2.5 py-0.5 text-[11px] font-extrabold text-volt dark:bg-volt dark:text-zinc-950">
                    <Users className="h-3.5 w-3.5" />
                    <span>{t('groupBookingBadge')}</span>
                  </div>
                  <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                    {t('groupBookingDesc')}
                  </p>
                </div>

                <div className="space-y-2.5">
                  {Array.from({ length: slots }, (_, idx) => (
                    <div key={idx}>
                      <label className="block text-[11px] font-extrabold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                        {t('groupMemberLabel', { index: idx + 1 })}
                      </label>
                      <input
                        type="text"
                        required
                        maxLength={60}
                        value={memberNames[idx] ?? ''}
                        onChange={(e) => updateMemberName(idx, e.target.value)}
                        placeholder={
                          idx === 0
                            ? t('groupMemberPrimaryPlaceholder')
                            : t('groupMemberPlaceholder')
                        }
                        className="mt-1 h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none transition focus:border-zinc-950 focus:ring-2 focus:ring-zinc-950/15 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:focus:border-volt dark:focus:ring-volt/25"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                  {slots > 1 ? t('groupLeadPhoneLabel') : t('fieldPhone')}
                </label>
                <input
                  type="tel"
                  required
                  inputMode="tel"
                  maxLength={30}
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder={t('fieldPhonePlaceholder')}
                  className="mt-1.5 h-10 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3 text-sm tabular-nums text-zinc-950 outline-none transition focus:border-zinc-950 focus:ring-2 focus:ring-zinc-950/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white dark:focus:border-volt dark:focus:ring-volt/25"
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                  {t('fieldPin')}
                </label>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <input
                    type="text"
                    required
                    inputMode="numeric"
                    pattern="[0-9]{4}"
                    maxLength={4}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ''))}
                    placeholder="1234"
                    className="h-10 min-w-0 flex-1 rounded-xl border border-zinc-300 bg-zinc-50 px-3 text-center font-mono text-base font-black tracking-[0.35em] text-zinc-950 outline-none transition focus:border-zinc-950 focus:ring-2 focus:ring-zinc-950/15 dark:border-volt/50 dark:bg-zinc-950 dark:text-volt dark:focus:border-volt dark:focus:ring-volt/25"
                  />
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(pin);
                        setPinCopied(true);
                        window.setTimeout(() => setPinCopied(false), 1800);
                      } catch {
                        // ignore clipboard error
                      }
                    }}
                    title={t('copyPin')}
                    aria-label={t('copyPin')}
                    className="inline-flex h-10 w-9 shrink-0 items-center justify-center rounded-xl border border-zinc-300 bg-zinc-50 text-zinc-700 transition hover:border-zinc-950 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-volt"
                  >
                    {pinCopied ? (
                      <Check className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPin(generateRandomPin());
                      setPinCopied(false);
                    }}
                    title={t('regeneratePin')}
                    aria-label={t('regeneratePin')}
                    className="inline-flex h-10 w-9 shrink-0 items-center justify-center rounded-xl border border-zinc-300 bg-zinc-50 text-zinc-700 transition hover:border-zinc-950 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-volt"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-xl border border-amber-300/80 bg-amber-50 p-2.5 text-xs font-semibold leading-relaxed text-amber-950 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-200">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
              <span>{t('fieldPinHint')}</span>
            </div>

            <div className="max-w-full overflow-x-clip">
              <TurnstileWidget onVerify={handleVerify} onExpire={handleExpire} />
            </div>
          </div>

          {/* Sticky Footer */}
          <div className="shrink-0 space-y-2 border-t border-zinc-200 bg-white px-5 py-3.5 dark:border-zinc-800 dark:bg-zinc-900 sm:px-6">
            {error && (
              <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-volt text-sm font-extrabold uppercase tracking-wide text-zinc-950 shadow-sm transition hover:bg-volt-hover disabled:opacity-60"
            >
              <span>{submitting ? t('submitting') : t('submitBook')}</span>
              {!submitting && (
                <span className="tabular-nums">· {formatVnd(totalPrice, locale)}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
