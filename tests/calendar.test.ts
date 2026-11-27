import { describe, expect, it } from 'vitest';
import {
  buildGoogleCalendarUrl,
  buildMatchIcsContent,
  computeMatchEndTime,
} from '@/lib/calendar';

describe('Calendar integration (.ics & Google Calendar)', () => {
  const sampleInput = {
    uid: 'reg-1234',
    title: 'Cầu lông Thứ Bảy',
    sport: 'Cầu lông',
    startsAt: '2026-12-05T19:00:00+07:00',
    notes: '19:00 - 21:30 · Sân thảm mới',
    locationName: 'Sân Cầu Lông Thành Công',
    mapUrl: 'https://maps.app.goo.gl/abc123',
    shortCode: 'SAT999',
    ticketCode: 'KEO123ABC',
  };

  it('computes end time from notes range in Asia/Ho_Chi_Minh or defaults to +2h', () => {
    const start = new Date(sampleInput.startsAt);
    const endFromNotes = computeMatchEndTime(sampleInput.startsAt, sampleInput.notes);
    expect(endFromNotes.getTime() - start.getTime()).toBe(150 * 60 * 1000);

    const endDefault = computeMatchEndTime(sampleInput.startsAt, 'Sân thảm mới');
    expect(endDefault.getTime() - start.getTime()).toBe(120 * 60 * 1000);
  });

  it('builds valid RFC 5545 .ics with exact 3 VALARM reminders (-P1D, -PT12H, -PT1H)', () => {
    const ics = buildMatchIcsContent(sampleInput);

    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('DTSTART:20261205T120000Z');
    expect(ics).toContain('DTEND:20261205T143000Z');
    expect(ics).toContain('SUMMARY:Cầu lông · Cầu lông Thứ Bảy (#SAT999)');
    expect(ics).toContain('URL:https://maps.app.goo.gl/abc123');
    expect(ics).toContain('TRIGGER:-P1D');
    expect(ics).toContain('TRIGGER:-PT12H');
    expect(ics).toContain('TRIGGER:-PT1H');

    const alarmCount = (ics.match(/BEGIN:VALARM/g) ?? []).length;
    expect(alarmCount).toBe(3);
  });

  it('builds pre-filled Google Calendar deep link', () => {
    const url = buildGoogleCalendarUrl(sampleInput);
    expect(url).toContain('https://calendar.google.com/calendar/render');
    expect(url).toContain('action=TEMPLATE');
    expect(url).toContain('dates=20261205T120000Z%2F20261205T143000Z');
    expect(url).toContain('maps.app.goo.gl');
  });
});
