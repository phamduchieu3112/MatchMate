import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  escapeTelegramHtml,
  formatNotificationText,
  formatTelegramHtmlMessage,
  isValidDiscordWebhookUrl,
  isValidHttpsWebhookUrl,
  isValidTelegramBotToken,
  isValidTelegramChatId,
  sendTestHostNotification,
} from '@/lib/notifications';

describe('Host notification validators & adapters', () => {
  it('validates Telegram tokens, chat IDs, Discord webhooks, and SSRF-safe HTTPS URLs', () => {
    const sampleToken = ['123456789', `TestToken_${'x'.repeat(25)}`].join(':');
    expect(isValidTelegramBotToken(sampleToken)).toBe(true);
    expect(isValidTelegramBotToken('bad-token')).toBe(false);

    expect(isValidTelegramChatId('987654321')).toBe(true);
    expect(isValidTelegramChatId('-1001234567890')).toBe(true);
    expect(isValidTelegramChatId('@matchmate_club')).toBe(true);
    expect(isValidTelegramChatId('abc')).toBe(false);

    expect(
      isValidDiscordWebhookUrl('https://discord.com/api/webhooks/123456789/abcdef_123')
    ).toBe(true);
    expect(
      isValidDiscordWebhookUrl('https://discordapp.com/api/webhooks/123456789/abcdef?thread_id=99')
    ).toBe(true);
    expect(
      isValidDiscordWebhookUrl('https://ptb.discord.com/api/v10/webhooks/123456789/abcdef')
    ).toBe(true);
    expect(
      isValidDiscordWebhookUrl('https://canary.discord.com/api/webhooks/123456789/abcdef')
    ).toBe(true);
    expect(isValidDiscordWebhookUrl('https://evil.com/api/webhooks/123/abc')).toBe(false);
    expect(isValidDiscordWebhookUrl('http://discord.com/api/webhooks/123/abc')).toBe(false);

    expect(isValidHttpsWebhookUrl('https://hooks.example.com/zalo')).toBe(true);
    expect(isValidHttpsWebhookUrl('https://127.0.0.1/hook')).toBe(false);
    expect(isValidHttpsWebhookUrl('https://169.254.169.254/latest')).toBe(false);
    expect(isValidHttpsWebhookUrl('http://hooks.example.com/zalo')).toBe(false);
  });

  it('escapes HTML characters cleanly for Telegram HTML parse_mode with Vietnamese & special chars', () => {
    expect(escapeTelegramHtml('A < B & C > D')).toBe('A &lt; B &amp; C &gt; D');

    const html = formatTelegramHtmlMessage({
      type: 'booking',
      matchTitle: 'Cầu lông <T7> & TCN_2.0 *VIP* [Sân 1-2]',
      shortCode: 'KEO123',
      playerName: 'Nguyễn Văn A & <Bạn>',
      slots: 2,
      amountVnd: 150_000,
      detail: 'Ghi chú: *quan trọng* _test_ [ok]',
    });

    expect(html).toContain('<b>Cầu lông &lt;T7&gt; &amp; TCN_2.0 *VIP* [Sân 1-2]</b>');
    expect(html).toContain('<b>Nguyễn Văn A &amp; &lt;Bạn&gt;</b>');
    expect(html).toContain('<code>#KEO123</code>');
    expect(html).toContain('Ghi chú: *quan trọng* _test_ [ok]');
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
