# Manual Setup & Deployment Guide (MatchMate)

All application code, SQL migrations, tests, and PWA/OG assets are built and verified. Below are **only** the manual steps you need to complete with your live Supabase, Cloudflare Turnstile, SePay, and Vercel accounts.

---

## 1. Supabase Project Setup
1. Create a new Supabase project in the region closest to Vietnam (e.g., **Singapore `ap-southeast-1`**).
2. **Disable Public Sign-ups (Mandatory):**
   - Go to **Authentication → Providers → Email** → turn **OFF** *Enable Email Signup* (or *Allow new users to sign up*).
3. **Enable `pg_cron` (Mandatory before `005`):**
   - Go to **Database → Extensions** → search `pg_cron` → click **Enable**.
4. **Backup / PITR Note:**
   - Supabase Free Tier includes daily snapshots only (no Point-in-Time Recovery) and **auto-pauses after ~7 days of inactivity**. Upgrade to Pro for PITR, or set up the Vercel Cron keep-alive in Step 5 below.

---

## 2. Run Database Migrations & SQL Acceptance Tests
Open **Supabase Dashboard → SQL Editor** and run the migration files **in exact order**:
1. `supabase/migrations/001_schema.sql`
2. `supabase/migrations/002_rls_and_grants.sql`
3. `supabase/migrations/003_booking_and_payment_rpcs.sql`
4. `supabase/migrations/004_cancel_and_host_rpcs.sql`
5. `supabase/migrations/005_read_rpcs_and_cron.sql`

Next, run the full SQL acceptance suite (wrapped in `BEGIN; ... ROLLBACK;` so no test data persists):
- Paste and run `supabase/tests/acceptance_tests.sql` → confirm `NOTICE: ALL ACCEPTANCE SQL TESTS PASSED`.

> **Realtime `host_id` Check (Spec Section 5):**
> Confirm `matches` Realtime WAL payloads do not expose `host_id` to `anon` clients when testing `/keo/[short_code]` in DevTools Network → WS frames. If your Supabase project includes `host_id` in Realtime `postgres_changes` payloads, remove `matches` from `supabase_realtime` and rely on the built-in 15s polling or a Broadcast trigger.

---

## 3. Provision Your First Host User
On your local machine (with `.env.local` containing `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`), run:

```powershell
$env:HOST_EMAIL="you@example.com"
$env:HOST_PASSWORD="YourStrongPassword123!"
pnpm.cmd provision:host
```

*(Never commit `.env.local` — `.gitignore` excludes `.env*`.)*

---

## 4. Cloudflare Turnstile & SePay Setup
1. **Cloudflare Turnstile:**
   - Create a Turnstile widget in Cloudflare Dashboard (**Managed** mode) for your production domain (`your-app.vercel.app`) and `localhost` if testing locally.
   - Copy **Site Key** → `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and **Secret Key** → `TURNSTILE_SECRET_KEY`.
2. **SePay (`[NV]` Verification & Webhook):**
   - Verify current SePay documentation at `https://sepay.vn/tai-lieu` (QR URL `https://qr.sepay.vn/img?acc=...&bank=...&amount=...&des=...`, `Authorization: Apikey <key>`, payload fields `id`, `accountNumber`, `transferType`, `transferAmount`, `content`).
   - In **my.sepay.vn → Webhooks**:
     - URL: `https://<your-domain>/api/sepay/webhook`
     - Auth type: **API Key** → paste a strong random secret matching `SEPAY_WEBHOOK_API_KEY`.
     - Trigger on: **Money In (`in`)** for your bank account (`SEPAY_BANK_ACCOUNT`).
     - Optionally restrict/allowlist SePay's documented webhook source IPs in Vercel Firewall.

---

## 5. Deploy to Vercel & Configure Cron + WAF
1. Push this repo to GitHub and import into **Vercel**.
2. Set all 10 environment variables from `.env.example` in **Vercel → Project Settings → Environment Variables** (`NEXT_PUBLIC_SITE_URL` = `https://your-domain.vercel.app`, `PAYMENT_CODE_PREFIX` = `KEO`).
3. **Keep-Alive Cron (prevents Supabase Free Tier 7-day auto-pause):**
   - Add a `vercel.json` cron (or external uptime monitor like BetterStack / UptimeRobot) hitting `GET https://your-domain.vercel.app/api/health` once every 1–3 days (e.g., `0 9 * * *`). Verify it returns `200 {"ok":true,"db":"ok"}`.
4. **Vercel Firewall WAF Rate Limit:**
   - In **Vercel → Security → Firewall**, add a rate-limit rule on `POST /api/book`: **10 requests / 1 minute per IP**.
5. **Post-Deploy Live Concurrency & OG Verification:**
   - Run `scripts/concurrency_test.ts` against a test match with 1 remaining slot (Criteria #6 & #7):
     ```powershell
     $env:SITE_URL="https://your-domain.vercel.app"
     $env:MATCH_ID="<uuid>"
     $env:TURNSTILE_TOKEN="<valid-or-test-token>"
     pnpm.cmd tsx scripts/concurrency_test.ts
     ```
   - Request `/keo/<short_code>/opengraph-image` twice within 60s and confirm `x-vercel-cache: HIT` on the 2nd response (Criterion #16).
