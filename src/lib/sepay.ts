import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  formatHostTransferContent,
  normalizeHostEmail,
  resolveHostPaymentConfig,
  toPublicHostPaymentDetails,
  type HostPaymentConfig,
  type PublicHostPaymentDetails,
  type ResolvedHostPayment,
} from '@/lib/host-payment-config';

const HOST_EMAIL_CACHE_TTL_MS = 5 * 60 * 1000;
const hostEmailCache = new Map<string, { email: string | null; expiresAt: number }>();

/**
 * Resolves a Supabase Auth user's email from their host_id (UUID) using the
 * admin client, with a short in-memory TTL cache to avoid repeated Auth calls.
 */
export async function resolveHostEmailByUserId(
  admin: SupabaseClient,
  hostId: string | null | undefined
): Promise<string | null> {
  if (!hostId) return null;

  const now = Date.now();
  const cached = hostEmailCache.get(hostId);
  if (cached && cached.expiresAt > now) {
    return cached.email;
  }

  try {
    const { data, error } = await admin.auth.admin.getUserById(hostId);
    const email = !error && data?.user?.email ? normalizeHostEmail(data.user.email) : null;
    hostEmailCache.set(hostId, {
      email,
      expiresAt: now + HOST_EMAIL_CACHE_TTL_MS,
    });
    return email;
  } catch {
    return null;
  }
}

/**
 * Looks up the host_id of a match and resolves that host's isolated payment config
 * (or the configured fallback host if the match creator is not registered).
 */
export async function resolveMatchHostPayment(
  admin: SupabaseClient,
  matchId: string
): Promise<ResolvedHostPayment> {
  const { data: matchRow } = await admin
    .from('matches')
    .select('host_id')
    .eq('id', matchId)
    .maybeSingle();

  const hostId = (matchRow as { host_id?: string } | null)?.host_id ?? null;
  const hostEmail = await resolveHostEmailByUserId(admin, hostId);
  return resolveHostPaymentConfig(hostEmail);
}

/**
 * Builds dynamic SePay VietQR image URL strictly on the server for a specific host.
 * Secrets (sepayApiToken, sepayWebhookSecret) are never included in the URL.
 */
export function buildSePayQrUrl(
  amount: number,
  paymentCode: string,
  hostConfig?: HostPaymentConfig | null
): string | null {
  const resolved = hostConfig ?? resolveHostPaymentConfig(null).config;
  const account = resolved?.accountNumber?.trim();
  const bank = resolved?.bankCode?.trim();

  if (!account || !bank || amount <= 0 || !paymentCode) {
    return null;
  }

  const transferContent = formatHostTransferContent(
    paymentCode,
    resolved?.transferPrefix
  );

  const params = new URLSearchParams({
    acc: account,
    bank,
    amount: String(Math.trunc(amount)),
    des: transferContent,
  });

  return `https://qr.sepay.vn/img?${params.toString()}`;
}

/**
 * Builds the complete safe client payload for payment display (QR URL, transfer memo,
 * and sanitized public bank details without any SePay secrets).
 */
export function buildHostPaymentClientBundle(
  amount: number,
  paymentCode: string,
  resolved: ResolvedHostPayment
): {
  qrUrl: string | null;
  transferContent: string;
  paymentInfo: PublicHostPaymentDetails | null;
} {
  const transferContent = formatHostTransferContent(
    paymentCode,
    resolved.config?.transferPrefix
  );
  const qrUrl =
    amount > 0 && resolved.config
      ? buildSePayQrUrl(amount, paymentCode, resolved.config)
      : null;
  const paymentInfo = toPublicHostPaymentDetails(
    resolved.config,
    resolved.isFallback
  );

  return { qrUrl, transferContent, paymentInfo };
}

export async function verifyTurnstileToken(
  token: string,
  remoteIp: string
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret || !token || token.length > 2048) {
    return false;
  }

  try {
    const formData = new URLSearchParams();
    formData.set('secret', secret);
    formData.set('response', token);
    if (remoteIp) {
      formData.set('remoteip', remoteIp);
    }

    const res = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
        cache: 'no-store',
      }
    );

    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
