import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  NotificationEventToggles,
  NotificationEventType,
} from '@/lib/types';

export interface HostNotificationPayload {
  type: NotificationEventType;
  matchTitle: string;
  shortCode: string;
  playerName?: string;
  slots?: number;
  amountVnd?: number;
  detail?: string;
}

export interface HostNotificationConfig {
  telegram_enabled: boolean;
  telegram_bot_token: string;
  telegram_chat_id: string;
  discord_enabled: boolean;
  discord_webhook_url: string;
  zalo_enabled: boolean;
  zalo_webhook_url: string;
  events: NotificationEventToggles;
}

export interface NotificationDeliveryResult {
  channel: 'telegram' | 'discord' | 'zalo';
  ok: boolean;
  reason?: string;
}

export interface NotificationAdapter {
  readonly channel: 'telegram' | 'discord' | 'zalo';
  isConfigured(config: HostNotificationConfig): boolean;
  send(
    config: HostNotificationConfig,
    payload: HostNotificationPayload
  ): Promise<NotificationDeliveryResult>;
}

const DEFAULT_EVENTS: NotificationEventToggles = {
  booking: true,
  payment: true,
  late_cancel: true,
  refund_request: true,
};

const BLOCKED_HOSTNAME_REGEX =
  /^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.0\.0\.0|\[::1\])/i;

export function isValidTelegramBotToken(token: string): boolean {
  return /^\d{5,15}:[A-Za-z0-9_-]{20,}$/.test(token.trim());
}

export function isValidTelegramChatId(chatId: string): boolean {
  return /^-?\d{4,20}$/.test(chatId.trim());
}

export function isValidDiscordWebhookUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host !== 'discord.com' &&
      host !== 'discordapp.com' &&
      host !== 'ptb.discord.com' &&
      host !== 'canary.discord.com'
    ) {
      return false;
    }
    return parsed.pathname.startsWith('/api/webhooks/');
  } catch {
    return false;
  }
}

export function isValidHttpsWebhookUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (!host || BLOCKED_HOSTNAME_REGEX.test(host) || host.endsWith('.local')) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function maskSecret(value: string | null | undefined): string {
  const clean = value?.trim() ?? '';
  if (!clean) return '';
  if (clean.length <= 8) return '••••••••';
  return `${clean.slice(0, 4)}••••${clean.slice(-4)}`;
}

function formatVndSimple(amount: number): string {
  return `${new Intl.NumberFormat('vi-VN').format(amount)}₫`;
}

export function formatNotificationText(payload: HostNotificationPayload): {
  title: string;
  body: string;
  color: number;
} {
  const headerMap: Record<NotificationEventType, { title: string; color: number }> = {
    booking: { title: '🎾 Đặt chỗ mới trên MatchMate', color: 0xb4f000 },
    payment: { title: '✅ Đã nhận thanh toán SePay', color: 0x10b981 },
    late_cancel: { title: '⚠️ Hủy chỗ sát giờ chơi', color: 0xf59e0b },
    refund_request: { title: '💸 Yêu cầu hoàn tiền mới', color: 0xf43f5e },
  };

  const meta = headerMap[payload.type];
  const lines = [`Buổi chơi: ${payload.matchTitle} (#${payload.shortCode})`];
  if (payload.playerName) {
    lines.push(
      `Người chơi: ${payload.playerName}${payload.slots ? ` (×${payload.slots} slot)` : ''}`
    );
  }
  if (typeof payload.amountVnd === 'number') {
    lines.push(`Số tiền: ${formatVndSimple(payload.amountVnd)}`);
  }
  if (payload.detail) {
    lines.push(`Chi tiết: ${payload.detail}`);
  }

  return {
    title: meta.title,
    body: lines.join('\n'),
    color: meta.color,
  };
}

export const telegramAdapter: NotificationAdapter = {
  channel: 'telegram',
  isConfigured(config) {
    return (
      config.telegram_enabled &&
      isValidTelegramBotToken(config.telegram_bot_token) &&
      isValidTelegramChatId(config.telegram_chat_id)
    );
  },
  async send(config, payload) {
    if (!this.isConfigured(config)) {
      return { channel: 'telegram', ok: false, reason: 'not_configured' };
    }
    const formatted = formatNotificationText(payload);
    const text = `${formatted.title}\n\n${formatted.body}`;
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${config.telegram_bot_token.trim()}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: config.telegram_chat_id.trim(),
            text,
            disable_web_page_preview: true,
          }),
          signal: AbortSignal.timeout(3500),
          cache: 'no-store',
        }
      );
      return res.ok
        ? { channel: 'telegram', ok: true }
        : { channel: 'telegram', ok: false, reason: `http_${res.status}` };
    } catch {
      return { channel: 'telegram', ok: false, reason: 'network_error' };
    }
  },
};

export const discordAdapter: NotificationAdapter = {
  channel: 'discord',
  isConfigured(config) {
    return (
      config.discord_enabled &&
      isValidDiscordWebhookUrl(config.discord_webhook_url)
    );
  },
  async send(config, payload) {
    if (!this.isConfigured(config)) {
      return { channel: 'discord', ok: false, reason: 'not_configured' };
    }
    const formatted = formatNotificationText(payload);
    try {
      const res = await fetch(config.discord_webhook_url.trim(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          embeds: [
            {
              title: formatted.title,
              description: formatted.body,
              color: formatted.color,
              timestamp: new Date().toISOString(),
            },
          ],
        }),
        signal: AbortSignal.timeout(3500),
        cache: 'no-store',
      });
      return res.ok
        ? { channel: 'discord', ok: true }
        : { channel: 'discord', ok: false, reason: `http_${res.status}` };
    } catch {
      return { channel: 'discord', ok: false, reason: 'network_error' };
    }
  },
};

