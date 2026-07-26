/**
 * Executive dashboard model. Mirrors the `dashboard` tag of the OpenAPI
 * spec. Money buckets/aging buckets are re-declared here rather than
 * imported from features/reports or features/accounts-receivable — features
 * don't import from other features, even when the shape happens to match.
 */

/** An amount/count pair — one slice of a sales split. */
export interface MoneyBucket {
  readonly amount: number;
  readonly count: number;
}

/** One aging band of the outstanding receivables balance. */
export interface AgingBucket {
  readonly label: string;
  readonly fromDays: number;
  readonly toDays: number | null;
  readonly total: number;
  readonly salesCount: number;
}

/** Consolidated cash close for the range. Zeroed when no shift/session was open that day. */
export interface DashboardCashSummary {
  /** UTC calendar day of the shift/session opening. */
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
  /** closingCounted - expectedCash. Null while anything that day is still open. */
  readonly difference: number | null;
}

/** Sales summary over the range. */
export interface DashboardSalesSummary {
  readonly totalAmount: number;
  readonly saleCount: number;
  readonly averageTicket: number;
  readonly totalCollected: number;
  readonly totalOutstanding: number;
  readonly cash: MoneyBucket;
  readonly credit: MoneyBucket;
  readonly field: MoneyBucket;
  readonly store: MoneyBucket;
}

/** Portfolio-wide receivable summary; NOT scoped to the date range. */
export interface DashboardReceivablesSummary {
  readonly totalOutstanding: number;
  readonly debtorClients: number;
  readonly openSalesCount: number;
  readonly buckets: readonly AgingBucket[];
}

/** How urgent an aging band is. Derived from `fromDays`, mirrors accounts-receivable's own severity scale. */
export type AgingSeverity = 'current' | 'due' | 'overdue' | 'critical';

export function agingSeverity(bucket: AgingBucket): AgingSeverity {
  if (bucket.fromDays >= 90) {
    return 'critical';
  }
  if (bucket.fromDays >= 60) {
    return 'overdue';
  }
  if (bucket.fromDays >= 30) {
    return 'due';
  }
  return 'current';
}

/** Human-readable span of a band, e.g. `0 a 30 días` / `90 días o más`. */
export function agingRangeLabel(bucket: AgingBucket): string {
  return bucket.toDays === null
    ? `${bucket.fromDays} días o más`
    : `${bucket.fromDays} a ${bucket.toDays} días`;
}

/** GET /dashboard/summary */
export interface DashboardSummary {
  /** Resolved range start (Honduras civil date). */
  readonly dateFrom: string;
  /** Resolved range end (Honduras civil date). */
  readonly dateTo: string;
  readonly lowStockThreshold: number;
  readonly lowStockCount: number;
  readonly sales: DashboardSalesSummary;
  readonly cash: DashboardCashSummary;
  readonly receivables: DashboardReceivablesSummary;
}
