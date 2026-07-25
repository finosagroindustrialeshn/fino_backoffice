import { describe, expect, it } from 'vitest';

import { lastNDays } from '../../../shared/utils/date-range';
import { MAX_CASH_RANGE_DAYS, validateCashRange } from './date-range';

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
