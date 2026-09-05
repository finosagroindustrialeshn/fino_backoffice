/** FIELD is a route seller; STORE is the counter. */
export type SaleChannel = 'FIELD' | 'STORE';
export type PaymentType = 'CASH' | 'CREDIT';
export type SaleStatus = 'PAID' | 'PARTIAL' | 'PENDING';

/**
 * The catalog entry a line was sold from, embedded in the line itself. The
 * detail endpoint resolves it server-side, so a sale never has to be joined
 * against a paginated product lookup to say what it sold.
 */
export interface SaleItemProduct {
  readonly id: string;
  readonly sku: string;
  readonly name: string;
  readonly imageUrl: string | null;
}

export interface SaleItem {
  readonly id: string;
  readonly productId: string;
  readonly product: SaleItemProduct;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly subtotal: number;
}

/**
 * How money arrived. A closed set on the API side, and the split the cash
 * count is built on: only CASH ever reaches the drawer, so TRANSFER and CARD
 * settle at the bank and are deliberately excluded from `expectedCash`.
 */
export type PaymentMethod = 'CASH' | 'TRANSFER' | 'CARD';

/**
 * One method's share of what a shift or a till took in.
 *
 * Lives here rather than beside either consumer because it is the same fact
 * in both places: a shift liquidation and a store cash count split the very
 * same money the very same way, and two identical copies would drift.
 */
export interface CollectedByMethod {
  readonly method: PaymentMethod;
  readonly amount: number;
}

export interface SalePayment {
  readonly id: string;
  readonly saleId: string;
  readonly amount: number;
  readonly method: PaymentMethod;
  /**
   * Bank or terminal reference. Always present for TRANSFER and CARD — an
   * untraceable non-cash collection cannot be reconciled against a statement —
   * and normally null for CASH.
   */
  readonly referenceNumber: string | null;
  readonly createdById: string | null;
  readonly createdAt: string;
}

/** The seller or cashier, as the sale itself reports them. */
export interface SalePersonRef {
  readonly id: string;
  readonly fullName: string;
}

/** The client a sale was made to, embedded by the detail endpoint. */
export interface SaleClientRef {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly contactName: string | null;
  readonly phone: string | null;
  readonly address: string | null;
  readonly imageUrl: string | null;
  readonly latitude: number;
  readonly longitude: number;
}

/** Status of a sales order, as reported by the sale that settled it. */
export type SettledOrderStatus =
  | 'DRAFT'
  | 'PLACED'
  | 'ASSIGNED'
  | 'PARTIALLY_CONVERTED'
  | 'CONVERTED'
  | 'CANCELLED';

/** The preventa order this sale converted, when it settled one. */
export interface SaleSettledOrder {
  readonly orderId: string;
  readonly status: SettledOrderStatus;
  /** ISO 8601 UTC. */
  readonly linkedAt: string;
}

/**
 * A sale as its own endpoints return it (GET /sales/{id}, POST /sales,
 * POST /sales/{id}/payments): the whole document, lines and abonos included,
 * with the parties already resolved.
 *
 * NOT the shape of a row in the listing — see `SaleListItem`.
 */
