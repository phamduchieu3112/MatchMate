<div align="center">

# ⚡ MatchMate

🌐 **English** | [Tiếng Việt](./README.vi.md)

[![Next.js](https://img.shields.io/badge/Next.js-15-000000?style=flat-square&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20RLS-3ECF8E?style=flat-square&logo=supabase&logoColor=white)](https://supabase.com/)
[![VietQR](https://img.shields.io/badge/Payments-SePay%20VietQR-B4F000?style=flat-square)](https://sepay.vn/)
[![Version](https://img.shields.io/badge/Version-1.0.0-2563EB?style=flat-square)](https://github.com/phamduchieu3112/MatchMate)
[![License](https://img.shields.io/badge/License-MIT-64748B?style=flat-square)](#license)

</div>

> Sports court booking and VietQR payment reconciliation web app built with Next.js 15, Supabase PostgreSQL, Cloudflare Turnstile, and SePay webhooks.

---

## 📌 Overview

| Field | Details |
| :--- | :--- |
| **Application** | **MatchMate** `v1.0.0` |
| **Frontend** | Next.js `15.5` (App Router) · React `19` · Tailwind CSS `3.4` · `next-themes` · `lucide-react` |
| **Database & Auth** | Supabase PostgreSQL · Row Level Security (RLS) · Atomic RPCs · `pg_cron` hold-expiry & waitlist promotion |
| **Payments** | VietQR (`qr.sepay.vn`) · SePay inbound webhook reconciliation · Refund tracking |
| **Security** | Cloudflare Turnstile · `HttpOnly` booking cookies · Timing-safe `Apikey` webhook check · Strict CSP headers |
| **Localization & Theme** | Bilingual `VI` / `EN` switcher · `Light` / `Dark` / `System` modes (`Athletic Ticket` UI) |
| **Deployment** | Vercel + Supabase (see [Manual Setup & Deploy](./MANUAL_SETUP_AND_DEPLOY.md)) |
| **License** | `MIT` |

---

## ✨ Key Features

- **Book Without an Account:** Players open a 6-character session code or link, inspect open spots in real time, choose `1–4` slots, and reserve with a 4-digit self-cancel PIN.
- **Digital Booking Pass & VietQR:** Each booking gets a countdown timer, a white-framed VietQR code (`KEO...` transfer code), live 4-second status updates, and self-cancellation rules before cutoff.
- **Waitlist & Atomic Concurrency:** Database-level locking prevents overselling slots; expired holds release spots and promote waitlisted players via `pg_cron`.
- **Organizer Admin Panel (`/host`):**
  - **Roster:** Search/filter players, manual additions, cash payment marking, waitlist promotion, and check-in switches.
  - **Payments:** Match SePay transactions and manually assign unmatched transfers.
  - **Refunds:** Track overpayment, cancellation, and late-transfer refunds with 48h stale alerts and approve/reject review flows.
  - **Summary & Split:** Copy-ready Zalo session summary and court + shuttlecock cost-split calculator.
- **PWA & Social Cards:** Installable web manifest, service worker static caching, and dynamic `opengraph-image` cards for every session link.

---

## 🏗️ Project Structure

```text
MatchMate/
├── public/
│   ├── icons/                 # PWA icons (192x192, 512x512)
│   ├── manifest.json          # Web app manifest
│   └── sw.js                  # Service worker for static assets
├── scripts/
│   ├── concurrency_test.ts    # Parallel booking race-condition verification script
│   └── provision_host.ts      # CLI script to provision single-tenant organizer account
├── supabase/
│   ├── migrations/            # Ordered SQL migrations (001_schema -> 005_read_rpcs_and_cron)
│   └── tests/                 # SQL acceptance tests (acceptance_tests.sql)
├── tests/
│   └── validation.test.ts     # Vitest unit tests (SePay, phone, refund math, map URL)
├── MANUAL_SETUP_AND_DEPLOY.md # Step-by-step production deployment guide
└── src/
    ├── middleware.ts          # Booking cookie exchange (?t=) & Supabase SSR session refresh
    ├── app/
    │   ├── page.tsx           # Homepage (session lookup by code/link & recent bookings)
    │   ├── keo/[short_code]/  # Public session ticket page & dynamic Open Graph image
    │   ├── dang-ky/[id]/      # Digital booking pass & VietQR payment tracker
    │   ├── host/              # Organizer sign-in, Admin panel, create session & detail tabs
    │   └── api/               # Booking, registration, SePay webhook, health & organizer APIs
    ├── components/
    │   ├── AppHeader.tsx      # Sticky header with VI/EN toggle & Light/Dark/System switcher
    │   ├── MatchMateLogo.tsx  # Reusable SVG brand mark & wordmark
    │   ├── player/            # MatchClient, BookingSheet, RegistrationTracker, TurnstileWidget
    │   └── host/              # HostDashboardClient, CreateMatchForm, MatchDetailTabs
    └── lib/
        ├── i18n/              # LocaleProvider, vi.ts, en.ts & enum translation helpers
        ├── supabase/          # Browser, SSR server & admin service-role clients
        ├── sepay.ts           # VietQR URL builder & payment helpers
        └── validation.ts      # Phone normalization, map URL allowlist & webhook verification
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js `20+`** and **`pnpm`**
- A **Supabase** project with `pg_cron` enabled
- **Cloudflare Turnstile** widget keys and a **SePay** account (optional for local UI testing)

### Setup & Run Locally

```powershell
# 1. Install dependencies
pnpm install

# 2. Copy environment template and fill in your credentials
Copy-Item .env.example .env.local

# 3. Run SQL migrations 001 -> 005 in Supabase SQL Editor, then provision your organizer account
$env:HOST_EMAIL="you@example.com"
$env:HOST_PASSWORD="StrongPassword123!"
pnpm exec tsx --env-file=.env.local scripts/provision_host.ts

# 4. Start the development server
pnpm dev
```

### Build, Lint & Test

```powershell
pnpm exec tsc --noEmit
pnpm lint
pnpm test
pnpm build
```

For full production deployment instructions (Supabase, Turnstile, SePay webhooks, Vercel WAF & uptime keep-alive), see [MANUAL_SETUP_AND_DEPLOY.md](./MANUAL_SETUP_AND_DEPLOY.md).

---

## ⚙️ Environment Variables

| Variable | Purpose |
| :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase public anonymous key (RLS-scoped) |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only Supabase service-role key (never exposed to browser) |
| `SEPAY_WEBHOOK_API_KEY` | Shared secret verified against `Authorization: Apikey <key>` on `/api/sepay/webhook` |
| `SEPAY_BANK_ACCOUNT` | Receiving bank account number for VietQR and webhook account validation |
| `SEPAY_BANK_NAME` | Bank identifier used to generate `qr.sepay.vn` QR URLs (e.g. `MBBank`) |
| `PAYMENT_CODE_PREFIX` | Transfer code prefix for payment matching (default: `KEO`) |
| `NEXT_PUBLIC_SITE_URL` | Canonical deployment URL used for links and Open Graph metadata |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Public Cloudflare Turnstile widget site key |
| `TURNSTILE_SECRET_KEY` | Server-side Cloudflare Turnstile verification secret |

---

## 🔌 API Endpoints

| Method & Endpoint | Description |
| :--- | :--- |
| `GET /api/health` | Application and database health check (`{"ok":true,"db":"ok"}`) |
| `POST /api/book` | Reserve slots or join waitlist (Turnstile + `Idempotency-Key` + rate limits) |
| `GET /api/registration/[id]` | Fetch player booking pass, countdown, VietQR URL, and refunds |
| `POST /api/registration/[id]/refund-account` | Save player bank account for refunds |
| `POST /api/registration/[id]/cancel` | Self-cancel registration verified by 4-digit PIN |
| `POST /api/sepay/webhook` | Process inbound SePay bank transfers and auto-confirm bookings |
| `POST /api/host/login` · `POST /api/host/logout` | Organizer authentication endpoints |
| `POST /api/host/matches` · `POST /api/host/matches/[id]/*` | Create, clone (`+7d`), lock, cancel, update costs, or manually add players |
| `POST /api/host/registrations/[id]/*` | Check-in toggle, mark cash paid, promote waitlist, or remove player |
| `POST /api/host/payments/[id]/assign` | Manually assign an unmatched bank transfer to a booking |
| `POST /api/host/refunds/[id]/review` · `done` | Approve/reject late-cancel reviews or mark refunds completed |

---

## 🛡️ Security & Privacy

- Database access is enforced via **Supabase RLS** and `SECURITY DEFINER` RPCs; public clients never receive player phone numbers or `host_id`.
- Player booking sessions use `HttpOnly`, `Secure`, `SameSite=Lax` cookies (`kt_<id>`) exchanged via middleware so secret tokens are stripped from URLs.
- SePay webhook requests validate `Authorization: Apikey` using constant-time comparison (`crypto.timingSafeEqual`).
- Security headers (`HSTS`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, strict `CSP`, and `no-referrer` on `/dang-ky/*`) are configured in `next.config.ts`.
- All `.env*` files (except `.env.example`) are ignored by `.gitignore`.

---

## 🔗 Author & Links

| Info | Details |
| :--- | :--- |
| **Author** | Phạm Đức Hiếu (`pdhieuuu`) |
| **Website** | [phamduchieu.site](https://phamduchieu.site/) |
| **Repository** | [github.com/phamduchieu3112/MatchMate](https://github.com/phamduchieu3112/MatchMate) |
| **Email** | [phamduchieu.robotics@gmail.com](mailto:phamduchieu.robotics@gmail.com) |
| **Discord** | `pdhieuuu` |

[![Website](https://img.shields.io/badge/Website-phamduchieu.site-4F46E5?style=flat-square&logo=googlechrome&logoColor=white)](https://phamduchieu.site/)<br>
[![Email](https://img.shields.io/badge/Email-phamduchieu.robotics%40gmail.com-D14836?style=flat-square&logo=gmail&logoColor=white)](mailto:phamduchieu.robotics@gmail.com)<br>
[![Discord](https://img.shields.io/badge/Discord-pdhieuuu-5865F2?style=flat-square&logo=discord&logoColor=white)](#)

---

## License

Licensed under the **MIT** License.
