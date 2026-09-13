import type { PaymentMethod } from './sale.model';

/**
 * One collection (cobro) as returned by `GET /payments` — the rows a cash
 * count is made of.
 *
 * Summing `amount` over `?shiftId=X` reproduces that shift's
 * `totalCollected`, and adding `&method=CASH` reproduces `cashCollected`.
 *
 * NOT the same population as `GET /sales?shiftId=X`: that lists the sales
 * MADE in a shift, this lists the money COLLECTED in it. An abono taken today
 * against last week's sale belongs here and not there — which is exactly why
 * summing `amountPaid` over the sales listing almost reconciles and is wrong.
 */
export interface PaymentRow {
  readonly id: string;
  readonly saleId: string;
  readonly amount: number;
  readonly method: PaymentMethod;
  /** Bank or terminal reference. Always set for TRANSFER and CARD. */
  readonly referenceNumber: string | null;
  /**
   * The shift the money was collected in — the anchor the shift liquidation
   * sums over. Null for a back-office collection made outside any shift.
   */
  readonly shiftId: string | null;
  /** The store cash session the money was collected at, if any. */
  readonly cashSessionId: string | null;
  readonly clientId: string | null;
  /** Null on a STORE walk-in (publico general), who is anonymous by design. */
  readonly clientName: string | null;
  readonly clientCode: string | null;
  readonly createdById: string | null;
  /** When the money was collected. What the count is ordered by. */
  readonly createdAt: string;
  /**
   * When the SALE was made. Earlier than `createdAt` on an abono, and that gap
   * is the whole reason this listing exists.
   */
  readonly saleCreatedAt: string;
}
