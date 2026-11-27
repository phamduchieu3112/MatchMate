import { normalizeBankAccount, verifySePayApiKey } from '@/lib/validation';

export const PRIMARY_HOST_EMAIL = 'phamduchieu.robotic@gmail.com';
export const DEFAULT_TRANSFER_PREFIX = 'KEO';

export interface HostPaymentConfig {
  /** Normalized lowercase host login email */
  email: string;
  /** Bank identifier used by VietQR / SePay (e.g. MBBank, VCB, TCB, ACB, BIDV) */
  bankCode: string;
  /** Bank account number or SePay Virtual Account (VA) */
  accountNumber: string;
  /** Account holder name displayed to players */
  accountName: string;
  /** Host's individual SePay API token (server-only, never sent to client) */
  sepayApiToken?: string;
  /** Host's individual SePay webhook secret for "Apikey <secret>" verification (server-only) */
  sepayWebhookSecret: string;
  /** Optional unique transfer prefix per host to prevent payment collisions */
  transferPrefix?: string;
}

/**
 * Safe public subset of HostPaymentConfig that can be sent to browser clients.
 * NEVER includes sepayApiToken or sepayWebhookSecret.
 */
export interface PublicHostPaymentDetails {
  bankCode: string;
  accountNumber: string;
  accountName: string;
  transferPrefix: string;
  isFallback: boolean;
}

export interface ResolvedHostPayment {
  config: HostPaymentConfig | null;
  isConfigured: boolean;
  isFallback: boolean;
  requestedEmail: string | null;
}

export type HostPaymentConfigMap = Record<string, HostPaymentConfig>;

export function normalizeHostEmail(email: string | null | undefined): string {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

export function sanitizeTransferPrefix(prefix: unknown): string | undefined {
  if (typeof prefix !== 'string') return undefined;
  const cleaned = prefix.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 12);
  return cleaned || undefined;
}

function normalizeConfigEntry(
  raw: unknown,
  fallbackEmailKey?: string
): HostPaymentConfig | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;

  const email = normalizeHostEmail(
    typeof rec.email === 'string' ? rec.email : fallbackEmailKey
  );
  const bankCode = typeof rec.bankCode === 'string' ? rec.bankCode.trim() : '';
  const accountNumber =
    typeof rec.accountNumber === 'string' ? rec.accountNumber.trim() : '';
  const accountName =
    typeof rec.accountName === 'string' ? rec.accountName.trim() : '';
  const sepayApiToken =
    typeof rec.sepayApiToken === 'string' && rec.sepayApiToken.trim()
      ? rec.sepayApiToken.trim()
      : undefined;
  const sepayWebhookSecret =
    typeof rec.sepayWebhookSecret === 'string'
      ? rec.sepayWebhookSecret.trim()
      : '';
  const transferPrefix = sanitizeTransferPrefix(rec.transferPrefix);

  if (!email || !bankCode || !accountNumber) {
    return null;
  }

  return {
    email,
    bankCode,
    accountNumber,
    accountName: accountName || bankCode,
    sepayApiToken,
    sepayWebhookSecret,
    transferPrefix,
  };
}

/**
 * Parses HOST_PAYMENT_CONFIGS_JSON (supports either a JSON object keyed by email
 * or a JSON array of HostPaymentConfig objects) and merges legacy single-host
 * SEPAY_* env vars as the primary host fallback if not already specified.
 */
export function buildHostPaymentConfigs(
  env: Record<string, string | undefined> = process.env
): HostPaymentConfigMap {
  const configs: HostPaymentConfigMap = {};

  const rawJson = env.HOST_PAYMENT_CONFIGS_JSON?.trim();
  if (rawJson) {
    try {
      const parsed: unknown = JSON.parse(rawJson);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          const normalized = normalizeConfigEntry(item);
          if (normalized) {
            configs[normalized.email] = normalized;
          }
        }
      } else if (parsed && typeof parsed === 'object') {
        for (const [key, value] of Object.entries(
          parsed as Record<string, unknown>
        )) {
          const normalized = normalizeConfigEntry(value, key);
          if (normalized) {
            configs[normalized.email] = normalized;
          }
        }
      }
    } catch {
      // Malformed JSON is ignored safely so fallback env vars can still work
    }
  }

  // Backward-compatible legacy single-host env vars -> maps to primary host email
  const fallbackEmail =
    normalizeHostEmail(env.HOST_PAYMENT_FALLBACK_EMAIL) || PRIMARY_HOST_EMAIL;
  const legacyBank = env.SEPAY_BANK_NAME?.trim();
  const legacyAccount = env.SEPAY_BANK_ACCOUNT?.trim();
  const legacyAccountName = env.SEPAY_ACCOUNT_NAME?.trim();
  const legacyWebhookSecret = env.SEPAY_WEBHOOK_API_KEY?.trim() ?? '';
  const legacyApiToken = env.SEPAY_API_TOKEN?.trim() || undefined;
  const legacyPrefix = sanitizeTransferPrefix(env.PAYMENT_CODE_PREFIX);

  if (legacyBank && legacyAccount && !configs[fallbackEmail]) {
    configs[fallbackEmail] = {
      email: fallbackEmail,
      bankCode: legacyBank,
      accountNumber: legacyAccount,
      accountName: legacyAccountName || legacyBank,
      sepayApiToken: legacyApiToken,
      sepayWebhookSecret: legacyWebhookSecret,
      transferPrefix: legacyPrefix,
    };
  }

  return configs;
}

