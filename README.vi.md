<div align="center">

# ⚡ MatchMate

🌐 [English](./README.md) | **Tiếng Việt**

[![Next.js](https://img.shields.io/badge/Next.js-15-000000?style=flat-square&logo=nextdotjs&logoColor=white)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20RLS-3ECF8E?style=flat-square&logo=supabase&logoColor=white)](https://supabase.com/)
[![VietQR](https://img.shields.io/badge/Thanh%20to%C3%A1n-SePay%20VietQR-B4F000?style=flat-square)](https://sepay.vn/)
[![Version](https://img.shields.io/badge/Version-1.0.0-2563EB?style=flat-square)](https://github.com/phamduchieu3112/MatchMate)
[![License](https://img.shields.io/badge/License-MIT-64748B?style=flat-square)](#giấy-phép)

</div>

> Ứng dụng web đặt giữ chỗ sân thể thao và đối soát thanh toán VietQR xây dựng bằng Next.js 15, Supabase PostgreSQL, Cloudflare Turnstile và SePay webhook.

---

## 📌 Tổng quan

| Mục | Chi tiết |
| :--- | :--- |
| **Ứng dụng** | **MatchMate** `v1.0.0` |
| **Giao diện** | Next.js `15.5` (App Router) · React `19` · Tailwind CSS `3.4` · `next-themes` · `lucide-react` |
| **Cơ sở dữ liệu & Xác thực** | Supabase PostgreSQL · Row Level Security (RLS) · Atomic RPCs · `pg_cron` nhả chỗ hết hạn & đôn hàng chờ |
| **Thanh toán** | VietQR (`qr.sepay.vn`) · Webhook SePay ghi nhận tiền vào · Theo dõi hoàn tiền |
| **Bảo mật** | Cloudflare Turnstile · Cookie `HttpOnly` cho vé đặt · Kiểm tra `Apikey` an toàn thời gian · CSP header chặt chẽ |
| **Ngôn ngữ & Giao diện** | Chuyển đổi `VI` / `EN` · Chế độ `Sáng` / `Tối` / `Hệ thống` |
| **Triển khai** | Vercel + Supabase (xem chi tiết tại [Hướng dẫn cài đặt & deploy](./MANUAL_SETUP_AND_DEPLOY.md)) |
| **Giấy phép** | `MIT` |

---

## ✨ Tính năng nổi bật

- **Đặt chỗ không cần tài khoản:** Người chơi nhập mã buổi chơi 6 ký tự hoặc mở link từ chủ sân, xem chỗ trống theo thời gian thực, chọn `1–4` slot và đặt giữ chỗ bằng mã PIN 4 số.
- **Thẻ đặt chỗ điện tử & VietQR:** Mỗi lượt đặt có đồng hồ đếm ngược giữ chỗ, mã VietQR nền trắng rõ nét kèm mã chuyển khoản (`KEO...`), cập nhật trạng thái mỗi 4 giây và hỗ trợ tự hủy trước giờ chốt.
- **Hàng chờ & Giữ chỗ an toàn đồng thời:** Khóa dữ liệu ở mức PostgreSQL tránh đặt trùng chỗ; `pg_cron` tự nhả chỗ hết hạn và đôn người từ hàng chờ.
- **Trang quản trị dành cho chủ sân (`/host`):**
  - **Danh sách:** Tìm kiếm/lọc người chơi, thêm người thủ công, thu tiền mặt, đôn hàng chờ và bật/tắt điểm danh.
  - **Thanh toán:** Xem lịch sử giao dịch SePay và gán thủ công các khoản chuyển sai nội dung vào đúng vé.
  - **Hoàn tiền:** Theo dõi các khoản chuyển dư, hủy buổi chơi hoặc hủy sát giờ kèm cảnh báo quá 48 giờ và nút duyệt/từ chối.
  - **Tin nhắn & Tính tiền:** Sao chép nhanh danh sách gửi Zalo và công cụ chia tiền sân + tiền cầu theo số slot.
- **PWA & Ảnh chia sẻ liên kết:** Hỗ trợ cài đặt như ứng dụng trên điện thoại và tạo ảnh Open Graph riêng cho từng buổi chơi.

---

## 🏗️ Cấu trúc dự án

```text
MatchMate/
├── public/
│   ├── icons/                 # Biểu tượng PWA (192x192, 512x512)
│   ├── manifest.json          # Cấu hình Web App Manifest
│   └── sw.js                  # Service Worker lưu cache tài nguyên tĩnh
├── scripts/
│   ├── concurrency_test.ts    # Script kiểm tra tranh chấp giữ chỗ song song
│   └── provision_host.ts      # Script tạo tài khoản chủ sân (role: host)
├── supabase/
│   ├── migrations/            # 5 file SQL migration theo thứ tự (001 -> 005)
│   └── tests/                 # Bộ kiểm thử SQL (acceptance_tests.sql)
├── tests/
│   └── validation.test.ts     # Unit test Vitest (SePay, SĐT, tính hoàn tiền, link bản đồ)
├── MANUAL_SETUP_AND_DEPLOY.md # Hướng dẫn từng bước cấu hình & deploy thực tế
└── src/
    ├── middleware.ts          # Đổi token vé (?t=) sang cookie HttpOnly & làm mới phiên Supabase
    ├── app/
    │   ├── page.tsx           # Trang chủ (nhập mã/link buổi chơi & vé đặt gần đây)
    │   ├── keo/[short_code]/  # Trang buổi chơi công khai & ảnh Open Graph động
    │   ├── dang-ky/[id]/      # Thẻ đặt chỗ điện tử & màn hình thanh toán VietQR
    │   ├── host/              # Đăng nhập chủ sân, Trang quản trị, tạo buổi chơi & chi tiết
    │   └── api/               # Các API đặt chỗ, vé đăng ký, SePay webhook, health & quản trị
    ├── components/
    │   ├── AppHeader.tsx      # Thanh đầu trang với nút đổi VI/EN & Sáng/Tối/Hệ thống
    │   ├── MatchMateLogo.tsx  # Logo SVG & chữ thương hiệu MatchMate
    │   ├── player/            # MatchClient, BookingSheet, RegistrationTracker, TurnstileWidget
    │   └── host/              # HostDashboardClient, CreateMatchForm, MatchDetailTabs
    └── lib/
        ├── i18n/              # LocaleProvider, vi.ts, en.ts & helper dịch trạng thái
        ├── supabase/          # Client Supabase cho trình duyệt, SSR & service-role
        ├── sepay.ts           # Tạo link ảnh VietQR & xử lý thanh toán
        └── validation.ts      # Chuẩn hóa SĐT, kiểm tra link Google Maps & xác thực webhook
```

---

## 🚀 Cài đặt & Chạy cục bộ

### Yêu cầu trước khi chạy

- **Node.js `20+`** và **`pnpm`**
- Một project **Supabase** đã bật extension `pg_cron`
- Bộ key **Cloudflare Turnstile** và tài khoản **SePay** (có thể để key mẫu nếu chỉ xem giao diện)

### Các bước cài đặt

```powershell
# 1. Cài đặt thư viện
pnpm install

# 2. Tạo file biến môi trường và điền thông tin thật
Copy-Item .env.example .env.local

# 3. Chạy 5 file SQL migration (001 -> 005) trong Supabase SQL Editor, sau đó tạo tài khoản chủ sân
$env:HOST_EMAIL="you@example.com"
$env:HOST_PASSWORD="StrongPassword123!"
pnpm exec tsx --env-file=.env.local scripts/provision_host.ts

# 4. Khởi chạy server phát triển
pnpm dev
```

### Build, Lint & Kiểm thử

```powershell
pnpm exec tsc --noEmit
pnpm lint
pnpm test
pnpm build
```

Để xem hướng dẫn đầy đủ từ A đến Z khi đưa lên Vercel, gắn webhook SePay và giữ Supabase không ngủ, xem thêm [MANUAL_SETUP_AND_DEPLOY.md](./MANUAL_SETUP_AND_DEPLOY.md).

---

## ⚙️ Biến môi trường

| Biến môi trường | Công dụng |
| :--- | :--- |
| `NEXT_PUBLIC_SUPABASE_URL` | Đường dẫn Project URL của Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Khóa công khai `anon` của Supabase (giới hạn bởi RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | Khóa `service_role` chạy phía server (không bao giờ lộ ra trình duyệt) |
| `SEPAY_WEBHOOK_API_KEY` | Chuỗi bí mật khớp với header `Authorization: Apikey <key>` tại `/api/sepay/webhook` |
| `SEPAY_BANK_ACCOUNT` | Số tài khoản ngân hàng nhận tiền VietQR và kiểm tra webhook |
| `SEPAY_BANK_NAME` | Tên ngắn ngân hàng chuẩn `qr.sepay.vn` (ví dụ: `MBBank`) |
| `PAYMENT_CODE_PREFIX` | Tiền tố mã nội dung chuyển khoản để đối soát (mặc định: `KEO`) |
| `NEXT_PUBLIC_SITE_URL` | Tên miền chính thức dùng cho liên kết và thẻ Open Graph |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Site Key công khai của widget Cloudflare Turnstile |
| `TURNSTILE_SECRET_KEY` | Secret Key xác minh Turnstile phía server |

---

## 🔌 API Endpoints

| Phương thức & Endpoint | Mô tả |
| :--- | :--- |
| `GET /api/health` | Kiểm tra trạng thái hoạt động của web và kết nối cơ sở dữ liệu |
| `POST /api/book` | Đặt giữ chỗ hoặc vào hàng chờ (kiểm tra Turnstile, `Idempotency-Key` & giới hạn tốc độ) |
| `GET /api/registration/[id]` | Lấy thông tin vé, thời gian giữ chỗ, link ảnh VietQR và lịch sử hoàn tiền |
| `POST /api/registration/[id]/refund-account` | Lưu thông tin tài khoản ngân hàng nhận hoàn tiền |
| `POST /api/registration/[id]/cancel` | Tự hủy đăng ký bằng mã PIN 4 số |
| `POST /api/sepay/webhook` | Nhận giao dịch tiền vào từ SePay và xác nhận vé |
| `POST /api/host/login` · `POST /api/host/logout` | Đăng nhập / đăng xuất chủ sân |
| `POST /api/host/matches` · `POST /api/host/matches/[id]/*` | Tạo buổi chơi, nhân bản (+7 ngày), khóa, hủy, cập nhật chi phí hoặc thêm người thủ công |
| `POST /api/host/registrations/[id]/*` | Điểm danh, đánh dấu thu tiền mặt, đôn hàng chờ hoặc xóa người chơi |
| `POST /api/host/payments/[id]/assign` | Gán giao dịch chưa khớp mã vào một vé đặt chỗ |
| `POST /api/host/refunds/[id]/review` · `done` | Duyệt/từ chối yêu cầu hoàn tiền hoặc đánh dấu đã hoàn tất |

---

## 🛡️ Bảo mật & Quyền riêng tư

- Phân quyền dữ liệu chặt chẽ bằng **Supabase RLS** và hàm `SECURITY DEFINER`; phía trình duyệt công khai không nhận được số điện thoại người chơi hay `host_id`.
- Phiên xem vé của người chơi dùng cookie `HttpOnly`, `Secure`, `SameSite=Lax` (`kt_<id>`), được middleware đổi từ tham số `?t=` và xóa khỏi URL ngay lập tức.
- Webhook SePay kiểm tra header `Authorization: Apikey` bằng hàm so sánh an toàn thời gian (`crypto.timingSafeEqual`).
- Các header bảo mật (`HSTS`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `CSP` và `no-referrer` trên `/dang-ky/*`) được cấu hình sẵn trong `next.config.ts`.
- Toàn bộ file `.env*` (trừ `.env.example`) đều được `.gitignore` chặn đẩy lên GitHub.

---

## 🔗 Tác giả & Liên hệ

| Mục | Chi tiết |
| :--- | :--- |
| **Tác giả** | Phạm Đức Hiếu (`pdhieuuu`) |
| **Website** | [phamduchieu.site](https://phamduchieu.site/) |
| **Mã nguồn** | [github.com/phamduchieu3112/MatchMate](https://github.com/phamduchieu3112/MatchMate) |
| **Email** | [phamduchieu.robotics@gmail.com](mailto:phamduchieu.robotics@gmail.com) |
| **Discord** | `pdhieuuu` |

[![Website](https://img.shields.io/badge/Website-phamduchieu.site-4F46E5?style=flat-square&logo=googlechrome&logoColor=white)](https://phamduchieu.site/)<br>
[![Email](https://img.shields.io/badge/Email-phamduchieu.robotics%40gmail.com-D14836?style=flat-square&logo=gmail&logoColor=white)](mailto:phamduchieu.robotics@gmail.com)<br>
[![Discord](https://img.shields.io/badge/Discord-pdhieuuu-5865F2?style=flat-square&logo=discord&logoColor=white)](#)

---

## Giấy phép

Phát hành theo giấy phép **MIT**.
