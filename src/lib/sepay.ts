import 'server-only';

/**
 * Builds dynamic SePay QR image URL strictly on the server.
 * SEPAY_BANK_ACCOUNT and SEPAY_BANK_NAME remain server-side secrets.
 */
export function buildSePayQrUrl(amount: number, paymentCode: string): string | null {
  const account = process.env.SEPAY_BANK_ACCOUNT?.trim();
  const bank = process.env.SEPAY_BANK_NAME?.trim();

  if (!account || !bank || amount <= 0 || !paymentCode) {
    return null;
  }

  const params = new URLSearchParams({
    acc: account,
    bank,
    amount: String(Math.trunc(amount)),
    des: paymentCode,
  });

  return `https://qr.sepay.vn/img?${params.toString()}`;
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
