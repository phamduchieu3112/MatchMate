'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import {
  AlertCircle,
  Camera,
  CameraOff,
  CheckCircle2,
  QrCode,
  Search,
  X,
} from 'lucide-react';
import { useLocale } from '@/lib/i18n/LocaleProvider';
import { translateRegStatus } from '@/lib/i18n/helpers';
import type { HostRegistrationRow } from '@/components/host/MatchDetailTabs';

interface QrCheckinModalProps {
  open: boolean;
  onClose: () => void;
  registrations: HostRegistrationRow[];
  onCheckin: (registrationId: string) => Promise<boolean>;
}

type ScanFeedback =
  | { kind: 'success'; text: string }
  | { kind: 'warning'; text: string }
  | { kind: 'error'; text: string }
  | null;

function normalizeScannedCode(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const withoutPrefix = trimmed.replace(/^MM:/i, '').trim();
  return withoutPrefix.toUpperCase();
}

export function QrCheckinModal({
  open,
  onClose,
  registrations,
  onCheckin,
}: QrCheckinModalProps) {
  const { t } = useLocale();
  const [manualCode, setManualCode] = useState('');
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [processing, setProcessing] = useState(false);
  const [feedback, setFeedback] = useState<ScanFeedback>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastScannedRef = useRef<{ code: string; at: number }>({
    code: '',
    at: 0,
  });

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  useEffect(() => {
    if (!open) {
      stopCamera();
      setFeedback(null);
      setCameraError('');
      setManualCode('');
    }
    return () => {
      stopCamera();
    };
  }, [open, stopCamera]);

  const handleCodeLookup = useCallback(
    async (rawInput: string) => {
      const code = normalizeScannedCode(rawInput);
      if (!code || processing) return;

      const match = registrations.find(
        (r) =>
          r.payment_code.toUpperCase() === code ||
          r.id.toUpperCase() === code
      );

      if (!match) {
        setFeedback({ kind: 'error', text: t('hostScanNotFound') });
        return;
      }

      if (match.status !== 'confirmed') {
        setFeedback({
          kind: 'warning',
          text: t('hostScanNotPaid', {
            name: match.display_name,
            status: translateRegStatus(match.status, t),
          }),
        });
        return;
      }

      if (match.checked_in) {
        setFeedback({
          kind: 'warning',
          text: t('hostScanAlreadyCheckedIn', {
            name: match.display_name,
            slots: match.slots,
          }),
        });
        return;
      }

      setProcessing(true);
      const ok = await onCheckin(match.id);
      setProcessing(false);

      if (ok) {
        setFeedback({
          kind: 'success',
          text: t('hostScanSuccess', {
            name: match.display_name,
            slots: match.slots,
          }),
        });
        setManualCode('');
      } else {
        setFeedback({ kind: 'error', text: t('errGeneric') });
      }
    },
    [onCheckin, processing, registrations, t]
  );

  const startCamera = async () => {
    setCameraError('');
    setFeedback(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(t('hostScanCameraError'));
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      setCameraActive(true);
      window.setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => {});
        }
      }, 50);
    } catch {
      setCameraError(t('hostScanCameraError'));
      stopCamera();
    }
  };

  // Frame scanning loop when camera is active
  useEffect(() => {
    if (!cameraActive || !open) return;

    const timer = window.setInterval(() => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) return;
      const width = video.videoWidth;
      const height = video.videoHeight;
      if (!width || !height) return;

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, width, height);
      const imageData = ctx.getImageData(0, 0, width, height);
      const decoded = jsQR(imageData.data, width, height, {
        inversionAttempts: 'dontInvert',
      });

      if (decoded?.data) {
        const code = normalizeScannedCode(decoded.data);
        const now = Date.now();
        if (
          code &&
          (lastScannedRef.current.code !== code ||
            now - lastScannedRef.current.at > 2500)
        ) {
          lastScannedRef.current = { code, at: now };
          void handleCodeLookup(code);
        }
      }
    }, 180);

    return () => window.clearInterval(timer);
  }, [cameraActive, open, handleCodeLookup]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/75 p-0 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900 sm:rounded-3xl sm:p-6">
        <div className="flex items-center justify-between border-b border-zinc-200 pb-3 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-zinc-950 dark:text-volt" />
            <h2 className="text-base font-extrabold uppercase tracking-tight text-zinc-950 dark:text-white">
              {t('hostScanQrTitle')}
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

        <div className="mt-4 space-y-4">
          {/* Camera Controls & Preview */}
          <div className="space-y-3">
            {cameraActive ? (
              <div className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="aspect-square w-full object-cover"
                />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 flex items-center justify-center"
                >
                  <div className="h-48 w-48 rounded-2xl border-2 border-volt shadow-volt" />
                </div>
                <canvas ref={canvasRef} className="hidden" />
              </div>
            ) : null}

            <button
              type="button"
              onClick={cameraActive ? stopCamera : () => void startCamera()}
              className={`flex h-11 w-full items-center justify-center gap-2 rounded-xl text-xs font-extrabold uppercase tracking-wide transition ${
                cameraActive
                  ? 'border border-zinc-300 bg-zinc-100 text-zinc-800 hover:bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200'
                  : 'bg-volt text-zinc-950 hover:bg-volt-hover'
              }`}
            >
              {cameraActive ? (
                <>
                  <CameraOff className="h-4 w-4" />
                  <span>{t('hostScanCameraStop')}</span>
                </>
              ) : (
                <>
                  <Camera className="h-4 w-4" />
                  <span>{t('hostScanCameraStart')}</span>
                </>
              )}
            </button>

            {cameraError && (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                {cameraError}
              </p>
            )}
          </div>

          {/* Scan / Lookup Feedback Banner */}
          {feedback && (
            <div
              className={`flex items-start gap-2 rounded-xl border p-3 text-xs font-bold ${
                feedback.kind === 'success'
                  ? 'border-emerald-400/50 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-200'
                  : feedback.kind === 'warning'
                    ? 'border-amber-400/50 bg-amber-50 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200'
                    : 'border-rose-400/50 bg-rose-50 text-rose-900 dark:bg-rose-950/50 dark:text-rose-200'
              }`}
            >
              {feedback.kind === 'success' ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <span>{feedback.text}</span>
            </div>
          )}

          {/* Manual Code Lookup Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleCodeLookup(manualCode);
            }}
            className="flex gap-2 border-t border-zinc-200 pt-4 dark:border-zinc-800"
          >
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                placeholder={t('hostScanManualPlaceholder')}
                className="h-11 w-full rounded-xl border border-zinc-300 bg-zinc-50 pl-9 pr-3 font-mono text-sm uppercase text-zinc-950 outline-none focus:border-zinc-950 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white dark:focus:border-volt"
              />
            </div>
            <button
              type="submit"
              disabled={processing || !manualCode.trim()}
              className="h-11 shrink-0 rounded-xl bg-zinc-950 px-4 text-xs font-extrabold uppercase tracking-wide text-volt transition hover:opacity-90 disabled:opacity-50 dark:bg-volt dark:text-zinc-950"
            >
              {t('hostScanSubmitBtn')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
