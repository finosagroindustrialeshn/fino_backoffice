import type { MovementType } from '../../inventory/models/inventory.model';

/** One row of GET /reports/inventory/stock — warehouse balance per product. */
export interface StockReportRow {
  readonly productId: string;
  readonly sku: string;
  readonly name: string;
  /** Free to dispatch. */
  readonly available: number;
  /** Reserved by an assigned dispatch, not yet handed over. */
  readonly committed: number;
  /** available + committed. */
  readonly total: number;
}

/** One row of GET /reports/inventory/kardex — a movement plus running balance. */
export interface KardexEntry {
  readonly id: string;
  readonly productId: string;
  readonly type: MovementType;
  /** Signed quantity: positive on entry, negative on exit. */
  readonly quantity: number;
  readonly note: string | null;
  /** ISO 8601 UTC timestamp. */
  readonly createdAt: string;
  /** Running balance after this movement. */
  readonly balance: number;
}

/** One row of GET /reports/inventory/seller-stock. */
export interface SellerStockRow {
  readonly sellerId: string;
  readonly sellerName: string;
  readonly productId: string;
  readonly sku: string;
  readonly name: string;
  readonly quantity: number;
}
