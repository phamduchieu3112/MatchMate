import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  formatNotificationText,
  isValidDiscordWebhookUrl,
  isValidHttpsWebhookUrl,
  isValidTelegramBotToken,
  isValidTelegramChatId,
  sendTestHostNotification,
} from '@/lib/notifications';

describe('Host notification validators & adapters', () => {
  it('validates Telegram tokens, chat IDs, Discord webhooks, and SSRF-safe HTTPS URLs', () => {
    expect(isValidTelegramBotToken('123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw')).toBe(
      true
    );
    expect(isValidTelegramBotToken('bad-token')).toBe(false);
    expect(isValidTelegramChatId('-1001234567890')).toBe(true);
    expect(isValidTelegramChatId('abc')).toBe(false);

    expect(
      isValidDiscordWebhookUrl('https://discord.com/api/webhooks/12345/abcdef')
    ).toBe(true);
    expect(isValidDiscordWebhookUrl('https://evil.com/api/webhooks/123')).toBe(false);
    expect(isValidDiscordWebhookUrl('http://discord.com/api/webhooks/123')).toBe(false);

    expect(isValidHttpsWebhookUrl('https://hooks.example.com/zalo')).toBe(true);
    expect(isValidHttpsWebhookUrl('https://127.0.0.1/hook')).toBe(false);
    expect(isValidHttpsWebhookUrl('https://169.254.169.254/latest')).toBe(false);
    expect(isValidHttpsWebhookUrl('http://hooks.example.com/zalo')).toBe(false);
  });

  it('formats Vietnamese notification text and fails safely on unconfigured channels', async () => {
    const msg = formatNotificationText({
      type: 'payment',
      matchTitle: 'Cầu lông T7',
      shortCode: 'ABC123',
      playerName: 'An',
      slots: 2,
      amountVnd: 120_000,
    });
    expect(msg.title).toContain('SePay');
    expect(msg.body).toContain('ABC123');
    expect(msg.body).toContain('120.000');

    const results = await sendTestHostNotification({
      telegram_enabled: false,
      telegram_bot_token: '',
      telegram_chat_id: '',
      discord_enabled: false,
      discord_webhook_url: '',
      zalo_enabled: false,
      zalo_webhook_url: '',
      events: {
        booking: true,
        payment: true,
        late_cancel: true,
        refund_request: true,
      },
    });
    expect(results).toEqual([]);
  });
});
