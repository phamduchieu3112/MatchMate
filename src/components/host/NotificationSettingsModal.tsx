'use client';

import { useEffect, useState } from 'react';
import { Bell, Send, X } from 'lucide-react';
import { useLocale } from '@/lib/i18n/LocaleProvider';
import type {
  HostNotificationSettingsPublic,
  NotificationEventToggles,
} from '@/lib/types';

interface NotificationSettingsModalProps {
  open: boolean;
  onClose: () => void;
}

interface DeliveryResultItem {
  channel: 'telegram' | 'discord' | 'zalo';
  ok: boolean;
  reason?: string;
  detail?: string;
}

export function NotificationSettingsModal({
  open,
  onClose,
}: NotificationSettingsModalProps) {
  const { t } = useLocale();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [testResults, setTestResults] = useState<DeliveryResultItem[]>([]);

  const [telegramEnabled, setTelegramEnabled] = useState(false);
  const [telegramBotToken, setTelegramBotToken] = useState('');
  const [telegramTokenPlaceholder, setTelegramTokenPlaceholder] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');

  const [discordEnabled, setDiscordEnabled] = useState(false);
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState('');
  const [discordPlaceholder, setDiscordPlaceholder] = useState('');

  const [zaloEnabled, setZaloEnabled] = useState(false);
  const [zaloWebhookUrl, setZaloWebhookUrl] = useState('');

  const [events, setEvents] = useState<NotificationEventToggles>({
    booking: true,
    payment: true,
    late_cancel: true,
    refund_request: true,
  });

  const applySettingsToState = (s: HostNotificationSettingsPublic) => {
    setTelegramEnabled(s.telegram_enabled);
    setTelegramBotToken('');
    setTelegramTokenPlaceholder(
      s.has_telegram_bot_token ? s.telegram_bot_token_masked : '123456:ABC...'
    );
    setTelegramChatId(s.telegram_chat_id);

    setDiscordEnabled(s.discord_enabled);
    setDiscordWebhookUrl('');
    setDiscordPlaceholder(
      s.has_discord_webhook_url
        ? s.discord_webhook_url_masked
        : 'https://discord.com/api/webhooks/...'
    );

    setZaloEnabled(s.zalo_enabled);
    setZaloWebhookUrl(s.zalo_webhook_url);
    setEvents(s.events);
  };

  useEffect(() => {
    if (!open) return;
    setMsg('');
    setErr('');
    setTestResults([]);
    setLoading(true);
    void fetch('/api/host/notifications/settings', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { settings?: HostNotificationSettingsPublic } | null) => {
        if (!data?.settings) return;
        applySettingsToState(data.settings);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  const mapSaveError = (code: string | undefined, dbCode?: string) => {
    switch (code) {
      case 'invalid_telegram_config':
        return t('hostNotifErrInvalidTelegram');
      case 'invalid_discord_webhook':
        return t('hostNotifErrInvalidDiscord');
      case 'invalid_zalo_webhook':
        return t('hostNotifErrInvalidZalo');
      case 'db_permission_denied':
        return t('hostNotifErrDbPermission');
      case 'no_channels_configured':
        return t('hostNotifErrNoChannels');
      default:
        return dbCode ? `${t('errGeneric')} (${dbCode})` : t('errGeneric');
    }
  };

  const persistSettings = async (): Promise<boolean> => {
    const res = await fetch('/api/host/notifications/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        telegram_enabled: telegramEnabled,
        telegram_bot_token: telegramBotToken,
        telegram_chat_id: telegramChatId,
        discord_enabled: discordEnabled,
        discord_webhook_url: discordWebhookUrl,
        zalo_enabled: zaloEnabled,
        zalo_webhook_url: zaloWebhookUrl,
        events,
      }),
    });

    const payload = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      code?: string;
      settings?: HostNotificationSettingsPublic;
    };

    if (!res.ok) {
      setErr(mapSaveError(payload.error, payload.code));
      return false;
    }

    if (payload.settings) {
      applySettingsToState(payload.settings);
    } else {
      setTelegramBotToken('');
      setDiscordWebhookUrl('');
    }
    return true;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    setErr('');
    setTestResults([]);
    setSaving(true);
    try {
      const ok = await persistSettings();
      if (ok) {
        setMsg(t('hostNotifSaved'));
      }
    } catch {
      setErr(t('errGeneric'));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setMsg('');
    setErr('');
    setTestResults([]);
    setTesting(true);
    try {
      const saved = await persistSettings();
      if (!saved) {
        return;
      }

      const res = await fetch('/api/host/notifications/test', {
        method: 'POST',
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        results?: DeliveryResultItem[];
      };

      if (Array.isArray(data.results)) {
        setTestResults(data.results);
      }

      if (!res.ok || !data.ok) {
        setErr(
          data.error === 'no_channels_configured'
            ? t('hostNotifErrNoChannels')
            : t('hostNotifTestFail')
        );
        return;
      }
      setMsg(t('hostNotifTestOk'));
    } catch {
      setErr(t('hostNotifTestFail'));
    } finally {
      setTesting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/75 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-zinc-200 bg-white p-5 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900 sm:rounded-3xl sm:p-6">
        <div className="flex items-center justify-between border-b border-zinc-200 pb-3 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-zinc-950 dark:text-volt" />
            <h2 className="text-base font-extrabold uppercase tracking-tight text-zinc-950 dark:text-white">
              {t('hostNotifTitle')}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('close')}
            className="rounded-full border border-zinc-200 p-1.5 text-zinc-500 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-400"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-3 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
          {t('hostNotifDesc')}
        </p>

        {loading ? (
          <div className="py-8 text-center text-xs text-zinc-500">...</div>
        ) : (
          <form onSubmit={handleSave} className="mt-4 space-y-4">
            {/* Telegram */}
            <div className="space-y-2.5 rounded-2xl border border-zinc-200 bg-zinc-50 p-3.5 dark:border-zinc-800 dark:bg-zinc-950">
              <label className="flex items-center justify-between text-xs font-extrabold uppercase tracking-wider text-zinc-950 dark:text-white">
                <span>{t('hostNotifTelegram')}</span>
                <input
                  type="checkbox"
                  checked={telegramEnabled}
                  onChange={(e) => setTelegramEnabled(e.target.checked)}
                />
              </label>
              <input
                type="password"
                value={telegramBotToken}
                onChange={(e) => setTelegramBotToken(e.target.value)}
                placeholder={`${t('hostNotifBotToken')}: ${telegramTokenPlaceholder}`}
                className="h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-xs text-zinc-950 outline-none focus:border-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:focus:border-volt"
              />
              <input
                type="text"
                value={telegramChatId}
                onChange={(e) => setTelegramChatId(e.target.value)}
                placeholder={`${t('hostNotifChatId')} (VD: -1001234567890)`}
                className="h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-xs text-zinc-950 outline-none focus:border-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:focus:border-volt"
              />
            </div>

            {/* Discord */}
            <div className="space-y-2.5 rounded-2xl border border-zinc-200 bg-zinc-50 p-3.5 dark:border-zinc-800 dark:bg-zinc-950">
              <label className="flex items-center justify-between text-xs font-extrabold uppercase tracking-wider text-zinc-950 dark:text-white">
                <span>{t('hostNotifDiscord')}</span>
                <input
                  type="checkbox"
                  checked={discordEnabled}
                  onChange={(e) => setDiscordEnabled(e.target.checked)}
                />
              </label>
              <input
                type="url"
                value={discordWebhookUrl}
                onChange={(e) => setDiscordWebhookUrl(e.target.value)}
                placeholder={discordPlaceholder}
                className="h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-xs text-zinc-950 outline-none focus:border-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:focus:border-volt"
              />
            </div>

            {/* Zalo Webhook */}
            <div className="space-y-2.5 rounded-2xl border border-zinc-200 bg-zinc-50 p-3.5 dark:border-zinc-800 dark:bg-zinc-950">
              <label className="flex items-center justify-between text-xs font-extrabold uppercase tracking-wider text-zinc-950 dark:text-white">
                <span>{t('hostNotifZalo')}</span>
                <input
                  type="checkbox"
                  checked={zaloEnabled}
                  onChange={(e) => setZaloEnabled(e.target.checked)}
                />
              </label>
              <input
                type="url"
                value={zaloWebhookUrl}
                onChange={(e) => setZaloWebhookUrl(e.target.value)}
                placeholder={t('hostNotifWebhookUrl')}
                className="h-10 w-full rounded-xl border border-zinc-300 bg-white px-3 text-xs text-zinc-950 outline-none focus:border-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:focus:border-volt"
              />
            </div>

            {/* Event Toggles */}
            <div className="space-y-2 rounded-2xl border border-zinc-200 bg-zinc-50 p-3.5 text-xs dark:border-zinc-800 dark:bg-zinc-950">
              <p className="font-extrabold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">
                {t('hostNotifEventsTitle')}
              </p>
              {(
                [
                  ['booking', t('hostNotifEvtBooking')],
                  ['payment', t('hostNotifEvtPayment')],
                  ['late_cancel', t('hostNotifEvtLateCancel')],
                  ['refund_request', t('hostNotifEvtRefund')],
                ] as const
              ).map(([key, label]) => (
                <label
                  key={key}
                  className="flex items-center justify-between py-0.5 font-semibold text-zinc-700 dark:text-zinc-200"
                >
                  <span>{label}</span>
                  <input
                    type="checkbox"
                    checked={events[key]}
                    onChange={(e) =>
                      setEvents((prev) => ({ ...prev, [key]: e.target.checked }))
                    }
                  />
                </label>
              ))}
            </div>

            {msg && (
              <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                {msg}
              </p>
            )}
            {err && (
              <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                {err}
              </p>
            )}

            {testResults.length > 0 && (
              <ul className="space-y-1 rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-[11px] dark:border-zinc-800 dark:bg-zinc-950">
                {testResults.map((r) => (
                  <li
                    key={r.channel}
                    className={`flex items-center justify-between gap-2 font-semibold ${
                      r.ok
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-rose-700 dark:text-rose-400'
                    }`}
                  >
                    <span className="uppercase">{r.channel}</span>
                    <span className="truncate">
                      {r.ok ? '✓ OK' : `✗ ${r.detail || r.reason || 'failed'}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={testing || saving}
                onClick={() => void handleTest()}
                className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl border border-zinc-300 bg-white px-3 text-xs font-extrabold uppercase text-zinc-800 transition hover:border-zinc-950 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:border-volt"
              >
                <Send className="h-3.5 w-3.5" />
                <span>{t('hostNotifTestBtn')}</span>
              </button>
              <button
                type="submit"
                disabled={saving || testing}
                className="h-11 flex-1 rounded-xl bg-volt text-xs font-extrabold uppercase tracking-wide text-zinc-950 transition hover:bg-volt-hover disabled:opacity-60"
              >
                {t('hostNotifSaveBtn')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
