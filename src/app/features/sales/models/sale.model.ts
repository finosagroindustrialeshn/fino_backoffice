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

export interface SalePayment {
  readonly id: string;
  readonly saleId: string;
  readonly amount: number;
  /** Free-form label (cash, transfer, …). */
  readonly method: string | null;
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
  readonly notes?: string;
  readonly items: readonly SaleItemInput[];
}

export interface CreateSalePaymentPayload {
  readonly amount: number;
  readonly method?: string;
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

/**
 * Payment methods offered when collecting an abono. The API stores `method` as
 * a free-form label, so the canonical lowercase English values the spec
 * suggests (cash, transfer, …) are what travels; only the label is localized.
 * That keeps the column consistent with whatever the seller app writes.
 *
 * Mutable on purpose: PrimeNG's `[options]` input rejects readonly arrays.
 */
export const PAYMENT_METHOD_OPTIONS: { value: string; label: string }[] = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'transfer', label: 'Transferencia' },
  { value: 'deposit', label: 'Depósito' },
  { value: 'check', label: 'Cheque' },
];

/**
 * Localizes a stored `method`. An unrecognized value is shown as-is rather
 * than hidden — it is real data written by some other client.
 */
export function paymentMethodLabel(method: string | null): string {
  if (!method) {
    return '—';
  }
  return (
    PAYMENT_METHOD_OPTIONS.find((option) => option.value === method)?.label ??
    method
  );
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
