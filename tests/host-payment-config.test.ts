import { describe, expect, it } from 'vitest';
import {
  buildHostPaymentConfigs,
  findHostsByWebhookApiKey,
  formatHostTransferContent,
  hostMatchesAccount,
  PRIMARY_HOST_EMAIL,
  resolveHostPaymentConfig,
  toPublicHostPaymentDetails,
} from '@/lib/host-payment-config';

describe('Scalable N-host payment configuration', () => {
  const multiHostJson = JSON.stringify({
    'PhamDucHieu.Robotics@gmail.com': {
      bankCode: 'MBBank',
      accountNumber: '0123456789',
      accountName: 'PHAM DUC HIEU',
      sepayApiToken: 'api-token-hieu',
      sepayWebhookSecret: 'webhook-secret-hieu',
      transferPrefix: 'PDH',
    },
    'friend1@gmail.com': {
      bankCode: 'VCB',
      accountNumber: '9988776655',
      accountName: 'NGUYEN VAN B',
      sepayApiToken: 'api-token-friend1',
      sepayWebhookSecret: 'webhook-secret-friend1',
      transferPrefix: 'FR1',
    },
    'friend2@gmail.com': {
      bankCode: 'TCB',
      accountNumber: '1122334455',
      accountName: 'TRAN THI C',
      sepayApiToken: 'api-token-friend2',
      sepayWebhookSecret: 'webhook-secret-friend2',
    },
  });

  it('loads arbitrary N hosts normalized by lowercase email from JSON object', () => {
    const configs = buildHostPaymentConfigs({
      HOST_PAYMENT_CONFIGS_JSON: multiHostJson,
    });

    expect(Object.keys(configs)).toHaveLength(3);
    expect(configs[PRIMARY_HOST_EMAIL]?.bankCode).toBe('MBBank');
    expect(configs['friend1@gmail.com']?.accountNumber).toBe('9988776655');
    expect(configs['friend2@gmail.com']?.bankCode).toBe('TCB');
  });

  it('also supports JSON array format for N hosts', () => {
    const arrayJson = JSON.stringify([
      {
        email: 'HOSTA@Example.com',
        bankCode: 'ACB',
        accountNumber: '10001',
        accountName: 'HOST A',
        sepayWebhookSecret: 'sec-a',
      },
      {
        email: 'hostb@example.com',
        bankCode: 'BIDV',
        accountNumber: '20002',
        accountName: 'HOST B',
        sepayWebhookSecret: 'sec-b',
      },
    ]);

    const configs = buildHostPaymentConfigs({
      HOST_PAYMENT_CONFIGS_JSON: arrayJson,
    });
    expect(configs['hosta@example.com']?.bankCode).toBe('ACB');
    expect(configs['hostb@example.com']?.bankCode).toBe('BIDV');
  });

  it('maintains backward compatibility with legacy SEPAY_* env vars for primary host', () => {
    const configs = buildHostPaymentConfigs({
      SEPAY_BANK_NAME: 'MBBank',
      SEPAY_BANK_ACCOUNT: '8846470573',
      SEPAY_ACCOUNT_NAME: 'PHAM DUC HIEU',
      SEPAY_WEBHOOK_API_KEY: 'legacy-secret',
      PAYMENT_CODE_PREFIX: 'KEO',
    });

    expect(configs[PRIMARY_HOST_EMAIL]).toMatchObject({
      email: PRIMARY_HOST_EMAIL,
      bankCode: 'MBBank',
      accountNumber: '8846470573',
      accountName: 'PHAM DUC HIEU',
      sepayWebhookSecret: 'legacy-secret',
      transferPrefix: 'KEO',
    });
  });

  it('routes to exact host config when registered and falls back to primary host otherwise', () => {
    const env = { HOST_PAYMENT_CONFIGS_JSON: multiHostJson };

    const friend1 = resolveHostPaymentConfig('FRIEND1@GMAIL.COM', env);
    expect(friend1.isConfigured).toBe(true);
    expect(friend1.isFallback).toBe(false);
    expect(friend1.config?.accountNumber).toBe('9988776655');

    const unknown = resolveHostPaymentConfig('unregistered@gmail.com', env);
    expect(unknown.isConfigured).toBe(false);
    expect(unknown.isFallback).toBe(true);
    expect(unknown.config?.email).toBe(PRIMARY_HOST_EMAIL);
  });

  it('returns null config in strict fallback mode for unregistered emails', () => {
    const env = {
      HOST_PAYMENT_CONFIGS_JSON: multiHostJson,
      HOST_PAYMENT_FALLBACK_MODE: 'strict',
    };

    const unknown = resolveHostPaymentConfig('unregistered@gmail.com', env);
    expect(unknown.isConfigured).toBe(false);
    expect(unknown.isFallback).toBe(false);
    expect(unknown.config).toBeNull();
  });

  it('strips server-only secrets when creating public client payment details', () => {
    const configs = buildHostPaymentConfigs({
      HOST_PAYMENT_CONFIGS_JSON: multiHostJson,
    });
    const publicInfo = toPublicHostPaymentDetails(configs['friend1@gmail.com'], false);

    expect(publicInfo).toEqual({
      bankCode: 'VCB',
      accountNumber: '9988776655',
      accountName: 'NGUYEN VAN B',
      transferPrefix: 'FR1',
      isFallback: false,
    });
    expect(publicInfo).not.toHaveProperty('sepayApiToken');
    expect(publicInfo).not.toHaveProperty('sepayWebhookSecret');
  });

  it('formats transfer content with optional per-host prefix while preserving KEO code', () => {
    expect(formatHostTransferContent('KEO7X9A2B', 'PDH')).toBe('PDH KEO7X9A2B');
    expect(formatHostTransferContent('KEO7X9A2B', 'KEO')).toBe('KEO7X9A2B');
    expect(formatHostTransferContent('KEO7X9A2B', undefined)).toBe('KEO7X9A2B');
  });

  it('authenticates incoming SePay webhook Apikey against the exact matching host', () => {
    const configs = buildHostPaymentConfigs({
      HOST_PAYMENT_CONFIGS_JSON: multiHostJson,
    });

    const matched = findHostsByWebhookApiKey(
      'Apikey webhook-secret-friend1',
      configs
    );
    expect(matched).toHaveLength(1);
    expect(matched[0].email).toBe('friend1@gmail.com');

    expect(
      hostMatchesAccount(matched[0], '9988-7766-55', undefined)
    ).toBe(true);
    expect(
      hostMatchesAccount(matched[0], '0123456789', undefined)
    ).toBe(false);

    expect(findHostsByWebhookApiKey('Apikey invalid-secret', configs)).toHaveLength(0);
  });
});
