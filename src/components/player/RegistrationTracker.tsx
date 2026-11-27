'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  QrCode,
  RefreshCw,
  X,
} from 'lucide-react';
import { useLocale } from '@/lib/i18n/LocaleProvider';
import {
  formatSlotLabel,
  translatePaymentMethod,
  translateRefundReason,
  translateRefundStatus,
  translateRegStatus,
} from '@/lib/i18n/helpers';
import { formatMatchDateTime, formatVnd } from '@/lib/format';
import type { MyRegistrationPayload } from '@/lib/types';

export function RegistrationTracker({ id }: { id: string }) {
  const { locale, t } = useLocale();
  const [reg, setReg] = useState<MyRegistrationPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedAcc, setCopiedAcc] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [checkinQrUrl, setCheckinQrUrl] = useState<string>('');

  const [refundAccount, setRefundAccount] = useState('');
  const [savingRefund, setSavingRefund] = useState(false);
  const [refundMsg, setRefundMsg] = useState('');

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelPin, setCancelPin] = useState('');
  const [cancelAccount, setCancelAccount] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [cancelErr, setCancelErr] = useState('');

  const fetchReg = useCallback(async () => {
    try {
      const res = await fetch(`/api/registration/${id}`, { cache: 'no-store' });
      if (res.status === 401 || res.status === 400) {
        setUnauthorized(true);
        setLoading(false);
        return;
      }
      if (!res.ok) {
        setLoading(false);
        return;
      }
      const data = (await res.json()) as MyRegistrationPayload;
      setReg(data);
      setRefundAccount((prev) => prev || data.refund_account_info || '');
      setUnauthorized(false);
      setLoading(false);
    } catch {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void fetchReg();
  }, [fetchReg]);

  // 4-second polling while pending_payment or waitlisted (paired with visibilitychange)
  useEffect(() => {
    if (!reg) return;
    if (reg.status !== 'pending_payment' && reg.status !== 'waitlisted') return;

    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void fetchReg();
      }
    }, 4000);

    const onVis = () => {
      if (document.visibilityState === 'visible') {
        void fetchReg();
      }
    };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [reg, fetchReg]);

  // Hold countdown ticker
  useEffect(() => {
    if (!reg?.expires_at || reg.status !== 'pending_payment') {
      setSecondsLeft(null);
      return;
    }
    const updateCountdown = () => {
      const diff = Math.max(
        0,
        Math.floor((new Date(reg.expires_at!).getTime() - Date.now()) / 1000)
      );
      setSecondsLeft(diff);
    };
    updateCountdown();
    const tick = window.setInterval(updateCountdown, 1000);
    return () => window.clearInterval(tick);
  }, [reg?.expires_at, reg?.status]);

  // Generate unique check-in QR code immediately when confirmed
  useEffect(() => {
    if (reg?.status !== 'confirmed' || !reg.payment_code) {
      setCheckinQrUrl('');
      return;
    }
    let cancelled = false;
    void QRCode.toDataURL(`MM:${reg.payment_code}`, {
      width: 240,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#09090B', light: '#FFFFFF' },
    })
      .then((url) => {
        if (!cancelled) setCheckinQrUrl(url);
      })
      .catch(() => {
        if (!cancelled) setCheckinQrUrl('');
      });
    return () => {
      cancelled = true;
    };
  }, [reg?.status, reg?.payment_code]);

  if (loading) {
    return (
      <div className="rounded-3xl border border-zinc-200 bg-white p-8 text-center text-sm font-medium text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
        {t('regLoading')}
      </div>
    );
  }

  if (unauthorized || !reg) {
    return (
      <div className="rounded-3xl border border-rose-300 bg-rose-50 p-6 text-sm text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-200">
        <p>{t('regUnauthorized')}</p>
        <Link
          href="/"
          className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-zinc-950 px-4 py-2 text-xs font-extrabold uppercase tracking-wide text-volt dark:bg-volt dark:text-zinc-950"
        >
          {t('backToHome')}
        </Link>
      </div>
    );
  }

  const formatCountdown = (total: number) => {
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const transferMemo = reg.transfer_content || reg.payment_code;

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(transferMemo);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  const copyAccountNumber = async () => {
    const acc = reg.payment_info?.accountNumber;
    if (!acc) return;
    try {
      await navigator.clipboard.writeText(acc);
      setCopiedAcc(true);
      window.setTimeout(() => setCopiedAcc(false), 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleSaveRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    setRefundMsg('');
    setSavingRefund(true);
    try {
      const res = await fetch(`/api/registration/${id}/refund-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountInfo: refundAccount }),
      });
      if (res.ok) {
        setRefundMsg(t('savedRefundAccount'));
        await fetchReg();
      } else {
        setRefundMsg(t('errGeneric'));
      }
    } catch {
      setRefundMsg(t('errGeneric'));
    } finally {
      setSavingRefund(false);
    }
  };

  const handleCancel = async (e: React.FormEvent) => {
    e.preventDefault();
    setCancelErr('');
    if (!/^[0-9]{4}$/.test(cancelPin)) {
      setCancelErr(t('errInvalidPin'));
      return;
    }
    setCancelling(true);
    try {
      const res = await fetch(`/api/registration/${id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pin: cancelPin,
          refundAccountInfo: cancelAccount,
        }),
      });
      const payload = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !payload.ok) {
        if (payload.error === 'invalid_pin') setCancelErr(t('errWrongPin'));
        else if (payload.error === 'pin_locked') setCancelErr(t('errPinLocked'));
        else if (payload.error === 'match_started')
          setCancelErr(t('errMatchStarted'));
        else setCancelErr(t('errGeneric'));
        setCancelling(false);
        return;
      }
      setCancelOpen(false);
      setCancelPin('');
      await fetchReg();
    } catch {
      setCancelErr(t('errGeneric'));
    } finally {
      setCancelling(false);
    }
  };

  const statusPillStyle = () => {
    switch (reg.status) {
      case 'confirmed':
        return 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30 dark:bg-emerald-400/15 dark:text-emerald-400 dark:border-emerald-400/30';
      case 'pending_payment':
        return 'bg-amber-500/15 text-amber-800 border-amber-500/30 dark:bg-amber-400/15 dark:text-amber-300 dark:border-amber-400/30';
      case 'waitlisted':
        return 'bg-zinc-200 text-zinc-800 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-200 dark:border-zinc-700';
      default:
        return 'bg-rose-500/15 text-rose-700 border-rose-500/30 dark:bg-rose-400/15 dark:text-rose-300 dark:border-rose-400/30';
    }
  };

  const canSelfCancel =
    (reg.status === 'pending_payment' ||
      reg.status === 'confirmed' ||
      reg.status === 'waitlisted') &&
    Date.now() < new Date(reg.match.starts_at).getTime();

  const totalRefunded = reg.refund_total_done + reg.refund_total_pending;
  const remainingAmount = reg.amount_remaining ?? Math.max(reg.amount_due - reg.amount_paid, 0);

  return (
    <div className="mx-auto max-w-lg space-y-5">
      {/* Top Bar */}
      <div className="flex items-center justify-between">
        <Link
          href={`/keo/${reg.match.short_code}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-3.5 py-1.5 text-xs font-bold text-zinc-700 shadow-sm transition hover:border-zinc-950 hover:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-volt dark:hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>
            {t('backToMatch')} (#{reg.match.short_code})
          </span>
        </Link>

        <button
          type="button"
          onClick={() => void fetchReg()}
          aria-label={t('refresh')}
          title={t('refresh')}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-600 shadow-sm transition hover:border-zinc-950 hover:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-volt dark:hover:text-white"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      </div>

      {reg.promoted_at && reg.status === 'pending_payment' && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-emerald-400/50 bg-emerald-50 p-4 text-sm font-semibold text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-950/50 dark:text-emerald-200">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>{t('promotedBanner')}</span>
        </div>
      )}

      {/* Digital Wallet Pass / Ticket Stub */}
      <section className="relative overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        {/* Top Accent Strip */}
        <div className="h-1.5 w-full bg-volt" />

        {/* Upper Pass Section: Status & Countdown */}
        <div className="p-6 text-center">
          <div className="flex justify-center">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1 text-xs font-extrabold uppercase tracking-wider ${statusPillStyle()}`}
            >
              {reg.status === 'pending_payment' && (
                <AlertTriangle className="h-3.5 w-3.5" />
              )}
              {reg.status === 'confirmed' && <Check className="h-3.5 w-3.5" />}
              <span>{translateRegStatus(reg.status, t)}</span>
            </span>
          </div>

          {reg.status === 'pending_payment' && secondsLeft !== null && (
            <div className="mt-4">
              <p className="text-[11px] font-extrabold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
                {t('holdCountdown')}
              </p>
              <p className="mt-1 tabular-nums text-5xl font-black tracking-tight text-zinc-950 dark:text-white">
                {formatCountdown(secondsLeft)}
              </p>
            </div>
          )}

          <div className="mt-4">
            <p className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
              {t('regPageTitle')} · #{reg.match.short_code}
            </p>
            <h1 className="mt-1 text-xl font-extrabold uppercase tracking-tight text-zinc-950 dark:text-white">
              {reg.match.title}
            </h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
              <strong className="text-zinc-950 dark:text-white">
                {reg.display_name}
              </strong>{' '}
              · {formatSlotLabel(reg.slots, t)} ·{' '}
              {formatMatchDateTime(reg.match.starts_at, locale)}
            </p>
            {reg.payment_method !== 'none' && (
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                {t('paidViaLabel')}:{' '}
                <span className="font-semibold text-zinc-700 dark:text-zinc-200">
                  {translatePaymentMethod(reg.payment_method, t)}
                </span>
              </p>
            )}
          </div>

          {/* Decorative Pass Barcode */}
          <div className="mx-auto mt-5 flex max-w-xs items-center justify-center gap-3">
            <div
              aria-hidden="true"
              className="ticket-barcode h-7 w-full text-zinc-300 dark:text-zinc-700"
            />
          </div>
        </div>

        {/* Perforated Ticket Divider with Side Notches */}
        <div className="relative flex items-center">
          <span
            aria-hidden="true"
            className="-ml-3.5 h-7 w-7 shrink-0 rounded-full border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950"
          />
          <div className="w-full border-t-2 border-dashed border-zinc-200 dark:border-zinc-800" />
          <span
            aria-hidden="true"
            className="-mr-3.5 h-7 w-7 shrink-0 rounded-full border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950"
          />
        </div>

        {/* Lower Stub: Confirmed Check-in QR OR Pending VietQR & Breakdown */}
        <div className="space-y-4 p-6">
          {reg.status === 'confirmed' && checkinQrUrl && (
            <div className="flex flex-col items-center rounded-2xl border border-zinc-200 bg-white p-5 text-zinc-950 shadow-md">
              <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-emerald-800">
                <QrCode className="h-3.5 w-3.5" />
                <span>{t('checkinQrTitle')}</span>
              </div>

              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={checkinQrUrl}
                alt={t('checkinQrTitle')}
                className="h-52 w-52 rounded-xl border border-zinc-100 bg-white p-1"
              />

              <div className="mt-3 flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-zinc-100 px-3 py-2">
                <div className="min-w-0 text-left">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    {t('checkinTicketCode')}
                  </span>
                  <code className="block truncate font-mono text-sm font-black text-zinc-950">
                    {reg.payment_code}
                  </code>
                </div>
                <button
                  type="button"
                  onClick={copyCode}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-zinc-950 px-3 py-1.5 text-xs font-bold text-volt transition hover:opacity-90"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      <span>{t('copied')}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>{t('copyCode')}</span>
                    </>
                  )}
                </button>
              </div>

              <p className="mt-3 text-center text-xs leading-relaxed text-zinc-600">
                {t('checkinQrDesc')}
              </p>
            </div>
          )}

          {reg.status === 'pending_payment' && reg.qr_url && (
            <div className="flex flex-col items-center rounded-2xl border border-zinc-200 bg-white p-5 text-zinc-950 shadow-md">
              {/* Always pure white frame for Dark Mode QR scan reliability */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={reg.qr_url}
                alt={t('vietQrAlt')}
                className="h-56 w-56 rounded-xl border border-zinc-100 bg-white p-1"
              />

              <p className="mt-3 tabular-nums text-2xl font-black tracking-tight text-zinc-950">
                {formatVnd(remainingAmount > 0 ? remainingAmount : reg.amount_due, locale)}
              </p>

              {reg.payment_info && (
                <div className="mt-3 w-full space-y-1.5 rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-left text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-zinc-500">{t('bankLabel')}</span>
                    <span className="font-extrabold text-zinc-950">
                      {reg.payment_info.bankCode}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-zinc-500">
                      {t('accountNumberLabel')}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <code className="font-mono font-black text-zinc-950">
                        {reg.payment_info.accountNumber}
                      </code>
                      <button
                        type="button"
                        onClick={copyAccountNumber}
                        aria-label={t('copyCode')}
                        className="inline-flex items-center rounded-md border border-zinc-300 bg-white px-1.5 py-0.5 text-[10px] font-bold text-zinc-700 transition hover:border-zinc-950 hover:text-zinc-950"
                      >
                        {copiedAcc ? t('copied') : t('copyCode')}
                      </button>
                    </div>
                  </div>
                  {reg.payment_info.accountName && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-zinc-500">
                        {t('accountNameLabel')}
                      </span>
                      <span className="truncate font-bold uppercase text-zinc-900">
                        {reg.payment_info.accountName}
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-2.5 flex w-full items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-zinc-100 px-3 py-2">
                <div className="min-w-0 text-left">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    {t('transferMemoPrefix')}
                  </span>
                  <code className="block truncate font-mono text-sm font-black text-zinc-950">
                    {transferMemo}
                  </code>
                </div>
                <button
                  type="button"
                  onClick={copyCode}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-zinc-950 px-3 py-1.5 text-xs font-bold text-volt transition hover:opacity-90"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      <span>{t('copied')}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>{t('copyCode')}</span>
                    </>
                  )}
                </button>
              </div>

              <p className="mt-3 text-center text-xs leading-relaxed text-zinc-600">
                {t('qrInstruction')}
              </p>
            </div>
          )}

          {reg.status === 'pending_payment' && !reg.qr_url && (
            <div className="flex items-start gap-2.5 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs font-semibold text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/50 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{t('paymentNotConfiguredNotice')}</span>
            </div>
          )}

          {/* Exact Amount Breakdown */}
          <div
            className={`grid gap-2.5 rounded-2xl border border-zinc-200 bg-zinc-50 p-3.5 text-center dark:border-zinc-800 dark:bg-zinc-950 ${
              totalRefunded > 0 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'
            }`}
          >
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                {t('amountDue')}
              </p>
              <p className="mt-0.5 tabular-nums text-sm font-extrabold text-zinc-950 dark:text-white">
                {formatVnd(reg.amount_due, locale)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                {t('amountPaid')}
              </p>
              <p className="mt-0.5 tabular-nums text-sm font-extrabold text-emerald-600 dark:text-emerald-400">
                {formatVnd(reg.amount_paid, locale)}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                {t('amountRemaining')}
              </p>
              <p className="mt-0.5 tabular-nums text-sm font-extrabold text-amber-600 dark:text-amber-400">
                {formatVnd(remainingAmount, locale)}
              </p>
            </div>
            {totalRefunded > 0 && (
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  {t('amountRefunded')}
                </p>
                <p className="mt-0.5 tabular-nums text-sm font-extrabold text-zinc-700 dark:text-zinc-300">
                  {formatVnd(totalRefunded, locale)}
                </p>
              </div>
            )}
          </div>

          {(reg.status === 'pending_payment' || reg.status === 'waitlisted') && (
            <p className="flex items-center justify-center gap-1.5 text-center text-xs text-zinc-500 dark:text-zinc-400">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              <span>{t('waitlistPollNote')}</span>
            </p>
          )}
        </div>
      </section>

      {/* Refund Receiving Account & History */}
      <section className="rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-extrabold uppercase tracking-wider text-zinc-950 dark:text-white">
          {t('refundSectionTitle')}
        </h2>
        <form
          onSubmit={handleSaveRefund}
          className="mt-3 flex flex-col gap-2.5 sm:flex-row"
        >
          <input
            type="text"
            maxLength={200}
            value={refundAccount}
            onChange={(e) => setRefundAccount(e.target.value)}
            placeholder={t('refundAccountPlaceholder')}
            aria-label={t('refundAccountLabel')}
            className="h-11 flex-1 rounded-xl border border-zinc-300 bg-zinc-50 px-3 text-sm text-zinc-950 outline-none transition focus:border-zinc-950 focus:ring-2 focus:ring-zinc-950/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white dark:focus:border-volt dark:focus:ring-volt/25"
          />
          <button
            type="submit"
            disabled={savingRefund}
            className="h-11 rounded-xl bg-zinc-950 px-4 text-xs font-extrabold uppercase tracking-wide text-volt transition hover:opacity-90 disabled:opacity-60 dark:bg-volt dark:text-zinc-950"
          >
            {t('saveRefundAccount')}
          </button>
        </form>
        {refundMsg && (
          <p className="mt-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            {refundMsg}
          </p>
        )}

        {reg.refunds.length > 0 && (
          <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              {t('refundHistoryTitle')}
            </h3>
            <ul className="mt-2.5 space-y-2">
              {reg.refunds.map((rf) => (
                <li
                  key={rf.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 py-2.5 text-sm dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <div>
                    <span className="tabular-nums font-extrabold text-zinc-950 dark:text-white">
                      {formatVnd(rf.amount, locale)}
                    </span>{' '}
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      · {translateRefundReason(rf.reason, t)}
                    </span>
                    {rf.note && (
                      <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                        {t('noteLabel')}: {rf.note}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 rounded-full bg-zinc-200 px-2.5 py-0.5 text-[11px] font-bold text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                    {translateRefundStatus(rf.status, t)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Self-Cancellation Trigger */}
      {canSelfCancel && (
        <div className="pt-1 text-center">
          <button
            type="button"
            onClick={() => {
              setCancelErr('');
              setCancelOpen(true);
            }}
            className="text-xs font-bold text-zinc-500 underline underline-offset-4 transition hover:text-rose-600 dark:text-zinc-400 dark:hover:text-rose-400"
          >
            {t('cancelBtn')}
          </button>
        </div>
      )}

      {/* Self-Cancellation Modal / Bottom Drawer */}
      {cancelOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/75 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="w-full max-w-md rounded-t-3xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900 sm:rounded-3xl sm:p-6">
            <div className="flex items-center justify-between border-b border-zinc-200 pb-3 dark:border-zinc-800">
              <h2 className="text-base font-extrabold uppercase tracking-tight text-zinc-950 dark:text-white">
                {t('cancelConfirmTitle')}
              </h2>
              <button
                type="button"
                onClick={() => setCancelOpen(false)}
                aria-label={t('close')}
                className="rounded-full border border-zinc-200 p-1.5 text-zinc-500 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-3 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
              {t('selfCancelDrawerDesc')}
            </p>

            <form onSubmit={handleCancel} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                  {t('cancelPinLabel')}
                </label>
                <input
                  type="password"
                  required
                  inputMode="numeric"
                  maxLength={4}
                  value={cancelPin}
                  onChange={(e) =>
                    setCancelPin(e.target.value.replace(/[^0-9]/g, ''))
                  }
                  placeholder="••••"
                  className="mt-1.5 h-11 w-40 rounded-xl border border-zinc-300 bg-zinc-50 px-3 text-center font-mono text-base font-bold tracking-[0.35em] text-zinc-950 outline-none focus:border-zinc-950 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white dark:focus:border-volt"
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                  {t('cancelRefundOptional')}
                </label>
                <input
                  type="text"
                  maxLength={200}
                  value={cancelAccount}
                  onChange={(e) => setCancelAccount(e.target.value)}
                  placeholder={t('refundAccountPlaceholder')}
                  className="mt-1.5 h-11 w-full rounded-xl border border-zinc-300 bg-zinc-50 px-3 text-sm text-zinc-950 outline-none focus:border-zinc-950 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white dark:focus:border-volt"
                />
              </div>

              {cancelErr && (
                <p className="flex items-center gap-1.5 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{cancelErr}</span>
                </p>
              )}

              <div className="flex gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setCancelOpen(false)}
                  className="h-11 flex-1 rounded-xl border border-zinc-300 text-xs font-bold uppercase tracking-wide text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  {t('cancelAction')}
                </button>
                <button
                  type="submit"
                  disabled={cancelling}
                  className="h-11 flex-1 rounded-xl bg-rose-600 text-xs font-extrabold uppercase tracking-wide text-white transition hover:bg-rose-700 disabled:opacity-60"
                >
                  {cancelling ? t('submitting') : t('confirmCancelBtn')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
