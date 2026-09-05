import type { CollectedByMethod } from '../../sales/models/sale.model';

export type CashSessionStatus = 'OPEN' | 'CLOSED';

/** Live reconciliation of a till: what the system expects vs what was counted. */
export interface CashCount {
  /** Store sales total for the session. */
  readonly totalSales: number;
  readonly salesCount: number;
  /**
   * CASH collected at this till. Banknotes only — the drawer is counted
   * against this figure, so card and transfer are deliberately excluded.
   */
  readonly cashCollected: number;
  /**
   * TRANSFER + CARD. Collected, but settled at the bank rather than held in
   * the drawer, so it is reported for the cashier to see the whole day and
   * never demanded from the till at close.
   */
  readonly otherCollected: number;
  /** cashCollected + otherCollected. */
  readonly totalCollected: number;
  /**
   * Per-method detail behind the totals. Only methods actually used at this
   * till appear, so an all-cash day carries a single row.
   */
  readonly collectedByMethod: readonly CollectedByMethod[];
  /** Credit still outstanding from this session's sales. */
  readonly creditOutstanding: number;
  /** openingCash + cashCollected — cash only, by design. */
  readonly expectedCash: number;
  /** Null while the session is still open. */
  readonly closingCash: number | null;
  /** closingCash - expectedCash: positive is over, negative is short. */
  readonly cashDifference: number | null;
}

export interface CashSession {
  readonly id: string;
  readonly cashierId: string;
  readonly status: CashSessionStatus;
  /** Opening float placed in the till. */
  readonly openingCash: number;
  readonly openedAt: string;
  readonly closingCash: number | null;
  readonly closedAt: string | null;
  readonly closedById: string | null;
  readonly notes: string | null;
  /**
   * Live reconciliation of the till. The API calls this `cashCount`; the UI
   * still says "arqueo", which is the word used at the counter.
   */
  readonly cashCount?: CashCount;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface OpenCashSessionPayload {
  readonly openingCash: number;
  readonly notes?: string;
}

export interface CloseCashSessionPayload {
  /** Cash counted and reported by the cashier at close. */
  readonly closingCash: number;
  readonly notes?: string;
}
