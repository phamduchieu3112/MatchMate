import { NextRequest, NextResponse } from 'next/server';
import { requireHostMutation } from '@/lib/host-api';
import {
  loadHostNotificationConfig,
  sendTestHostNotification,
} from '@/lib/notifications';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(request: NextRequest) {
  const auth = await requireHostMutation(request);
  if (!auth.ok) return auth.response;

  try {
    const admin = createAdminClient();
    const config = await loadHostNotificationConfig(admin, auth.user.id);
    const results = await sendTestHostNotification(config);

    if (results.length === 0) {
      return NextResponse.json({ error: 'no_channels_configured' }, { status: 400 });
    }

    const anySuccess = results.some((r) => r.ok);
    return NextResponse.json(
      { ok: anySuccess, results },
      { status: anySuccess ? 200 : 502 }
    );
  } catch {
    return NextResponse.json({ error: 'test_failed' }, { status: 500 });
  }
}
