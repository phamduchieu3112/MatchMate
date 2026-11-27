import { describe, expect, it } from 'vitest';
import {
  composeNotesWithTimeRange,
  extractMatchTimeRange,
  formatMatchDateTimeRange,
  stripTimeRangeFromNotes,
} from '@/lib/format';

describe('match time range helpers', () => {
  it('extracts start and end time from notes with and without extra text', () => {
    expect(extractMatchTimeRange('15:00 - 17:00')).toEqual({
      startTime: '15:00',
      endTime: '17:00',
      cleanNotes: '',
    });

    expect(extractMatchTimeRange('15:00 - 17:00 · Sân trong nhà')).toEqual({
      startTime: '15:00',
      endTime: '17:00',
      cleanNotes: 'Sân trong nhà',
    });

    expect(extractMatchTimeRange('Mang giày không đế đen')).toBeNull();
  });

  it('strips leading time range from notes cleanly', () => {
    expect(stripTimeRangeFromNotes('15:00 - 17:00')).toBeNull();
    expect(stripTimeRangeFromNotes('15:00 - 17:00 · Mang nước')).toBe('Mang nước');
    expect(stripTimeRangeFromNotes('Chỉ có ghi chú')).toBe('Chỉ có ghi chú');
  });

  it('composes notes with time range without duplicating existing range', () => {
    expect(composeNotesWithTimeRange('15:00', '17:00', '')).toBe('15:00 - 17:00');
    expect(
      composeNotesWithTimeRange('16:00', '18:00', '15:00 - 17:00 · Sân số 2')
    ).toBe('16:00 - 18:00 · Sân số 2');
  });

  it('formats match date time range with both start and end times', () => {
    const formattedVi = formatMatchDateTimeRange(
      '2026-11-28T15:00:00+07:00',
      '15:00 - 17:00 · Ghi chú',
      'vi'
    );
    expect(formattedVi).toContain('15:00 – 17:00');
    expect(formattedVi).toContain('28/11');

    const formattedEn = formatMatchDateTimeRange(
      '2026-11-28T15:00:00+07:00',
      '15:00 - 17:00',
      'en'
    );
    expect(formattedEn).toContain('15:00 – 17:00');

    const fallback = formatMatchDateTimeRange(
      '2026-11-28T15:00:00+07:00',
      null,
      'vi'
    );
    expect(fallback).toContain('15:00');
    expect(fallback).not.toContain('–');
  });
});