/**
 * Returns the active dictionary of host payment configs keyed by normalized lowercase email.
 */
export function getHostPaymentConfigs(
  env: Record<string, string | undefined> = process.env
): HostPaymentConfigMap {
  return buildHostPaymentConfigs(env);
}

/**
 * Resolves the payment configuration for a given host email.
 * - If the email exists in HOST_PAYMENT_CONFIGS, returns that isolated config.
 * - Otherwise, falls back to the primary host (phamduchieu.robotic@gmail.com or
 *   HOST_PAYMENT_FALLBACK_EMAIL) unless HOST_PAYMENT_FALLBACK_MODE=strict.
 */
export function resolveHostPaymentConfig(
  hostEmail: string | null | undefined,
  env: Record<string, string | undefined> = process.env
): ResolvedHostPayment {
  const configs = getHostPaymentConfigs(env);
  const normalizedEmail = normalizeHostEmail(hostEmail);

  if (normalizedEmail && configs[normalizedEmail]) {
    return {
      config: configs[normalizedEmail],
      isConfigured: true,
      isFallback: false,
      requestedEmail: normalizedEmail,
    };
  }

  const fallbackMode = (env.HOST_PAYMENT_FALLBACK_MODE ?? 'default_host')
    .trim()
    .toLowerCase();
  if (fallbackMode === 'strict') {
    return {
      config: null,
      isConfigured: false,
      isFallback: false,
      requestedEmail: normalizedEmail || null,
    };
  }

  const fallbackEmail =
    normalizeHostEmail(env.HOST_PAYMENT_FALLBACK_EMAIL) || PRIMARY_HOST_EMAIL;
  const fallbackConfig = configs[fallbackEmail] ?? Object.values(configs)[0] ?? null;

  return {
    config: fallbackConfig,
    isConfigured: false,
    isFallback: fallbackConfig !== null,
    requestedEmail: normalizedEmail || null,
  };
}

/**
 * Strips all server-only secrets (sepayApiToken, sepayWebhookSecret) before
 * returning bank details to browser clients.
 */
export function toPublicHostPaymentDetails(
  config: HostPaymentConfig | null,
  isFallback = false
): PublicHostPaymentDetails | null {
  if (!config) return null;
  return {
    bankCode: config.bankCode,
    accountNumber: config.accountNumber,
    accountName: config.accountName,
    transferPrefix: config.transferPrefix || DEFAULT_TRANSFER_PREFIX,
    isFallback,
  };
}

/**
 * Formats the transfer description/memo sent in VietQR and shown to players.
 * Keeps the DB payment_code (KEOxxxxxx) intact while prepending an optional
 * per-host transferPrefix to prevent cross-host payment collisions.
 */
export function formatHostTransferContent(
  paymentCode: string,
  transferPrefix?: string
): string {
  const cleanCode = paymentCode.trim();
  const cleanPrefix = sanitizeTransferPrefix(transferPrefix);
  if (
    !cleanPrefix ||
    cleanPrefix === DEFAULT_TRANSFER_PREFIX ||
    cleanCode.toUpperCase().startsWith(cleanPrefix)
  ) {
    return cleanCode;
  }
  return `${cleanPrefix} ${cleanCode}`;
}

/**
 * Finds all configured hosts whose sepayWebhookSecret matches the incoming
 * Authorization: Apikey <secret> header using timing-safe comparison.
 * Evaluates all entries without short-circuiting to avoid timing leaks.
 */
export function findHostsByWebhookApiKey(
  authHeader: string | null | undefined,
  configs: HostPaymentConfigMap
): HostPaymentConfig[] {
  const matches: HostPaymentConfig[] = [];
  for (const config of Object.values(configs)) {
    if (
      config.sepayWebhookSecret &&
      verifySePayApiKey(authHeader, config.sepayWebhookSecret)
    ) {
      matches.push(config);
    }
  }
  return matches;
}

/**
 * Checks whether a SePay webhook payload's accountNumber or subAccount matches
 * a specific host configuration's accountNumber.
 */
export function hostMatchesAccount(
  config: HostPaymentConfig,
  accountNumber: unknown,
  subAccount: unknown
): boolean {
  const normExpected = normalizeBankAccount(config.accountNumber);
  if (!normExpected) return false;
  const normAccount =
    typeof accountNumber === 'string' ? normalizeBankAccount(accountNumber) : '';
  const normSub =
    typeof subAccount === 'string' ? normalizeBankAccount(subAccount) : '';
  return normAccount === normExpected || normSub === normExpected;
}
