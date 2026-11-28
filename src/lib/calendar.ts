import { extractMatchTimeRange } from '@/lib/format';

export interface CalendarMatchInput {
  uid: string;
  title: string;
  sport: string;
  startsAt: string;
  notes?: string | null;
  locationName: string;
  mapUrl?: string | null;
  shortCode: string;
  ticketCode?: string;
  pageUrl?: string;
}

/**
 * Computes the session end time using the leading HH:MM - HH:MM range in notes
 * (interpreted in Asia/Ho_Chi_Minh +07:00), or defaults to +2 hours.
 */
export function computeMatchEndTime(
  startsAtIso: string,
  notes?: string | null
): Date {
  const start = new Date(startsAtIso);
  if (Number.isNaN(start.getTime())) {
    return new Date(Date.now() + 2 * 60 * 60 * 1000);
  }

  const parsed = extractMatchTimeRange(notes);
  if (!parsed) {
    return new Date(start.getTime() + 2 * 60 * 60 * 1000);
  }

  const [sh, sm] = parsed.startTime.split(':').map(Number);
  const [eh, em] = parsed.endTime.split(':').map(Number);
  let durationMinutes = eh * 60 + em - (sh * 60 + sm);
  if (durationMinutes <= 0) {
    durationMinutes += 24 * 60;
  }
  return new Date(start.getTime() + durationMinutes * 60 * 1000);
}

function formatIcsUtc(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}` +
    `${pad(date.getUTCMonth() + 1)}` +
    `${pad(date.getUTCDate())}T` +
    `${pad(date.getUTCHours())}` +
    `${pad(date.getUTCMinutes())}` +
    `${pad(date.getUTCSeconds())}Z`
  );
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

/**
 * Builds an RFC 5545 .ics calendar payload with exact start/end time, venue,
 * Google Maps link, and 3 VALARM reminders (-1 day, -12 hours, -1 hour).
 */
export function buildMatchIcsContent(input: CalendarMatchInput): string {
  const start = new Date(input.startsAt);
  const validStart = Number.isNaN(start.getTime()) ? new Date() : start;
  const end = computeMatchEndTime(validStart.toISOString(), input.notes);
  const now = new Date();

  const summary = `${input.sport} · ${input.title} (#${input.shortCode})`;
  const descLines = [
    `Buổi chơi: ${input.title}`,
    `Môn: ${input.sport}`,
    `Địa điểm: ${input.locationName}`,
  ];
  if (input.ticketCode) {
    descLines.push(`Mã vé điểm danh: ${input.ticketCode}`);
  }
  if (input.mapUrl) {
    descLines.push(`Google Maps: ${input.mapUrl}`);
  }
  if (input.pageUrl) {
    descLines.push(`Chi tiết vé: ${input.pageUrl}`);
  }

  const description = descLines.join('\n');
  const location = input.mapUrl
    ? `${input.locationName} (${input.mapUrl})`
    : input.locationName;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MatchMate//Club Booking//VI',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${escapeIcsText(input.uid)}@matchmate.app`,
    `DTSTAMP:${formatIcsUtc(now)}`,
    `DTSTART:${formatIcsUtc(validStart)}`,
    `DTEND:${formatIcsUtc(end)}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    `LOCATION:${escapeIcsText(location)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    ...(input.mapUrl ? [`URL:${input.mapUrl}`] : []),
    'STATUS:CONFIRMED',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeIcsText(`Nhắc lịch ngày mai: ${summary}`)}`,
    'TRIGGER:-P1D',
    'END:VALARM',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeIcsText(`Còn 12 giờ nữa tới giờ ra sân: ${summary}`)}`,
    'TRIGGER:-PT12H',
    'END:VALARM',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeIcsText(`Chuẩn bị ra sân sau 1 giờ: ${summary}`)}`,
    'TRIGGER:-PT1H',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return `${lines.join('\r\n')}\r\n`;
}

/**
 * Builds a Google Calendar deep link pre-filled with match time, venue, and Maps link.
 */
export function buildGoogleCalendarUrl(input: CalendarMatchInput): string {
  const start = new Date(input.startsAt);
  const validStart = Number.isNaN(start.getTime()) ? new Date() : start;
  const end = computeMatchEndTime(validStart.toISOString(), input.notes);

  const detailsParts = [`Môn: ${input.sport}`, `Địa điểm: ${input.locationName}`];
  if (input.ticketCode) {
    detailsParts.push(`Mã vé điểm danh: ${input.ticketCode}`);
  }
  if (input.mapUrl) {
    detailsParts.push(`Google Maps: ${input.mapUrl}`);
  }
  if (input.pageUrl) {
    detailsParts.push(`Vé điện tử: ${input.pageUrl}`);
  }

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${input.sport} · ${input.title} (#${input.shortCode})`,
    dates: `${formatIcsUtc(validStart)}/${formatIcsUtc(end)}`,
    location: input.mapUrl
      ? `${input.locationName} (${input.mapUrl})`
      : input.locationName,
    details: detailsParts.join('\n'),
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function downloadIcsFile(filename: string, content: string): void {
  if (typeof document === 'undefined') return;
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
