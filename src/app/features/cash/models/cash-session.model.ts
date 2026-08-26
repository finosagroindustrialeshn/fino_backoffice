export type CashSessionStatus = 'OPEN' | 'CLOSED';

/** Live reconciliation of a till: what the system expects vs what was counted. */
export interface CashCount {
  /** Store sales total for the session. */
  readonly totalSales: number;
  readonly salesCount: number;
  /** Cash actually collected at this till. */
  readonly cashCollected: number;
  /** Credit still outstanding from this session's sales. */
  readonly creditOutstanding: number;
  /** openingCash + cashCollected. */
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
