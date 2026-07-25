import { describe, expect, it } from 'vitest';

import { daysInRange, formatDay, lastNDays, monthToDate } from './date-range';

describe('formatDay', () => {
  it('formats a date as YYYY-MM-DD using its local calendar day', () => {
    expect(formatDay(new Date(2026, 6, 24))).toBe('2026-07-24');
  });

  it('pads single-digit months and days', () => {
    expect(formatDay(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('keeps the local day for late-evening times (no UTC shift)', () => {
    // 23:30 local in Honduras (UTC-6) is already the next day in UTC.
    expect(formatDay(new Date(2026, 6, 24, 23, 30))).toBe('2026-07-24');
  });
});

describe('daysInRange', () => {
  it('counts a single day as 1 (both bounds inclusive)', () => {
    const day = new Date(2026, 6, 24);
    expect(daysInRange(day, day)).toBe(1);
  });

  it('counts consecutive days inclusively', () => {
    expect(daysInRange(new Date(2026, 6, 1), new Date(2026, 6, 31))).toBe(31);
  });

  it('ignores the time of day', () => {
    expect(
      daysInRange(new Date(2026, 6, 1, 23, 59), new Date(2026, 6, 2, 0, 1)),
    ).toBe(2);
  });

  it('is unaffected by month boundaries', () => {
    expect(daysInRange(new Date(2026, 6, 30), new Date(2026, 7, 2))).toBe(4);
  });
});

describe('lastNDays', () => {
  it('returns a range ending today and spanning exactly n days', () => {
    const today = new Date(2026, 6, 24);
    const [from, to] = lastNDays(30, today);

    expect(formatDay(to)).toBe('2026-07-24');
    expect(daysInRange(from, to)).toBe(30);
  });

  it('crosses month boundaries backwards', () => {
    const [from] = lastNDays(30, new Date(2026, 6, 24));
    expect(formatDay(from)).toBe('2026-06-25');
  });
});

describe('monthToDate', () => {
  it('returns the 1st-of-month through today for a mid-month date', () => {
    const today = new Date(2026, 6, 24);
    const [from, to] = monthToDate(today);

    expect(formatDay(from)).toBe('2026-07-01');
    expect(formatDay(to)).toBe('2026-07-24');
  });

  it('handles today being the 1st of the month itself', () => {
    const today = new Date(2026, 6, 1);
    const [from, to] = monthToDate(today);

    expect(formatDay(from)).toBe('2026-07-01');
    expect(formatDay(to)).toBe('2026-07-01');
    expect(daysInRange(from, to)).toBe(1);
  });
});
