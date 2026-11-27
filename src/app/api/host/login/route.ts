import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import {
  enforceRateLimits,
  hashRateLimitKey,
  normalizeIpForRateLimit,
} from '@/lib/rate-limit';
import { extractClientIp, sanitizeText, verifyHostOrigin } from '@/lib/validation';

export async function POST(request: NextRequest) {
  if (!verifyHostOrigin(request.headers)) {
    return NextResponse.json({ error: 'invalid_origin' }, { status: 403 });
  }

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

  const email = sanitizeText(body.email, 120);
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || !password) {
    return NextResponse.json({ error: 'missing_credentials' }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const normIp = normalizeIpForRateLimit(extractClientIp(request.headers));
    const rateLimitRes = await enforceRateLimits(admin, [
      { key: `login:ip:${normIp}`, limit: 5, windowSeconds: 900 },
      {
        key: `login:ip_email:${normIp}:${hashRateLimitKey(email.toLowerCase())}`,
        limit: 5,
        windowSeconds: 900,
      },
    ]);
    if (rateLimitRes) return rateLimitRes;
  } catch {
    return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 });
  }

  if (data.user.app_metadata?.role !== 'host') {
    await supabase.auth.signOut();
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
