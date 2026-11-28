import { describe, expect, it } from 'vitest';
import {
  expandRosterForPoster,
  sanitizeIntegerInput,
  splitParticipantNames,
} from '@/lib/ui-helpers';

describe('splitParticipantNames', () => {
  it('splits comma-separated Vietnamese full names cleanly', () => {
    expect(
      splitParticipantNames('Ngô Thế Phong, Nguyễn Đạt Linh Ngọc')
    ).toEqual(['Ngô Thế Phong', 'Nguyễn Đạt Linh Ngọc']);
  });

  it('trims extra spaces and skips empty/repeated delimiters', () => {
    expect(
      splitParticipantNames('  Ngô Thế Phong , ,   Nguyễn Đạt Linh Ngọc , ')
    ).toEqual(['Ngô Thế Phong', 'Nguyễn Đạt Linh Ngọc']);
  });

  it('supports semicolon, newline, +, and & delimiters', () => {
    expect(splitParticipantNames('An Nguyễn; Bình Trần')).toEqual([
      'An Nguyễn',
      'Bình Trần',
    ]);
    expect(splitParticipantNames('An Nguyễn\nBình Trần\r\nChi Lê')).toEqual([
      'An Nguyễn',
      'Bình Trần',
      'Chi Lê',
    ]);
    expect(splitParticipantNames('An Nguyễn + Bình Trần & Chi Lê')).toEqual([
      'An Nguyễn',
      'Bình Trần',
      'Chi Lê',
    ]);
  });

  it('keeps single-name bookings (including multi-slot) intact', () => {
    expect(splitParticipantNames('Phạm Đức Hiếu')).toEqual(['Phạm Đức Hiếu']);
    expect(splitParticipantNames('  Phạm   Đức   Hiếu  ')).toEqual([
      'Phạm Đức Hiếu',
    ]);
  });

  it('returns empty array for empty or delimiter-only input', () => {
    expect(splitParticipantNames('')).toEqual([]);
    expect(splitParticipantNames('   , ; +  ')).toEqual([]);
  });
});

describe('expandRosterForPoster', () => {
  it('expands multi-person group bookings into individual poster entries', () => {
    const expanded = expandRosterForPoster([
      {
        displayName: 'Ngô Thế Phong, Nguyễn Đạt Linh Ngọc',
        slots: 2,
        status: 'confirmed',
      },
      {
        displayName: 'Phạm Đức Hiếu',
        slots: 2,
        status: 'pending_payment',
      },
    ]);

    expect(expanded).toEqual([
      { displayName: 'Ngô Thế Phong', slots: 1, status: 'confirmed' },
      { displayName: 'Nguyễn Đạt Linh Ngọc', slots: 1, status: 'confirmed' },
      { displayName: 'Phạm Đức Hiếu', slots: 2, status: 'pending_payment' },
    ]);
  });

  it('preserves extra slots on the lead player if slots exceed parsed names', () => {
    const expanded = expandRosterForPoster([
      {
        displayName: 'An, Bình',
        slots: 3,
        status: 'confirmed',
      },
    ]);

    expect(expanded).toEqual([
      { displayName: 'An', slots: 2, status: 'confirmed' },
      { displayName: 'Bình', slots: 1, status: 'confirmed' },
    ]);
  });
});

describe('sanitizeIntegerInput', () => {
  it('strips leading zeros cleanly when typing into numeric fields', () => {
    expect(sanitizeIntegerInput('015', 99)).toEqual({ text: '15', value: 15 });
    expect(sanitizeIntegerInput('021', 99)).toEqual({ text: '21', value: 21 });
    expect(sanitizeIntegerInput('03', 500)).toEqual({ text: '3', value: 3 });
    expect(sanitizeIntegerInput('000', 99)).toEqual({ text: '0', value: 0 });
  });

  it('handles empty and non-digit characters safely', () => {
    expect(sanitizeIntegerInput('', 99)).toEqual({ text: '', value: null });
    expect(sanitizeIntegerInput('abc', 99)).toEqual({ text: '', value: null });
    expect(sanitizeIntegerInput('21a', 99)).toEqual({ text: '21', value: 21 });
  });

  it('clamps values to the configured maximum', () => {
    expect(sanitizeIntegerInput('150', 99)).toEqual({ text: '99', value: 99 });
  });
});
