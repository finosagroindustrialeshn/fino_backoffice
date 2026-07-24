import { describe, expect, it } from 'vitest';

import {
  daysInRange,
  formatDay,
  lastNDays,
  MAX_CASH_RANGE_DAYS,
  validateCashRange,
} from './date-range';

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

describe('validateCashRange', () => {
  it('rejects a missing range — the cash endpoints require both bounds', () => {
    expect(validateCashRange(null)).toBe(
      'Seleccioná un rango de fechas para ver el cierre de caja.',
    );
  });

  it('rejects a half-picked range', () => {
    expect(validateCashRange([new Date(2026, 6, 1), null])).toBe(
      'Seleccioná un rango de fechas para ver el cierre de caja.',
    );
  });

  it('rejects an inverted range before the API 400s on it', () => {
    expect(
      validateCashRange([new Date(2026, 6, 24), new Date(2026, 6, 1)]),
    ).toBe('La fecha inicial no puede ser mayor que la final.');
  });

  it('accepts a range exactly at the 92-day cap', () => {
    const to = new Date(2026, 6, 24);
    const [from] = lastNDays(MAX_CASH_RANGE_DAYS, to);
    expect(validateCashRange([from, to])).toBeNull();
  });

  it('rejects a range one day past the cap', () => {
    const to = new Date(2026, 6, 24);
    const [from] = lastNDays(MAX_CASH_RANGE_DAYS + 1, to);
    expect(validateCashRange([from, to])).toBe(
      'El rango no puede exceder 92 días.',
    );
  });

  it('accepts a single-day range', () => {
    const day = new Date(2026, 6, 24);
    expect(validateCashRange([day, day])).toBeNull();
  });
});
