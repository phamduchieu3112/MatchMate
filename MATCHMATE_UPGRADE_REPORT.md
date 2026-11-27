# MatchMate Upgrade Report

## 1. Deployment Status
- **Branch:** `main`
- **Feature Commit SHA:** `f4adf8663440567c71e50039c258889010438f5f` (`feat: add public match feed, mini scoreboard, split bill, host webhooks, and poster exports`)
- **Report Commit:** Added on `main` immediately following `f4adf86` and pushed to `origin` (`https://github.com/phamduchieu3112/MatchMate.git`).
- **Vercel Auto-Deploy:** Triggered automatically by pushing to `origin/main`. *(Note: `gh` and `vercel` CLIs are not installed in the local environment, so live Vercel build/preview URLs must be confirmed in the Vercel Dashboard.)*

---

## 2. Implemented Features & File Map

### Database Schema & Migrations
- **`supabase/migrations/009_matchmate_v4_upgrade.sql`** (New, idempotent):
  - Extends `public.matches` with `extras_fee_total` and `shuttle_count` columns + `authenticated` column grants.
  - Creates `public.match_games` (public `SELECT`, host `ALL` RLS) for on-court singles/doubles games, set scores, and winners.
  - Creates `public.match_settlements` (host-only RLS) for per-player post-match deposit reconciliation (`deficit`, `surplus`, `settled`) and `BU[A-Z0-9]{6}` top-up payment references.
  - Creates `public.club_wallet_ledger` (host-only RLS) for carrying forward player overpayments/surpluses.
  - Creates `public.host_notification_settings` (host-only RLS) for Telegram, Discord, and Zalo webhook configuration + event toggles.

### Module 1: Home Discovery & Calendar Integration
- **`src/app/page.tsx`** (Modified): Converted to a Server Component (`revalidate = 30`) fetching upcoming `open`/`locked` sessions and passing them to `HomeDiscoveryClient`.
- **`src/components/player/HomeDiscoveryClient.tsx`** (New):
  - Live public discovery feed rendered as dark-volt sports ticket cards linking directly to `/keo/[short_code]`, with a compact 6-character **Quick Join** bar preserved at the top.
  - Filters for **Sport** (All / Cầu lông / Pickleball / dynamic sports), **Skill Level**, and **Open Slots Only** (`spots_left > 0`).
  - Toggle between **Feed View** (`Danh sách`) and **Weekly Calendar View** (`Lịch tuần`, Mon–Sun in `Asia/Ho_Chi_Minh`) with week navigation and highlighted active days.
- **`src/lib/calendar.ts`** (New): Generates RFC 5545 `.ics` files (with exact start/end times, venue, Google Maps URL, and **3 `VALARM` reminders** at `-P1D`, `-PT12H`, `-PT1H`) and pre-filled Google Calendar deep links.
- **`src/components/player/RegistrationTracker.tsx`** (Modified): Added the 1-tap **"Thêm vào Lịch nhắc nhở"** card (`Tải lịch (.ics)` + `Google Calendar`) on confirmed passes (`/dang-ky/[id]`).

### Module 2: On-Court Mini Scoreboard & Match Recap
- **`src/lib/scoreboard.ts`** (New) & **`src/lib/scoreboard-auth.ts`** (New): Roster expansion (including comma-separated group bookings), strict non-duplicate player validation for Singles (`1v1`) and Doubles (`2v2`), set score validation, winner determination, leaderboard calculation (GP, W-L, Win%, `+/-`), and MVP selection.
- **`src/app/api/matches/[id]/games/route.ts`** & **`src/app/api/matches/[id]/games/[gameId]/route.ts`** (New): `GET`, `POST`, `PATCH`, `DELETE` endpoints protected by `verifyHostOrigin`, atomic rate limiting, confirmed-roster validation, and host or confirmed-player `kt_<regId>` cookie authorization.
- **`src/components/shared/MiniScoreboardTab.tsx`** (New): Mobile-first touch scoring UI (`+1`/`-1`, multi-set, **"Kết thúc trận"**), strict non-duplicate player dropdowns, live leaderboard + MVP banner, and **"Tạo Thẻ Tổng Kết"** PNG card modal.
- **`src/lib/canvas-exports.ts`** (New): Client-side HTML5 Canvas 2D renderer generating dark-volt 1080×1350 PNG **Match Recap Cards** and **Roster Posters** with `qrcode`.
- **`src/components/player/MatchClient.tsx`** & **`src/components/host/MatchDetailTabs.tsx`** (Modified): Integrated the **"Tỉ số / Bảng đấu"** tab for both players and hosts.