export interface Sale {
  readonly id: string;
  readonly channel: SaleChannel;
  /** Set for FIELD sales (the seller's shift). */
  readonly shiftId: string | null;
  /** Set for STORE sales (the cashier's till). */
  readonly cashSessionId: string | null;
  /** The seller (FIELD) or cashier (STORE) who made the sale. */
  readonly sellerId: string;
  /** Present on every sale read from its own endpoints. */
  readonly seller?: SalePersonRef;
  readonly clientId: string | null;
  /**
   * NULL rather than absent on a STORE walk-in: the API is answering "nobody",
   * which is a real answer, not missing data.
   */
  readonly client?: SaleClientRef | null;
  readonly routeStopId: string | null;
  /** The preventa order this sale settled, or null when it settled none. */
  readonly settledOrder?: SaleSettledOrder | null;
  /**
   * Where the phone said it was when the sale was registered. Null whenever no
   * fix was available — a sale without coordinates is normal, never an error.
   */
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly paymentType: PaymentType;
  readonly status: SaleStatus;
  readonly total: number;
  readonly amountPaid: number;
  readonly balanceDue: number;
  readonly notes: string | null;
  readonly createdById: string | null;
  readonly items: readonly SaleItem[];
  readonly payments: readonly SalePayment[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * An open credit sale as the receivables endpoints echo it.
 *
 * The API types these as full sales, but says so itself: `seller` is "absent
 * only where a bare sale row is echoed, such as the receivables listing".
 * Naming the handful of fields that are actually guaranteed keeps this from
 * promising lines and abonos that never travel — the exact over-promise that
 * split `Sale` from `SaleListItem` in the first place.
 */
export type OpenCreditSale = Pick<
  Sale,
  | 'id'
  | 'createdAt'
  | 'status'
  | 'paymentType'
  | 'total'
  | 'amountPaid'
  | 'balanceDue'
>;

/** What a listing row sold, summarized so the table needs no drill-down. */
export interface SaleListProduct {
  readonly name: string;
  readonly sku: string;
  readonly quantity: number;
}

/**
 * One row of GET /sales.
 *
 * Deliberately not `Sale`: the list endpoint answers a different question and
 * promises nothing about a sale's `items`, `payments`, `notes`, `routeStopId`,
 * `createdById` or `updatedAt` — it sends none of them. Typing rows as `Sale`
 * let the table read fields that were never on the wire.
 *
 * What the list does carry, and the detail has no need for, is the parties
 * already named and a product summary, so a row describes itself without
 * being joined against a bounded lookup.
 */
export interface SaleListItem {
  readonly id: string;
  readonly channel: SaleChannel;
  readonly paymentType: PaymentType;
  readonly status: SaleStatus;
  readonly clientId: string | null;
  /** Null on a STORE walk-in (público general) — anonymous by design. */
  readonly clientName: string | null;
  readonly clientCode: string | null;
  readonly sellerId: string;
  readonly sellerName: string;
  readonly total: number;
  readonly amountPaid: number;
  /** `total - amountPaid`, computed server-side. */
  readonly balanceDue: number;
  /** Distinct product lines on the sale. */
  readonly lineCount: number;
  /** Units across all lines. */
  readonly unitsSold: number;
  /** Set for FIELD sales (the seller's shift). */
  readonly shiftId: string | null;
  /** Set for STORE sales (the cashier's till). */
  readonly cashSessionId: string | null;
  readonly createdAt: string;
  readonly products: readonly SaleListProduct[];
}

export interface SaleItemInput {
  readonly productId: string;
  /** Units (presentations) sold. */
  readonly quantity: number;
  /** Price override for this line; omitted means the catalog price. */
  readonly unitPrice?: number;
}

export interface CreateSalePayload {
  /** Defaults to FIELD server-side, so STORE must always be explicit. */
  readonly channel?: SaleChannel;
  /** Required for FIELD; optional for STORE walk-in sales. */
  readonly clientId?: string;
  readonly paymentType: PaymentType;
  /** Down payment on a CREDIT sale. Ignored for CASH. */
  readonly amountPaid?: number;
  /**
   * How the money for this sale physically arrived: the whole amount of a
   * CASH sale, or the down payment of a CREDIT one.
   *
   * Defaults to CASH server-side, which is why omitting it is NOT harmless —
   * a transfer booked as cash inflates `cashCollected`, and therefore
   * `expectedCash`, producing a shortage in the arqueo that never happened.
   */
  readonly paymentMethod?: PaymentMethod;
  /** Required when `paymentMethod` is TRANSFER or CARD; rejected otherwise. */
  readonly referenceNumber?: string;
  readonly notes?: string;
  readonly items: readonly SaleItemInput[];
}

export interface CreateSalePaymentPayload {
  readonly amount: number;
  /** Defaults to CASH server-side — the method the collector's close counts. */
  readonly method?: PaymentMethod;
  /** Required when `method` is TRANSFER or CARD; rejected otherwise. */
  readonly referenceNumber?: string;
}

export const PAYMENT_TYPE_LABELS: Record<PaymentType, string> = {
  CASH: 'Contado',
  CREDIT: 'Crédito',
};

export const SALE_STATUS_LABELS: Record<SaleStatus, string> = {
  PAID: 'Pagada',
  PARTIAL: 'Abonada',
  PENDING: 'Pendiente',
};

export const SALE_CHANNEL_LABELS: Record<SaleChannel, string> = {
  FIELD: 'Campo',
  STORE: 'Mostrador',
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Efectivo',
  TRANSFER: 'Transferencia',
  CARD: 'Tarjeta',
};

/**
 * Methods offered when collecting an abono.
 *
 * Mutable on purpose: PrimeNG's `[options]` input rejects readonly arrays.
 */
export const PAYMENT_METHOD_OPTIONS: {
  value: PaymentMethod;
  label: string;
}[] = (Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((value) => ({
  value,
  label: PAYMENT_METHOD_LABELS[value],
}));

/**
 * Non-cash money has to be traceable to a bank or terminal statement, so the
 * API rejects a TRANSFER or CARD abono that carries no reference. The form
 * enforces the same rule client-side rather than waiting for the 400.
 */
export function requiresReference(method: PaymentMethod): boolean {
  return method !== 'CASH';
}

/**
 * Localizes a stored `method`. An unrecognized value is shown as-is rather
 * than hidden — it is real data written by some other client.
 */
export function paymentMethodLabel(method: PaymentMethod | null): string {
  if (!method) {
    return '—';
  }
  return PAYMENT_METHOD_LABELS[method] ?? method;
}

export type SaleTagSeverity =
  | 'secondary'
  | 'warn'
  | 'info'
  | 'success'
  | 'danger';

/** PENDING is danger rather than warn: nothing has been collected yet. */
export const SALE_STATUS_SEVERITY: Record<SaleStatus, SaleTagSeverity> = {
  PAID: 'success',
  PARTIAL: 'warn',
  PENDING: 'danger',
};

export const SALE_CHANNEL_SEVERITY: Record<SaleChannel, SaleTagSeverity> = {
  FIELD: 'info',
  STORE: 'secondary',
};
