import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { ThemeProvider } from '@/components/ThemeProvider';
import { LocaleProvider } from '@/lib/i18n/LocaleProvider';
import { AppHeader } from '@/components/AppHeader';
import { SwRegister } from '@/components/SwRegister';
import './globals.css';

export const metadata: Metadata = {
  title: 'MatchMate — Đặt giữ chỗ sân thể thao',
  description:
    'Xem chỗ trống, giữ chỗ và thanh toán bằng VietQR cho cầu lông, pickleball.',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F4F4F5' },
    { media: '(prefers-color-scheme: dark)', color: '#09090B' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body className="bg-zinc-100 text-zinc-950 antialiased selection:bg-volt selection:text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
        <ThemeProvider>
          <LocaleProvider>
            <SwRegister />
            <AppHeader />
            <main className="mx-auto max-w-4xl px-4 pb-28 pt-5">{children}</main>
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
