/**
 * Cash-close reporting models. Every `date` here is a Honduras civil day
 * (UTC-6) already resolved server-side, so it is a plain `YYYY-MM-DD` string
 * and must NOT be re-localized on the client.
 */

/** One row of GET /reports/cash/daily — a consolidated day close. */
export interface DailyCashRow {
  /** Honduras civil day, YYYY-MM-DD. */
  readonly date: string;
  readonly shiftsCount: number;
  readonly sessionsCount: number;
  readonly openShifts: number;
  readonly openSessions: number;
  readonly openingFloat: number;
  readonly cashCollected: number;
  readonly expenses: number;
  readonly expectedCash: number;
  readonly closingCounted: number;
  /** counted − expected. Null while anything in the day is still open. */
  readonly difference: number | null;
}

/** Whether an arqueo line comes from a field shift or a store cash session. */
export type CashLineKind = 'shift' | 'session';

export type CashLineStatus = 'OPEN' | 'CLOSED';

/** One row of GET /reports/cash/sessions — a per-shift/session arqueo line. */
export interface CashSessionRow {
  readonly kind: CashLineKind;
  readonly id: string;
  readonly ownerId: string;
  /**
   * The owner's full name. A row reading `difference: -300` has to name the
   * person, so this is what the table sorts and reads on — `ownerId` stays
   * for the drill-down link.
   */
  readonly ownerName: string;
  readonly status: CashLineStatus;
  /** ISO 8601 UTC timestamp. */
  readonly openedAt: string;
  /** ISO 8601 UTC timestamp, null while still open. */
  readonly closedAt: string | null;
  readonly openingCash: number;
  /** CASH collected. The only inflow the drawer holds, so the only one counted. */
  readonly cashCollected: number;
  /** TRANSFER + CARD. Settled at the bank, never in the drawer. */
  readonly otherCollected: number;
  /** cashCollected + otherCollected — what the collections drill-down sums to. */
  readonly totalCollected: number;
  readonly expenses: number;
  readonly expectedCash: number;
  /** Counted cash at close, null while still open. */
  readonly closingCash: number | null;
  /** closingCash − expectedCash, null while still open. */
  readonly difference: number | null;
}

export const CASH_LINE_KIND_LABELS: Record<CashLineKind, string> = {
  shift: 'Jornada',
  session: 'Caja',
};

export const CASH_LINE_STATUS_LABELS: Record<CashLineStatus, string> = {
  OPEN: 'Abierta',
  CLOSED: 'Cerrada',
};
