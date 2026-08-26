/**
 * Preventa rolled up across everybody, for `GET /reports/presales/summary`.
 *
 * Everything is scoped to the date range EXCEPT `unassigned` and `overdue`,
 * which are a work queue rather than a measurement of a period: an order
 * promised for last Tuesday is overdue today whichever month the report shows.
 */
export interface PresalesSummary {
  readonly ordersTaken: number;
  /** Fully delivered — every line covered by a sale. */
  readonly converted: number;
  readonly cancelled: number;
  /** Still DRAFT, PLACED, ASSIGNED or PARTIALLY_CONVERTED. */
  readonly open: number;
  /**
   * converted / (converted + cancelled), as a fraction.
   *
   * Open orders are NOT in the denominator: one taken this morning and still
   * open is not a failure, and counting it would drag a busy week down for
   * being recent. Null until something settles.
   */
  readonly conversionRate: number | null;
  /** Planning value still sitting in open orders. Never a receivable. */
  readonly estimatedValueOpen: number;
  /** Mean hours from taking an order to the sale that COMPLETED it. */
  readonly avgHoursToConvert: number | null;
  /** LIVE, ignores the range: open orders with nobody assigned. */
  readonly unassigned: number;
  /** LIVE, ignores the range: open orders past their promised day. */
  readonly overdue: number;
}

/**
 * One preventista's work over the range, for `GET /reports/presales/by-preseller`.
 *
 * The range filters on when the order was TAKEN, never on when it converted:
 * a preventista's work is the taking, and a conversion landing three weeks
 * later would otherwise credit the month it arrived in rather than the one it
 * was earned in.
 */
export interface PresellerOrdersRow {
  readonly presellerId: string;
  readonly presellerName: string;
  readonly ordersTaken: number;
  readonly converted: number;
  readonly cancelled: number;
  readonly open: number;
  /** converted / (converted + cancelled). Null until something settles. */
  readonly conversionRate: number | null;
  /** Sum of estimatedTotal over the orders taken. Planning value only. */
  readonly estimatedValue: number;
  /** Null when nothing converted in the range. */
  readonly avgHoursToConvert: number | null;
}
