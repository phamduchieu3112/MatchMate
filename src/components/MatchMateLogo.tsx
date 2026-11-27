import React from 'react';

interface MatchMateLogoProps {
  variant?: 'icon' | 'full';
  size?: 'sm' | 'md' | 'lg';
  badge?: string;
  className?: string;
}

const SIZE_MAP = {
  sm: { icon: 32, text: 'text-base', gap: 'gap-2', badge: 'text-[10px] px-1.5 py-0.5' },
  md: { icon: 38, text: 'text-xl', gap: 'gap-2.5', badge: 'text-[11px] px-2 py-0.5' },
  lg: { icon: 48, text: 'text-2xl sm:text-3xl', gap: 'gap-3', badge: 'text-xs px-2 py-0.5' },
} as const;

export function MatchMateLogo({
  variant = 'full',
  size = 'md',
  badge,
  className = '',
}: MatchMateLogoProps) {
  const dims = SIZE_MAP[size];

  return (
    <span className={`inline-flex items-center ${dims.gap} ${className}`}>
      <svg
        width={dims.icon}
        height={dims.icon}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0 drop-shadow-sm"
      >
        {/* Rounded squircle obsidian base with crisp border */}
        <rect
          x="1.25"
          y="1.25"
          width="37.5"
          height="37.5"
          rx="10"
          fill="#141417"
          stroke="#B4F000"
          strokeOpacity="0.35"
          strokeWidth="1.5"
        />

        {/* Subtle sports court boundary & center net line */}
        <rect
          x="5.5"
          y="5.5"
          width="29"
          height="29"
          rx="6"
          stroke="#B4F000"
          strokeOpacity="0.2"
          strokeWidth="1"
        />
        <line
          x1="20"
          y1="5.5"
          x2="20"
          y2="34.5"
          stroke="#B4F000"
          strokeOpacity="0.16"
          strokeWidth="1"
          strokeDasharray="2 2"
        />

        {/* Intersecting court lines forming geometric M */}
        <path
          d="M10.5 30V12L20 23L29.5 12V30"
          stroke="#B4F000"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Crisp diagonal court highlight stroke */}
        <path
          d="M11.5 13L20 22.8L28.5 13"
          stroke="#FFFFFF"
          strokeOpacity="0.88"
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* 4-point athletic energy spark in upper apex */}
        <path
          d="M20 7.5L21.2 10.6L24.3 11.8L21.2 13L20 16.1L18.8 13L15.7 11.8L18.8 10.6L20 7.5Z"
          fill="#D9FF33"
        />
      </svg>

      {variant === 'full' && (
        <span className="inline-flex items-center gap-2">
          <span
            className={`font-extrabold tracking-tight leading-none ${dims.text}`}
          >
            <span className="text-zinc-950 dark:text-white">Match</span>
            <span className="text-zinc-700 dark:text-volt">Mate</span>
          </span>
          {badge && (
            <span
              className={`rounded-md bg-zinc-950 font-bold uppercase tracking-wider text-volt dark:bg-volt dark:text-zinc-950 ${dims.badge}`}
            >
              {badge}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
