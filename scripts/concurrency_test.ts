import crypto from 'node:crypto';

/**
 * Concurrency & Idempotency Acceptance Test (Criteria #6 & #7)
 * Usage against a live staging environment (with a Cloudflare Turnstile test key):
 *   SITE_URL=http://localhost:3000 MATCH_ID=<uuid> TURNSTILE_TOKEN=XXXX.DUMMY.TOKEN.XXXX pnpm tsx scripts/concurrency_test.ts
 */
async function main() {
  const siteUrl = process.env.SITE_URL ?? 'http://localhost:3000';
  const matchId = process.env.MATCH_ID;
  const turnstileToken = process.env.TURNSTILE_TOKEN;

  if (!matchId || !turnstileToken) {
    console.error('Set MATCH_ID and TURNSTILE_TOKEN environment variables.');
    process.exit(1);
  }

  // Test #6: 5 concurrent POST /api/book requests against a match with 1 remaining slot
  const requests = Array.from({ length: 5 }, (_, idx) => {
    const phone = `091111110${idx}`;
    return fetch(`${siteUrl}/api/book`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': crypto.randomUUID(),
      },
      body: JSON.stringify({
        matchId,
        name: `Concurrent ${idx}`,
        contact: phone,
        slots: 1,
        pin: '1234',
        turnstileToken,
      }),
    }).then(async (r) => ({ status: r.status, body: await r.json() }));
  });

  const results = await Promise.all(requests);
  const statuses = results.map((r) => (r.body as { status?: string }).status);
  const pendingCount = statuses.filter((s) => s === 'pending_payment').length;
  const waitlistedCount = statuses.filter((s) => s === 'waitlisted').length;
  console.log('Concurrency test results:', { pendingCount, waitlistedCount, statuses });

  // Test #7: Double-click with same Idempotency-Key
  const sharedKey = crypto.randomUUID();
  const payload = JSON.stringify({
    matchId,
    name: 'Idem Player',
    contact: '0922222200',
    slots: 1,
    pin: '1234',
    turnstileToken,
  });

  const [r1, r2] = await Promise.all([
    fetch(`${siteUrl}/api/book`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': sharedKey },
      body: payload,
    }).then((r) => r.json()),
    fetch(`${siteUrl}/api/book`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Idempotency-Key': sharedKey },
      body: payload,
    }).then((r) => r.json()),
  ]);

  console.log('Idempotency test:', {
    firstId: (r1 as { registration_id?: string }).registration_id,
    secondId: (r2 as { registration_id?: string }).registration_id,
  });
}

main();
