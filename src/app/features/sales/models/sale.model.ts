/** FIELD is a route seller; STORE is the counter. */
export type SaleChannel = 'FIELD' | 'STORE';
export type PaymentType = 'CASH' | 'CREDIT';
export type SaleStatus = 'PAID' | 'PARTIAL' | 'PENDING';

export interface SaleItem {
  readonly id: string;
  readonly productId: string;
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

export interface Sale {
  readonly id: string;
  readonly channel: SaleChannel;
  /** Set for FIELD sales (the seller's shift). */
  readonly shiftId: string | null;
  /** Set for STORE sales (the cashier's till). */
  readonly cashSessionId: string | null;
  /** The seller (FIELD) or cashier (STORE) who made the sale. */
  readonly sellerId: string;
  readonly clientId: string | null;
  readonly routeStopId: string | null;
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