### Module 3: Host Operations, Split Bill & Marketing Assets
- **`src/lib/split-bill.ts`** (New): Calculates rounded VND per-slot actual cost (`court + shuttle + extras`), per-player `net_balance = actual_share - deposit_paid`, and aggregates Club Wallet ledger balances.
- **`src/app/api/host/matches/[id]/settlement/route.ts`**, **`.../settlement/[settlementId]/action/route.ts`**, **`src/app/api/host/wallet/adjust/route.ts`** (New): Persist finalized costs, generate `BU[A-Z0-9]{6}` SePay VietQR top-up QR payloads for deficits, toggle Paid/Unpaid, idempotently credit surpluses to `club_wallet_ledger`, and adjust/deduct wallet balances.
- **`src/app/api/sepay/webhook/route.ts`** (Modified): Reconciles incoming `BU[A-Z0-9]{6}` post-match top-up transfers in `match_settlements` and dispatches real-time host payment notifications.
- **`src/lib/notifications.ts`** (New): Server-only adapter pattern (`TelegramAdapter`, `DiscordAdapter`, `ZaloWebhookAdapter`) with SSRF-safe HTTPS URL/token validation, 3.5s timeouts, and fail-safe `Promise.allSettled` dispatch.
- **`src/app/api/host/notifications/settings/route.ts`** & **`.../test/route.ts`** (New): Manage masked notification settings and send live test alerts.
- **`src/app/api/book/route.ts`**, **`src/app/api/registration/[id]/cancel/route.ts`**, **`src/app/api/registration/[id]/refund-account/route.ts`** (Modified): Trigger fail-safe host notifications on new bookings, late cancellations, and refund requests.
- **`src/components/host/SplitBillPanel.tsx`**, **`src/components/host/RosterPosterModal.tsx`**, **`src/components/host/NotificationSettingsModal.tsx`** (New) wired into **`src/components/host/MatchDetailTabs.tsx`**, **`src/components/host/HostDashboardClient.tsx`**, and **`src/app/host/matches/[id]/page.tsx`** (Modified).
- **`src/lib/types.ts`**, **`src/lib/i18n/dictionaries/vi.ts`**, **`src/lib/i18n/dictionaries/en.ts`** (Modified): Added TypeScript types and full Vietnamese/English translations.

---

## 3. Self-Review & Verification Log
All static, unit test, and production build checks ran after the final code edit and passed with exit code `0`:
- **Typecheck (`cmd /c pnpm exec tsc --noEmit`):** Passed (`0` errors).
- **Linter (`cmd /c pnpm lint` / `eslint .`):** Passed (`0` errors/warnings).
- **Unit Tests (`cmd /c pnpm test` / `vitest run`):** Passed — **7 test files, 34 tests passed**:
  - `tests/calendar.test.ts` (3 tests: `.ics` format, 3 `VALARM` triggers `-P1D`/`-PT12H`/`-PT1H`, Google Calendar URL, end-time parsing)
  - `tests/scoreboard.test.ts` (3 tests: group expansion, duplicate player prevention in 1v1/2v2, winner & MVP calculation)
  - `tests/split-bill.test.ts` (2 tests: VND rounding, deficit/surplus reconciliation, Club Wallet aggregation)
  - `tests/notifications.test.ts` (2 tests: Telegram/Discord/SSRF URL validation, fail-safe dispatch)
  - `tests/format.test.ts` (4 tests), `tests/validation.test.ts` (12 tests), `tests/host-payment-config.test.ts` (8 tests)
- **Production Build (`cmd /c pnpm build` / `next build`):** Passed (`0` errors; all static and dynamic routes compiled cleanly).
- **Security & Hygiene Scan:** Verified no `.env*` secrets, bot tokens, or `console.log` statements exist in `src/` or tracked git files.

---

## 4. Manual Post-Deploy Actions Required (If Any)
1. **Apply SQL Migrations in Supabase SQL Editor (Required before live use):**
   - If not already applied from the security pass, run `supabase/migrations/008_security_hardening.sql`.
   - Run **`supabase/migrations/009_matchmate_v4_upgrade.sql`** in **Supabase Dashboard → SQL Editor** (creates `match_games`, `match_settlements`, `club_wallet_ledger`, `host_notification_settings`, and adds `extras_fee_total` / `shuttle_count` to `matches`).
2. **Host Notification Setup (Optional via UI or Vercel Env):**
   - Open `/host` → click **"Thông báo"** to enter your Telegram Bot Token + Chat ID, Discord Webhook URL, or Zalo Webhook URL, toggle desired events, and click **"Gửi tin thử nghiệm"**.
   - Alternatively, set optional fallback env vars in Vercel: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `DISCORD_WEBHOOK_URL`, `ZALO_WEBHOOK_URL`.

---

## 5. Known Limitations / Notes for Reviewer
- **Roster Poster QR Destination:** The scannable QR code on the shareable Roster Poster (`RosterPosterModal.tsx`) points to `/keo/[short_code]` (the public session booking page), because `/dang-ky/[id]` is a private per-player booking pass tied to an individual `kt_<id>` cookie.
- **Scoreboard Player Authorization:** Confirmed players can score games on court using their booking device (`kt_<regId>` cookie) in addition to the Host; guests without a confirmed booking cookie on that device have read-only scoreboard & leaderboard access.
- **Zalo Notification Channel:** Since Zalo Official Account (OA) requires an external OA access token/relay and varies per business account, `ZaloWebhookAdapter` posts a structured JSON payload (`{ source, event, title, message, data }`) to any configured HTTPS Zalo Webhook / bridge endpoint.
- **PNG Rendering:** Both Match Recap Cards and Roster Posters render client-side via HTML5 Canvas 2D + `qrcode` with zero external font/image network dependencies (preventing tainted-canvas CORS failures on mobile browsers).
