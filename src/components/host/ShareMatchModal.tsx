'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  QrCode,
  Share2,
  X,
} from 'lucide-react';
import { useLocale } from '@/lib/i18n/LocaleProvider';

interface ShareMatchModalProps {
  open: boolean;
  onClose: () => void;
  shortCode: string;
  matchTitle: string;
  siteUrl?: string;
}

export function ShareMatchModal({
  open,
  onClose,
  shortCode,
  matchTitle,
  siteUrl,
}: ShareMatchModalProps) {
  const { t } = useLocale();
  const [bookingUrl, setBookingUrl] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;

    const base =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : (siteUrl ?? '').replace(/\/$/, '');
    const fullUrl = `${base}/keo/${shortCode}`;
    setBookingUrl(fullUrl);
    setCopied(false);

    let cancelled = false;
    void QRCode.toDataURL(fullUrl, {
      width: 320,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#09090B', light: '#FFFFFF' },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl('');
      });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      cancelled = true;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, shortCode, siteUrl, onClose]);

  if (!open) return null;

  const handleCopy = async () => {
    if (!bookingUrl) return;
    try {
      await navigator.clipboard.writeText(bookingUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleDownloadQr = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `matchmate-${shortCode}-qr.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/75 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900 sm:rounded-3xl sm:p-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-zinc-200 pb-3 dark:border-zinc-800">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <Share2 className="h-4 w-4 shrink-0 text-zinc-950 dark:text-volt" />
              <h2 className="text-base font-extrabold uppercase tracking-tight text-zinc-950 dark:text-white">
                {t('shareMatchTitle')}
              </h2>
            </div>
            <p className="mt-0.5 truncate text-xs font-semibold text-zinc-500 dark:text-zinc-400">
              #{shortCode} · {matchTitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            className="rounded-full border border-zinc-200 p-1.5 text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-950 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
          {t('shareMatchDesc')}
        </p>

        {/* Section 1: Copy Booking Link */}
        <div className="mt-4 space-y-1.5">
          <label className="block text-[11px] font-extrabold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            {t('shareMatchLinkLabel')}
          </label>
          <div className="flex items-center gap-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-800 dark:bg-zinc-950">
            <code className="min-w-0 flex-1 truncate px-1.5 font-mono text-xs font-bold text-zinc-900 dark:text-zinc-100">
              {bookingUrl}
            </code>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-zinc-950 px-3 text-xs font-extrabold uppercase tracking-wide text-volt transition hover:opacity-90 dark:bg-volt dark:text-zinc-950"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  <span>{t('shareMatchCopiedLink')}</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>{t('shareMatchCopyLink')}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Section 2: QR Code */}
        <div className="mt-4 flex flex-col items-center rounded-2xl border border-zinc-200 bg-white p-5 text-zinc-950 shadow-sm dark:border-zinc-700">
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-zinc-800">
            <QrCode className="h-3.5 w-3.5" />
            <span>{t('shareMatchQrTitle')}</span>
          </div>

          {qrDataUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={qrDataUrl}
              alt={`${t('shareMatchQrTitle')} #${shortCode}`}
              className="h-56 w-56 rounded-xl border border-zinc-100 bg-white p-1"
            />
          ) : (
            <div className="flex h-56 w-56 items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-zinc-50 text-xs text-zinc-400">
              ...
            </div>
          )}

          <p className="mt-2.5 text-center text-xs leading-relaxed text-zinc-600">
            {t('shareMatchQrHint')}
          </p>

          <div className="mt-4 flex w-full gap-2">
            <button
              type="button"
              onClick={handleDownloadQr}
              disabled={!qrDataUrl}
              className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-zinc-950 px-3 text-xs font-extrabold uppercase tracking-wide text-volt transition hover:opacity-90 disabled:opacity-50"
            >
              <Download className="h-3.5 w-3.5" />
              <span>{t('shareMatchDownloadQr')}</span>
            </button>
            <Link
              href={`/keo/${shortCode}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-zinc-300 bg-white px-3 text-xs font-bold text-zinc-800 transition hover:border-zinc-950 hover:text-zinc-950"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span>{t('shareMatchOpenLink')}</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
