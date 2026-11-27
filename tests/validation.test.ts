import { describe, expect, it } from 'vitest';
import {
  computeOverpaySurplus,
  computeRefundableAmount,
  extractPaymentCode,
  validateAndNormalizePhone,
  validateMapUrl,
  validateSePayPayload,
  verifySePayApiKey,
} from '@/lib/validation';

describe('SePay webhook timing-safe Apikey authentication', () => {
  const secret = 'super-secret-sepay-key-12345';

  it('accepts exact Apikey header', () => {
    expect(verifySePayApiKey(`Apikey ${secret}`, secret)).toBe(true);
  });

  it('rejects wrong Apikey, wrong length, missing prefix, or empty', () => {
    expect(verifySePayApiKey('Apikey wrong-key', secret)).toBe(false);
    expect(verifySePayApiKey('Apikey super-secret-sepay-key-12346', secret)).toBe(false);
    expect(verifySePayApiKey(`Bearer ${secret}`, secret)).toBe(false);
    expect(verifySePayApiKey(null, secret)).toBe(false);
    expect(verifySePayApiKey(`Apikey ${secret}`, undefined)).toBe(false);
  });
});

describe('SePay webhook payload validation', () => {
  const expectedAcc = '0123456789';

  it('accepts valid inbound transfer payload and strips NUL bytes', () => {
    const res = validateSePayPayload(
      {
        id: 92704,
        accountNumber: '0123-456-789',
        transferType: 'in',
        transferAmount: 100000,
        content: 'MBVCB\u0000 KEO7X9A2B chuyen tien',
      },
      expectedAcc
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.id).toBe('92704');
      expect(res.data.transferAmount).toBe(100000);
      expect(res.data.content).not.toContain('\u0000');
    }
  });

  it('accepts Virtual Account (VA) match via subAccount', () => {
    const res = validateSePayPayload(
      {
        id: 182963448,
        accountNumber: '8846470573',
        subAccount: '96247MATCHMATE',
        transferType: 'in',
        transferAmount: 50000,
        content: 'KEO7X9A2B',
      },
      '96247MATCHMATE'
    );
    expect(res.ok).toBe(true);
  });

  it('rejects outbound, mismatched account, non-integer/out-of-bounds amount, or malformed shape', () => {
    expect(
      validateSePayPayload(
        { id: 1, accountNumber: expectedAcc, transferType: 'out', transferAmount: 50000, content: 'x' },
        expectedAcc
      ).ok
    ).toBe(false);
    expect(
      validateSePayPayload(
        { id: 1, accountNumber: '9999999999', transferType: 'in', transferAmount: 50000, content: 'x' },
        expectedAcc
      ).ok
    ).toBe(false);
    expect(
      validateSePayPayload(
        { id: 1, accountNumber: expectedAcc, transferType: 'in', transferAmount: 0, content: 'x' },
        expectedAcc
      ).ok
    ).toBe(false);
    expect(
      validateSePayPayload(
        { id: 1, accountNumber: expectedAcc, transferType: 'in', transferAmount: 100_000_001, content: 'x' },
        expectedAcc
      ).ok
    ).toBe(false);
    expect(
      validateSePayPayload(
        { id: 1, accountNumber: expectedAcc, transferType: 'in', transferAmount: 50000.5, content: 'x' },
        expectedAcc
      ).ok
    ).toBe(false);
    expect(validateSePayPayload(null, expectedAcc).ok).toBe(false);
  });
});

describe('payment_code regex extraction', () => {
  it('extracts KEO code from plain, lowercase, spaced, and bank-prefixed strings', () => {
    expect(extractPaymentCode('KEO7X9A2B')).toBe('KEO7X9A2B');
    expect(extractPaymentCode('MBVCB.99812.keo 7x9 a2b.chuyen tien')).toBe('KEO7X9A2B');
    expect(extractPaymentCode('FT240123-VPB-KEOABC123-thanh toan')).toBe('KEOABC123');
    expect(extractPaymentCode('Chuyen tien san cau long')).toBeNull();
  });
});

describe('Contact / phone validation & normalization', () => {
  it('accepts valid 9–11 digit phone numbers and normalizes to last 9 digits', () => {
    const vn = validateAndNormalizePhone('0912 345 678');
    expect(vn.valid).toBe(true);
    expect(vn.normalizedLast9).toBe('912345678');

    const plus84 = validateAndNormalizePhone('+84 912-345-678');
    expect(plus84.valid).toBe(true);
    expect(plus84.normalizedLast9).toBe('912345678');
  });

  it('rejects Zalo usernames without valid phone numbers and out-of-range digit counts', () => {
    expect(validateAndNormalizePhone('zalo_nguyen_a').valid).toBe(false);
    expect(validateAndNormalizePhone('01234567').valid).toBe(false);
    expect(validateAndNormalizePhone('012345678901').valid).toBe(false);
  });
});

describe('Refund accounting math', () => {
  it('prevents double-refund when overpaying then cancelling', () => {
    // Paid 200k on 100k slot -> 100k overpaid refund already allocated
    const surplus = computeOverpaySurplus(200_000, 0, 100_000);
    expect(surplus).toBe(100_000);

    // Later cancelled before cutoff -> remaining refundable MUST be 100k, total 200k
    const remainingRefundable = computeRefundableAmount(200_000, surplus);
    expect(remainingRefundable).toBe(100_000);
    expect(surplus + remainingRefundable).toBe(200_000);
  });
});

describe('map_url allowlist validation', () => {
  it('allows null/empty and valid Google Maps https URLs', () => {
    expect(validateMapUrl(null)).toEqual({ valid: true, value: null });
    expect(validateMapUrl('')).toEqual({ valid: true, value: null });
    expect(validateMapUrl('https://maps.app.goo.gl/abc123').valid).toBe(true);
    expect(validateMapUrl('https://goo.gl/maps/xyz789').valid).toBe(true);
    expect(validateMapUrl('https://www.google.com/maps/place/Hanoi').valid).toBe(true);
  });

  it('rejects non-https, javascript:, and arbitrary external domains', () => {
    expect(validateMapUrl('http://maps.app.goo.gl/abc123').valid).toBe(false);
    expect(validateMapUrl('javascript:alert(1)').valid).toBe(false);
    expect(validateMapUrl('https://evil.example.com/maps').valid).toBe(false);
    expect(validateMapUrl('https://www.google.com/search?q=bad').valid).toBe(false);
  });
});
