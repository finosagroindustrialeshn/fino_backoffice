export type ShiftStatus = 'OPEN' | 'CLOSED';

/**
 * Cash reconciliation for a shift: what the seller should be holding versus
 * what they actually counted.
 *
 * `closingCash` and `cashDifference` stay null while the shift is OPEN —
 * nothing has been counted yet, and rendering a 0 there would read as "the
 * seller counted zero" rather than "the seller has not counted".
 */
export interface Liquidation {
  readonly salesCount: number;
  readonly totalSales: number;
  /** Cash actually collected during the shift. */
  readonly cashCollected: number;
  /** Credit extended during the shift that is still owed. */
  readonly creditOutstanding: number;
  /** Field expenses paid out of the float. */
  readonly expenses: number;
  /** openingCash + cashCollected - expenses. */
  readonly expectedCash: number;
  readonly closingCash: number | null;
  /** closingCash - expectedCash: positive is over, negative is short. */
  readonly cashDifference: number | null;
}

/** A shift as returned by the list endpoint, which carries ids only. */
export interface Shift {
  readonly id: string;
  readonly sellerId: string;
  readonly routeId: string | null;
  readonly status: ShiftStatus;
  readonly openingCash: number;
  readonly closingCash: number | null;
  readonly notes: string | null;
  readonly openedAt: string;
  readonly closedAt: string | null;
  /**
   * Who closed the shift — not necessarily the seller. A supervisor can
   * liquidate on their behalf, which is why this is tracked separately.
   */
  readonly closedById: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * A single shift, which the API documents as carrying its liquidation summary.
 * The list endpoint makes no such promise, so the two shapes stay distinct
 * rather than making `liquidation` optional everywhere.
 */
export interface ShiftDetail extends Shift {
  readonly liquidation: Liquidation;
}

export interface CloseShiftPayload {
  /** Cash the seller counts and reports at close. */
  readonly closingCash: number;
  readonly notes?: string;
}

export const SHIFT_STATUS_LABELS: Record<ShiftStatus, string> = {
  OPEN: 'Abierta',
  CLOSED: 'Cerrada',
};

export type ShiftTagSeverity =
  | 'secondary'
  | 'warn'
  | 'info'
  | 'success'
  | 'danger';

/** OPEN is a live shift that still needs attention, not a success state. */
export const SHIFT_STATUS_SEVERITY: Record<ShiftStatus, ShiftTagSeverity> = {
  OPEN: 'info',
  CLOSED: 'success',
};

/** Cash counted matches what was expected, within rounding noise. */
const CASH_TOLERANCE = 0.005;

export type CashDifferenceKind = 'exact' | 'over' | 'short';

export function cashDifferenceKind(difference: number): CashDifferenceKind {
  if (Math.abs(difference) < CASH_TOLERANCE) {
    return 'exact';
  }
  return difference > 0 ? 'over' : 'short';
}

export const CASH_DIFFERENCE_LABELS: Record<CashDifferenceKind, string> = {
  exact: 'Cuadrado',
  over: 'Sobrante',
  short: 'Faltante',
};

/**
 * A surplus is not a success: cash that appears out of nowhere is as much of
 * an accounting problem as cash that went missing. Both warrant attention,
 * only a shortage is the more urgent one.
 */
export const CASH_DIFFERENCE_SEVERITY: Record<
  CashDifferenceKind,
  ShiftTagSeverity
> = {
  exact: 'success',
  over: 'warn',
  short: 'danger',
};
