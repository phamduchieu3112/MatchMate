import { describe, expect, it } from 'vitest';
import {
  expandRosterForPoster,
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
