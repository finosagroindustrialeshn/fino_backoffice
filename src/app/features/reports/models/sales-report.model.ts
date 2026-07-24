/** Sales channel a sale was made through. */
export type SalesChannel = 'FIELD' | 'STORE';

/** An amount/count pair — one slice of a sales split. */
export interface MoneyBucket {
  /** Amount sold. */
  readonly amount: number;
  /** Number of sales. */
  readonly count: number;
}

/** GET /reports/sales/summary */
export interface SalesSummary {
  /** Total amount sold in the range. */
  readonly totalAmount: number;
  /** Number of sales in the range. */
  readonly saleCount: number;
  /** totalAmount / saleCount, or 0 with no sales. */
  readonly averageTicket: number;
  readonly cash: MoneyBucket;
  readonly credit: MoneyBucket;
  readonly field: MoneyBucket;
  readonly store: MoneyBucket;
  /** Total collected so far (sum of amountPaid). */
  readonly totalCollected: number;
  /** Total still outstanding (sum of balanceDue). */
  readonly totalOutstanding: number;
}

/** One row of GET /reports/sales/by-product */
export interface ProductSalesRow {
  readonly productId: string;
  readonly productName: string;
  readonly unitsSold: number;
  readonly revenue: number;
}

/** One row of GET /reports/sales/by-seller */
export interface SellerSalesRow {
  readonly sellerId: string;
  readonly sellerName: string;
  readonly saleCount: number;
  readonly total: number;
  readonly cash: MoneyBucket;
  readonly credit: MoneyBucket;
}

/** Sort field accepted by the by-product ranking. */
export type ProductSalesSortBy = 'revenue' | 'units';

export const SALES_CHANNEL_LABELS: Record<SalesChannel, string> = {
  FIELD: 'Campo',
  STORE: 'Tienda',
};
