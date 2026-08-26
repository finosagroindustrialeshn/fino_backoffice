import type { RouteStatus } from '../../routes/models/route.model';

/**
 * One route's day, for `GET /reports/routes/compliance`.
 *
 * Visits and sales are counted separately on purpose: a seller can show up
 * at a client and sell nothing, which is a real outcome the report shows
 * rather than hiding behind a single number.
 *
 * Built on `Sale.routeStopId`, so it only sees sales that named the stop
 * they closed — a sale recorded without one is real money this report
 * cannot attribute to a visit.
 */
export interface RouteComplianceRow {
  readonly routeId: string;
  /** The day, without time (YYYY-MM-DD). */
  readonly date: string;
  readonly sellerId: string;
  readonly sellerName: string;
  readonly status: RouteStatus;
  /** Stops the office planned. */
  readonly plannedStops: number;
  readonly visitedStops: number;
  readonly skippedStops: number;
  /** Never reached. On a COMPLETED route these are the misses. */
  readonly pendingStops: number;
  /**
   * Stops where at least one sale was recorded — CLIENTS served, not the
   * number of sales. Two sales at one client count once.
   */
  readonly stopsWithSale: number;
  readonly salesCount: number;
  /** Money sold at this route's stops. */
  readonly salesAmount: number;
  /**
   * visitedStops / plannedStops. Zero — never null — when nothing was
   * planned, so an average over these rows is always safe.
   */
  readonly visitRate: number;
  /**
   * stopsWithSale / plannedStops. Lower than `visitRate` whenever the seller
   * showed up and sold nothing, which is the outcome worth seeing.
   */
  readonly conversionRate: number;
}
