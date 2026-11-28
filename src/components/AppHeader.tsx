'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';
import { Monitor, Moon, ShieldCheck, Sun } from 'lucide-react';
import { useLocale } from '@/lib/i18n/LocaleProvider';
import { MatchMateLogo } from '@/components/MatchMateLogo';

export function AppHeader() {
  const pathname = usePathname();
  const { theme, systemTheme, setTheme } = useTheme();
  const { locale, setLocale, t } = useLocale();
  const [mounted, setMounted] = useState(false);
  const isHostRoute = pathname?.startsWith('/host');

  useEffect(() => {
    setMounted(true);
  }, []);

  const cycleTheme = () => {
    if (!mounted) return;
    const current = theme ?? 'system';
    if (systemTheme === 'dark') {
      if (current === 'system') setTheme('light');
      else if (current === 'light') setTheme('dark');
      else setTheme('system');
    } else {
      if (current === 'system') setTheme('dark');
      else if (current === 'dark') setTheme('light');
      else setTheme('system');
    }
  };

  const activeTheme = mounted ? theme ?? 'system' : 'system';

  const renderThemeIcon = () => {
    if (!mounted || activeTheme === 'system') {
      return <Monitor className="h-4 w-4" />;
    }
    if (activeTheme === 'dark') {
      return <Moon className="h-4 w-4 text-volt" />;
    }
    return <Sun className="h-4 w-4 text-amber-500" />;
  };

  const themeText = !mounted
    ? t('themeSystem')
    : activeTheme === 'light'
      ? t('themeLight')
      : activeTheme === 'dark'
        ? t('themeDark')
        : t('themeSystem');

  return (
    <header className="sticky top-0 z-40 w-full max-w-full overflow-x-clip border-b border-zinc-200/80 bg-zinc-100/85 backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-950/85">
      <div className="mx-auto flex h-14 w-full max-w-4xl items-center justify-between gap-2 px-3 sm:px-4">
        <Link
          href="/"
          className="inline-flex min-w-0 shrink-0 items-center rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-volt"
          aria-label={t('appName')}
        >
          <MatchMateLogo variant="full" size="sm" />
        </Link>

        <div className="flex min-w-0 shrink-0 items-center gap-1.5 sm:gap-2">
          {!isHostRoute && (
            <Link
              href="/host"
              className="inline-flex h-9 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-zinc-900/10 bg-zinc-950 px-2.5 py-1.5 text-xs font-bold text-volt shadow-sm transition hover:opacity-90 dark:border-volt/30 dark:bg-volt/15 dark:text-volt dark:hover:bg-volt/25 sm:gap-1.5 sm:px-3"
            >
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
              <span className="sm:hidden">{t('hostLinkShort')}</span>
              <span className="hidden sm:inline">{t('hostLink')}</span>
            </Link>
          )}

          <button
            type="button"
            onClick={() => setLocale(locale === 'vi' ? 'en' : 'vi')}
            aria-label={`${t('langLabel')}: ${locale.toUpperCase()}`}
            title={`${t('langLabel')}: ${locale.toUpperCase()}`}
            className="inline-flex h-9 min-w-[2.25rem] shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white px-2.5 text-xs font-extrabold tracking-wide text-zinc-950 shadow-sm transition hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:text-volt dark:hover:border-zinc-700 sm:hidden"
          >
            {locale.toUpperCase()}
          </button>

          <div
            role="group"
            aria-label={t('langLabel')}
            className="hidden items-center rounded-full border border-zinc-200 bg-white p-0.5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 sm:inline-flex"
          >
            <button
              type="button"
              onClick={() => setLocale('vi')}
              aria-pressed={locale === 'vi'}
              className={`rounded-full px-2.5 py-1 text-xs font-bold tracking-wide transition ${
                locale === 'vi'
                  ? 'bg-volt text-zinc-950 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100'
              }`}
            >
              VI
            </button>
            <button
              type="button"
              onClick={() => setLocale('en')}
              aria-pressed={locale === 'en'}
              className={`rounded-full px-2.5 py-1 text-xs font-bold tracking-wide transition ${
                locale === 'en'
                  ? 'bg-volt text-zinc-950 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-100'
              }`}
            >
              EN
            </button>
          </div>

          <button
            type="button"
            onClick={cycleTheme}
            aria-label={`${t('themeLabel')}: ${themeText}`}
            title={`${t('themeLabel')}: ${themeText}`}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center gap-1.5 rounded-full border border-zinc-200 bg-white text-xs font-semibold text-zinc-700 shadow-sm transition hover:border-zinc-300 hover:text-zinc-950 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-zinc-700 dark:hover:text-white sm:h-9 sm:w-9 md:w-auto md:px-2.5"
          >
            {renderThemeIcon()}
            <span className="hidden md:inline">{themeText}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
