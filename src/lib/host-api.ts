import 'server-only';
import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import {
  createServerSupabaseClient,
  getAuthenticatedHost,
} from '@/lib/supabase/server';
import { verifyHostOrigin } from '@/lib/validation';

const SHORT_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateShortCode(): string {
  const bytes = crypto.randomBytes(6);
  let out = '';
  for (let i = 0; i < 6; i += 1) {
    out += SHORT_CODE_CHARS[bytes[i] % SHORT_CODE_CHARS.length];
  }
  return out;
}

export async function requireHostMutation(request: NextRequest) {
  if (!verifyHostOrigin(request.headers)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'invalid_origin' }, { status: 403 }),
    };
  }

  const { user, isHost } = await getAuthenticatedHost();
  if (!user || !isHost) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'unauthorized' }, { status: 401 }),
    };
  }

  const supabase = await createServerSupabaseClient();
  return { ok: true as const, user, supabase };
}

export function hasVietnamOffset(iso: unknown): iso is string {
  return (
    typeof iso === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?\+07:00$/.test(iso) &&
    !Number.isNaN(new Date(iso).getTime())
  );
}
