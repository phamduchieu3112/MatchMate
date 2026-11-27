import 'server-only';
import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface RateLimitRule {
  key: string;
  limit: number;
  windowSeconds: number;
}

/**
 * Normalizes IPv6 addresses to a /64 prefix for rate-limit key bucketing.
 */
export function normalizeIpForRateLimit(ip: string): string {
  if (!ip.includes(':')) return ip;
  const parts = ip.split(':');
  if (parts.length >= 4) {
    return `${parts.slice(0, 4).join(':')}::/64`;
  }
  return ip;
}

/**
 * Hashes sensitive identifiers (email, phone) before storing them in rate-limit keys.
 */
export function hashRateLimitKey(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 24);
}

/**
 * Executes a single atomic rate-limit check via the Postgres check_rate_limit RPC.
 */
export async function enforceRateLimit(
  admin: SupabaseClient,
  key: string,
  limit: number,
  windowSeconds: number
): Promise<{ allowed: boolean; error: boolean }> {
  try {
    const { data, error } = await admin.rpc('check_rate_limit', {
      p_key: key,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });

    if (error || typeof data !== 'boolean') {
      return { allowed: false, error: true };
    }

    return { allowed: data, error: false };
  } catch {
    return { allowed: false, error: true };
  }
}

/**
 * Evaluates multiple rate-limit rules in parallel, returning a 429 or 503 response
 * on failure, or null when all rules pass.
 */
export async function enforceRateLimits(
  admin: SupabaseClient,
  rules: RateLimitRule[]
): Promise<NextResponse | null> {
  const results = await Promise.all(
    rules.map((rule) =>
      enforceRateLimit(admin, rule.key, rule.limit, rule.windowSeconds)
    )
  );

  if (results.some((r) => !r.allowed && !r.error)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  if (results.some((r) => r.error)) {
    return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  }

  return null;
}
