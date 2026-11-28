'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { X } from 'lucide-react';
import { useLocale } from '@/lib/i18n/LocaleProvider';

const MESSENGER_URL = 'https://m.me/lf.pdh/';

function MessengerIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 2C6.36 2 2 6.13 2 11.7c0 2.91 1.19 5.44 3.14 7.17.16.14.26.35.27.57l.05 1.78c.02.57.61.94 1.13.71l1.98-.87c.17-.08.36-.1.55-.06.91.25 1.87.38 2.88.38 5.64 0 10-4.13 10-9.7C22 6.13 17.64 2 12 2zm5.99 7.46-2.93 4.65a1.5 1.5 0 0 1-2.17.4l-2.34-1.75a.6.6 0 0 0-.72 0l-3.15 2.39c-.42.32-.97-.18-.69-.63l2.93-4.65a1.5 1.5 0 0 1 2.17-.4l2.34 1.75a.6.6 0 0 0 .72 0l3.15-2.39c.42-.32.97.18.69.63z" />
    </svg>
  );
}

export function FloatingHelpButton() {
  const { t } = useLocale();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Lift above the sticky bottom booking CTA bar on match pages (/keo/*)
  const hasStickyBottomBar = pathname?.startsWith('/keo/') ?? false;

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={containerRef}
      className={`fixed right-4 z-40 flex flex-col items-end gap-2.5 sm:right-6 sm:gap-3 ${
        hasStickyBottomBar ? 'bottom-20' : 'bottom-4 sm:bottom-6'
      }`}
    >
      {/* Speed-dial Messenger Pop-up */}
      <div
        id="floating-help-menu"
        role="menu"
        aria-hidden={!open}
        className={`flex items-center gap-2.5 transition-all duration-200 ease-out ${
          open
            ? 'pointer-events-auto translate-y-0 scale-100 opacity-100'
            : 'pointer-events-none translate-y-3 scale-90 opacity-0'
        }`}
      >
        <a
          href={MESSENGER_URL}
          target="_blank"
          rel="noopener noreferrer"
          role="menuitem"
          tabIndex={open ? 0 : -1}
          onClick={() => setOpen(false)}
          className="group flex items-center gap-2.5 focus:outline-none"
        >
          <span className="whitespace-nowrap rounded-full border border-zinc-200 bg-white px-3.5 py-1.5 text-xs font-bold text-zinc-900 shadow-lg transition group-hover:border-zinc-300 group-hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:group-hover:border-zinc-600">
            {t('helpMessengerLabel')}
          </span>
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-tr from-[#006AFF] via-[#0099FF] to-[#A033FF] text-white shadow-lg shadow-[#006AFF]/30 ring-2 ring-white/80 transition-transform duration-150 group-hover:scale-105 group-active:scale-95 group-focus-visible:ring-2 group-focus-visible:ring-volt dark:ring-zinc-900 sm:h-12 sm:w-12">
            <MessengerIcon className="h-5 w-5 sm:h-6 sm:w-6" />
          </span>
        </a>
      </div>

      {/* Main Circular ? Floating Action Button */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-controls="floating-help-menu"
        aria-label={open ? t('helpCloseLabel') : t('helpButtonLabel')}
        title={open ? t('helpCloseLabel') : t('helpButtonLabel')}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-zinc-800/10 bg-zinc-950 text-volt opacity-90 shadow-lg shadow-zinc-950/25 transition-all duration-200 hover:scale-105 hover:opacity-100 hover:shadow-xl active:scale-95 focus:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-volt focus-visible:ring-offset-2 dark:border-volt/30 dark:bg-volt dark:text-zinc-950 dark:shadow-volt dark:hover:bg-volt-hover dark:focus-visible:ring-offset-zinc-950 sm:h-12 sm:w-12 sm:opacity-100"
      >
        <span
          className={`inline-flex items-center justify-center transition-transform duration-200 ${
            open ? 'rotate-90' : 'rotate-0'
          }`}
        >
          {open ? (
            <X className="h-4 w-4 stroke-[2.5] sm:h-5 sm:w-5" />
          ) : (
            <span className="select-none text-lg font-black leading-none sm:text-xl">?</span>
          )}
        </span>
      </button>
    </div>
  );
}
