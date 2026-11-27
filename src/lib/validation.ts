import crypto from 'node:crypto';

const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UUID_ANY_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ALLOWED_MAP_HOSTS = new Set([
  'maps.app.goo.gl',
  'goo.gl',
  'www.google.com',
  'google.com',
]);

export function sanitizeText(input: unknown, maxLen: number): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/[\u0000\u202D\u202E]/g, '')
    .trim()
    .slice(0, maxLen);
}

export function validateAndNormalizePhone(raw: unknown): {
  valid: boolean;
  sanitized: string;
  normalizedLast9: string;
} {
  const sanitized = sanitizeText(raw, 30);
  const digits = sanitized.replace(/[^0-9]/g, '');
  if (digits.length < 9 || digits.length > 11) {
    return { valid: false, sanitized, normalizedLast9: '' };
  }
  return {
    valid: true,
    sanitized,
    normalizedLast9: digits.slice(-9),
  };
}

export function isValidPin(pin: unknown): pin is string {
  return typeof pin === 'string' && /^[0-9]{4}$/.test(pin);
}

export function isValidUuidV4(value: unknown): value is string {
  return typeof value === 'string' && UUID_V4_REGEX.test(value);
}

export function isValidUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_ANY_REGEX.test(value);
}

export function isValidShortCode(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9]{6}$/.test(value);
}

/**
 * Validates map_url against strict https:// allowlist for Google Maps links.
 */
export function validateMapUrl(raw: unknown): {
  valid: boolean;
  value: string | null;
} {
  if (raw === null || raw === undefined) {
    return { valid: true, value: null };
  }
  if (typeof raw !== 'string') {
    return { valid: false, value: null };
  }
  const trimmed = raw.trim();
  if (trimmed === '') {
    return { valid: true, value: null };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { valid: false, value: null };
  }

  if (parsed.protocol !== 'https:') {
    return { valid: false, value: null };
  }

  const host = parsed.hostname.toLowerCase();
  if (!ALLOWED_MAP_HOSTS.has(host)) {
    return { valid: false, value: null };
  }

  if ((host === 'goo.gl' || host === 'www.google.com' || host === 'google.com') && !parsed.pathname.startsWith('/maps')) {
    return { valid: false, value: null };
  }

  return { valid: true, value: parsed.toString() };
}

/**
 * Extracts KEO[A-Z0-9]{6} payment code from raw transfer content (including bank-prefixed strings).
 */
export function extractPaymentCode(content: unknown, prefix = 'KEO'): string | null {
  if (typeof content !== 'string') return null;
  const cleanPrefix = prefix.replace(/[^A-Za-z0-9]/g, '').toUpperCase() || 'KEO';
  const normalized = content.toUpperCase().replace(/\s+/g, '');
  const regex = new RegExp(`(${cleanPrefix}[A-Z0-9]{6})`);
  const match = normalized.match(regex);
  return match ? match[1] : null;
}

/**
 * Timing-safe verification of SePay Authorization header: "Apikey <SECRET>".
 */
export function verifySePayApiKey(
  authHeader: string | null | undefined,
  expectedKey: string | undefined
): boolean {
  if (!authHeader || !expectedKey) return false;
  const match = authHeader.match(/^Apikey\s+(.+)$/);
  if (!match) return false;

  const provided = match[1].trim();
  if (!provided) return false;

  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expectedKey, 'utf8');
  if (a.length !== b.length) {
    // Perform a dummy equal-length comparison so response timing stays uniform
    crypto.timingSafeEqual(b, b);
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

export interface SePayWebhookPayload {
  id: string;
  accountNumber: string;
  transferType: 'in';
  transferAmount: number;
  content: string;
}

export function normalizeBankAccount(value: string): string {
  return value.replace(/[^0-9A-Za-z]/g, '').toUpperCase();
}

export function validateSePayPayload(
  body: unknown,
  expectedAccount: string | undefined
): { ok: true; data: SePayWebhookPayload } | { ok: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'invalid_json_object' };
  }

  const record = body as Record<string, unknown>;
  const rawId = record.id;
  const id =
    typeof rawId === 'number' && Number.isSafeInteger(rawId) && rawId > 0
      ? String(rawId)
      : typeof rawId === 'string' && rawId.trim().length > 0 && rawId.trim().length <= 80
        ? rawId.trim()
        : null;

  if (!id) {
    return { ok: false, error: 'invalid_transaction_id' };
  }

  if (record.transferType !== 'in') {
    return { ok: false, error: 'invalid_transfer_type' };
  }

  if (typeof record.accountNumber !== 'string' || !expectedAccount) {
    return { ok: false, error: 'invalid_account_number' };
  }

  if (
    normalizeBankAccount(record.accountNumber) !==
    normalizeBankAccount(expectedAccount)
  ) {
    return { ok: false, error: 'account_mismatch' };
  }

  const amount = record.transferAmount;
  if (
    typeof amount !== 'number' ||
    !Number.isInteger(amount) ||
    amount < 1 ||
    amount > 100_000_000
  ) {
    return { ok: false, error: 'invalid_transfer_amount' };
  }

  const rawContent =
    typeof record.content === 'string'
      ? record.content
      : typeof record.description === 'string'
        ? record.description
        : '';

  const content = rawContent.replace(/\u0000/g, '').slice(0, 2000);

  return {
    ok: true,
    data: {
      id,
      accountNumber: record.accountNumber,
      transferType: 'in',
      transferAmount: amount,
      content,
    },
  };
}

/**
 * Pure refund math helpers mirroring SQL refund accounting rules.
 */
export function computeRefundableAmount(
  amountPaid: number,
  alreadyAllocatedRefunds: number
): number {
  const paid = Math.max(0, Math.trunc(amountPaid));
  const allocated = Math.max(0, Math.trunc(alreadyAllocatedRefunds));
  return Math.max(paid - allocated, 0);
}

export function computeOverpaySurplus(
  amountPaid: number,
  alreadyAllocatedRefunds: number,
  amountDue: number
): number {
  const netAvailable = computeRefundableAmount(amountPaid, alreadyAllocatedRefunds);
  return Math.max(netAvailable - Math.max(0, Math.trunc(amountDue)), 0);
}

/**
 * Extracts client IP from x-vercel-forwarded-for first, then x-real-ip.
 * Never trusts leftmost x-forwarded-for.
 */
export function extractClientIp(headers: Headers): string {
  const vercelFwd = headers.get('x-vercel-forwarded-for');
  if (vercelFwd) {
    const first = vercelFwd.split(',')[0]?.trim();
    if (first && isLikelyIp(first)) return first;
  }

  const realIp = headers.get('x-real-ip')?.trim();
  if (realIp && isLikelyIp(realIp)) return realIp;

  return '127.0.0.1';
}

function isLikelyIp(value: string): boolean {
  return /^[0-9a-fA-F:.]{3,45}$/.test(value);
}

/**
 * Verifies Origin header matches NEXT_PUBLIC_SITE_URL for Host CSRF defense.
 */
export function verifyHostOrigin(headers: Headers): boolean {
  const expectedSite = process.env.NEXT_PUBLIC_SITE_URL;
  const origin = headers.get('origin');
  if (!expectedSite || !origin) return false;

  try {
    const expectedOrigin = new URL(expectedSite).origin;
    const actualOrigin = new URL(origin).origin;
    return expectedOrigin === actualOrigin;
  } catch {
    return false;
  }
}
