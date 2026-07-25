import { daysInRange, utcMidnight, type DateRange } from '../../../shared/utils/date-range';

/** Longest span the cash report endpoints accept before returning 400. */
export const MAX_CASH_RANGE_DAYS = 92;

/**
 * Validates a range against what the cash endpoints accept, so the user gets
 * an inline message instead of a 400 round-trip. Returns null when valid.
 */
export function validateCashRange(range: DateRange): string | null {
  const from = range?.[0];
  const to = range?.[1];
  if (!from || !to) {
    return 'Seleccioná un rango de fechas para ver el cierre de caja.';
  }
  if (utcMidnight(from) > utcMidnight(to)) {
    return 'La fecha inicial no puede ser mayor que la final.';
  }
  if (daysInRange(from, to) > MAX_CASH_RANGE_DAYS) {
    return `El rango no puede exceder ${MAX_CASH_RANGE_DAYS} días.`;
  }
  return null;
}
