import type { Locale } from './i18n/LocaleProvider';

export function formatVnd(amount: number, locale: Locale = 'vi'): string {
  const formatted = new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'vi-VN').format(
    amount
  );
  return `${formatted}đ`;
}

export function formatMatchDateTime(iso: string, locale: Locale = 'vi'): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

const LEADING_TIME_RANGE_REGEX =
  /^(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})(?:\s*[·•|,]\s*|\s+|$)([\s\S]*)$/;

function padTime(time: string): string {
  const [h, m] = time.split(':');
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
}

export function extractMatchTimeRange(notes?: string | null): {
  startTime: string;
  endTime: string;
  cleanNotes: string;
} | null {
  if (!notes) return null;
  const trimmed = notes.trim();
  const match = trimmed.match(LEADING_TIME_RANGE_REGEX);
  if (!match) return null;

  const startTime = padTime(match[1]);
  const endTime = padTime(match[2]);
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  if (sh > 23 || sm > 59 || eh > 23 || em > 59) return null;

  return {
    startTime,
    endTime,
    cleanNotes: (match[3] ?? '').trim(),
  };
}

export function stripTimeRangeFromNotes(notes?: string | null): string | null {
  if (!notes) return null;
  const parsed = extractMatchTimeRange(notes);
  if (parsed) {
    return parsed.cleanNotes || null;
  }
  const trimmed = notes.trim();
  return trimmed || null;
}

export function composeNotesWithTimeRange(
  startTime: string,
  endTime: string,
  rawNotes: string
): string {
  const clean = stripTimeRangeFromNotes(rawNotes) ?? '';
  const range = `${padTime(startTime)} - ${padTime(endTime)}`;
  return clean ? `${range} · ${clean}` : range;
}

export function formatMatchDateTimeRange(
  startsAtIso: string,
  notes?: string | null,
  locale: Locale = 'vi'
): string {
  const date = new Date(startsAtIso);
  if (Number.isNaN(date.getTime())) return startsAtIso;

  const parsed = extractMatchTimeRange(notes);
  if (!parsed) {
    return formatMatchDateTime(startsAtIso, locale);
  }

  const startTime = formatShortTime(startsAtIso, locale);
  const datePart = new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  }).format(date);

  return locale === 'en'
    ? `${datePart}, ${startTime} – ${parsed.endTime}`
    : `${startTime} – ${parsed.endTime}, ${datePart}`;
}

export function formatShortTime(iso: string, locale: Locale = 'vi'): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}
