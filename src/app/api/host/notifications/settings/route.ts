import { NextRequest, NextResponse } from 'next/server';
import { requireHostMutation } from '@/lib/host-api';
import {
  isValidDiscordWebhookUrl,
  isValidHttpsWebhookUrl,
  isValidTelegramBotToken,
  isValidTelegramChatId,
  maskSecret,
  normalizeEventsToggles,
} from '@/lib/notifications';
import {
  createServerSupabaseClient,
  getAuthenticatedHost,
} from '@/lib/supabase/server';
import { sanitizeText } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { user, isHost } = await getAuthenticatedHost();
  if (!user || !isHost) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('host_notification_settings')
      .select(
        'telegram_enabled, telegram_bot_token, telegram_chat_id, discord_enabled, discord_webhook_url, zalo_enabled, zalo_webhook_url, events'
      )
      .eq('host_id', user.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: 'db_read_failed', code: error.code },
        { status: 500 }
      );
    }

    const row = (data as Record<string, unknown> | null) ?? null;
    const tgToken =
      typeof row?.telegram_bot_token === 'string' ? row.telegram_bot_token : '';
    const discordUrl =
      typeof row?.discord_webhook_url === 'string' ? row.discord_webhook_url : '';

    return NextResponse.json(
      {
        settings: {
          telegram_enabled: Boolean(row?.telegram_enabled),
          telegram_bot_token_masked: maskSecret(tgToken),
          has_telegram_bot_token: Boolean(tgToken),
          telegram_chat_id:
            typeof row?.telegram_chat_id === 'string' ? row.telegram_chat_id : '',
          discord_enabled: Boolean(row?.discord_enabled),
          discord_webhook_url_masked: maskSecret(discordUrl),
          has_discord_webhook_url: Boolean(discordUrl),
          zalo_enabled: Boolean(row?.zalo_enabled),
          zalo_webhook_url:
            typeof row?.zalo_webhook_url === 'string' ? row.zalo_webhook_url : '',
          events: normalizeEventsToggles(row?.events),
        },
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json({ error: 'internal_error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireHostMutation(request);
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const { data: existing, error: existingErr } = await auth.supabase
    .from('host_notification_settings')
    .select('telegram_bot_token, discord_webhook_url')
    .eq('host_id', auth.user.id)
    .maybeSingle();

  if (existingErr) {
    return NextResponse.json(
      {
        error:
          existingErr.code === '42501'
            ? 'db_permission_denied'
            : 'db_read_failed',
        code: existingErr.code,
      },
      { status: existingErr.code === '42501' ? 403 : 500 }
    );
  }

  const existingRow = (existing as Record<string, unknown> | null) ?? null;

  const telegramEnabled = body.telegram_enabled === true;
  const rawTgToken = sanitizeText(body.telegram_bot_token, 200);
  const telegramBotToken =
    rawTgToken ||
    (typeof existingRow?.telegram_bot_token === 'string'
      ? existingRow.telegram_bot_token
      : '');
  const telegramChatId = sanitizeText(body.telegram_chat_id, 40);

  if (telegramEnabled) {
    if (
      !isValidTelegramBotToken(telegramBotToken) ||
      !isValidTelegramChatId(telegramChatId)
    ) {
      return NextResponse.json({ error: 'invalid_telegram_config' }, { status: 400 });
    }
  } else if (rawTgToken && !isValidTelegramBotToken(rawTgToken)) {
    return NextResponse.json({ error: 'invalid_telegram_config' }, { status: 400 });
  }

  const discordEnabled = body.discord_enabled === true;
  const rawDiscordUrl = sanitizeText(body.discord_webhook_url, 500);
  const discordWebhookUrl =
    rawDiscordUrl ||
    (typeof existingRow?.discord_webhook_url === 'string'
      ? existingRow.discord_webhook_url
      : '');

  if (discordEnabled && !isValidDiscordWebhookUrl(discordWebhookUrl)) {
    return NextResponse.json({ error: 'invalid_discord_webhook' }, { status: 400 });
  } else if (rawDiscordUrl && !isValidDiscordWebhookUrl(rawDiscordUrl)) {
    return NextResponse.json({ error: 'invalid_discord_webhook' }, { status: 400 });
  }

  const zaloEnabled = body.zalo_enabled === true;
  const zaloWebhookUrl = sanitizeText(body.zalo_webhook_url, 500);
  if (zaloEnabled && !isValidHttpsWebhookUrl(zaloWebhookUrl)) {
    return NextResponse.json({ error: 'invalid_zalo_webhook' }, { status: 400 });
  } else if (zaloWebhookUrl && !isValidHttpsWebhookUrl(zaloWebhookUrl)) {
    return NextResponse.json({ error: 'invalid_zalo_webhook' }, { status: 400 });
  }

  const events = normalizeEventsToggles(body.events);

  const { error } = await auth.supabase.from('host_notification_settings').upsert(
    {
      host_id: auth.user.id,
      telegram_enabled: telegramEnabled,
      telegram_bot_token: telegramBotToken || null,
      telegram_chat_id: telegramChatId || null,
      discord_enabled: discordEnabled,
      discord_webhook_url: discordWebhookUrl || null,
      zalo_enabled: zaloEnabled,
      zalo_webhook_url: zaloWebhookUrl || null,
      events,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'host_id' }
  );

  if (error) {
    return NextResponse.json(
      {
        error: error.code === '42501' ? 'db_permission_denied' : 'save_failed',
        code: error.code,
      },
      { status: error.code === '42501' ? 403 : 400 }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      settings: {
        telegram_enabled: telegramEnabled,
        telegram_bot_token_masked: maskSecret(telegramBotToken),
        has_telegram_bot_token: Boolean(telegramBotToken),
        telegram_chat_id: telegramChatId,
        discord_enabled: discordEnabled,
        discord_webhook_url_masked: maskSecret(discordWebhookUrl),
        has_discord_webhook_url: Boolean(discordWebhookUrl),
        zalo_enabled: zaloEnabled,
        zalo_webhook_url: zaloWebhookUrl,
        events,
      },
    },
    { status: 200 }
  );
}