export const zaloWebhookAdapter: NotificationAdapter = {
  channel: 'zalo',
  isConfigured(config) {
    return (
      config.zalo_enabled && isValidHttpsWebhookUrl(config.zalo_webhook_url)
    );
  },
  async send(config, payload) {
    if (!this.isConfigured(config)) {
      return { channel: 'zalo', ok: false, reason: 'not_configured' };
    }
    const formatted = formatNotificationText(payload);
    try {
      const res = await fetch(config.zalo_webhook_url.trim(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'matchmate',
          event: payload.type,
          title: formatted.title,
          message: formatted.body,
          data: payload,
        }),
        signal: AbortSignal.timeout(3500),
        cache: 'no-store',
      });
      return res.ok
        ? { channel: 'zalo', ok: true }
        : { channel: 'zalo', ok: false, reason: `http_${res.status}` };
    } catch {
      return { channel: 'zalo', ok: false, reason: 'network_error' };
    }
  },
};

const ALL_ADAPTERS: NotificationAdapter[] = [
  telegramAdapter,
  discordAdapter,
  zaloWebhookAdapter,
];

function getEnvFallbackConfig(): HostNotificationConfig {
  const tgToken = process.env.TELEGRAM_BOT_TOKEN?.trim() ?? '';
  const tgChat = process.env.TELEGRAM_CHAT_ID?.trim() ?? '';
  const discordUrl = process.env.DISCORD_WEBHOOK_URL?.trim() ?? '';
  const zaloUrl = process.env.ZALO_WEBHOOK_URL?.trim() ?? '';

  return {
    telegram_enabled: Boolean(tgToken && tgChat),
    telegram_bot_token: tgToken,
    telegram_chat_id: tgChat,
    discord_enabled: Boolean(discordUrl),
    discord_webhook_url: discordUrl,
    zalo_enabled: Boolean(zaloUrl),
    zalo_webhook_url: zaloUrl,
    events: { ...DEFAULT_EVENTS },
  };
}

export function normalizeEventsToggles(raw: unknown): NotificationEventToggles {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_EVENTS };
  }
  const rec = raw as Record<string, unknown>;
  return {
    booking: rec.booking !== false,
    payment: rec.payment !== false,
    late_cancel: rec.late_cancel !== false,
    refund_request: rec.refund_request !== false,
  };
}

export async function loadHostNotificationConfig(
  admin: SupabaseClient,
  hostId: string | null | undefined
): Promise<HostNotificationConfig> {
  const fallback = getEnvFallbackConfig();
  if (!hostId) return fallback;

  try {
    const { data, error } = await admin
      .from('host_notification_settings')
      .select(
        'telegram_enabled, telegram_bot_token, telegram_chat_id, discord_enabled, discord_webhook_url, zalo_enabled, zalo_webhook_url, events'
      )
      .eq('host_id', hostId)
      .maybeSingle();

    if (error || !data) {
      return fallback;
    }

    const row = data as Record<string, unknown>;
    return {
      telegram_enabled: Boolean(row.telegram_enabled),
      telegram_bot_token:
        typeof row.telegram_bot_token === 'string' ? row.telegram_bot_token : '',
      telegram_chat_id:
        typeof row.telegram_chat_id === 'string' ? row.telegram_chat_id : '',
      discord_enabled: Boolean(row.discord_enabled),
      discord_webhook_url:
        typeof row.discord_webhook_url === 'string'
          ? row.discord_webhook_url
          : '',
      zalo_enabled: Boolean(row.zalo_enabled),
      zalo_webhook_url:
        typeof row.zalo_webhook_url === 'string' ? row.zalo_webhook_url : '',
      events: normalizeEventsToggles(row.events),
    };
  } catch {
    return fallback;
  }
}

/**
 * Dispatches enabled host notifications without ever throwing or blocking core booking/payment flows.
 */
export async function dispatchHostNotification(
  admin: SupabaseClient,
  hostId: string | null | undefined,
  payload: HostNotificationPayload
): Promise<NotificationDeliveryResult[]> {
  try {
    const config = await loadHostNotificationConfig(admin, hostId);
    if (!config.events[payload.type]) {
      return [];
    }

    const activeAdapters = ALL_ADAPTERS.filter((a) => a.isConfigured(config));
    if (activeAdapters.length === 0) return [];

    const settled = await Promise.allSettled(
      activeAdapters.map((adapter) => adapter.send(config, payload))
    );

    return settled.map((res, idx) =>
      res.status === 'fulfilled'
        ? res.value
        : { channel: activeAdapters[idx].channel, ok: false, reason: 'rejected' }
    );
  } catch {
    return [];
  }
}

export async function sendTestHostNotification(
  config: HostNotificationConfig
): Promise<NotificationDeliveryResult[]> {
  const activeAdapters = ALL_ADAPTERS.filter((a) => a.isConfigured(config));
  if (activeAdapters.length === 0) {
    return [];
  }

  const testPayload: HostNotificationPayload = {
    type: 'booking',
    matchTitle: 'Kèo kiểm tra thông báo MatchMate',
    shortCode: 'TEST01',
    playerName: 'Người chơi thử nghiệm',
    slots: 2,
    amountVnd: 100_000,
    detail: 'Kết nối thông báo hoạt động bình thường!',
  };

  const settled = await Promise.allSettled(
    activeAdapters.map((adapter) => adapter.send(config, testPayload))
  );

  return settled.map((res, idx) =>
    res.status === 'fulfilled'
      ? res.value
      : { channel: activeAdapters[idx].channel, ok: false, reason: 'rejected' }
  );
}
