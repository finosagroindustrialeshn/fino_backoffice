export type DispatchStatus =
  | 'DRAFT'
  | 'ASSIGNED'
  | 'RECEIVED'
  | 'CONFIRMED'
  | 'CANCELLED';

export const DISPATCH_STATUS_LABELS: Record<DispatchStatus, string> = {
  DRAFT: 'Borrador',
  ASSIGNED: 'Asignado',
  RECEIVED: 'Recibido',
  CONFIRMED: 'Confirmado',
  CANCELLED: 'Cancelado',
};

export type DispatchStatusSeverity =
  | 'secondary'
  | 'warn'
  | 'info'
  | 'success'
  | 'danger';

export const DISPATCH_STATUS_SEVERITY: Record<
  DispatchStatus,
  DispatchStatusSeverity
> = {
  DRAFT: 'secondary',
  ASSIGNED: 'warn',
  RECEIVED: 'info',
  CONFIRMED: 'success',
  CANCELLED: 'danger',
};

/** A single product line inside a dispatch. */
export interface DispatchItem {
  readonly id: string;
  readonly productId: string;
  /** Units (presentations) loaded for this product. */
  readonly quantity: number;
}

/**
 * A load assembled for a seller, as returned by the LIST endpoint.
 *
 * The list response carries NO line items — only `GET /dispatches/:id` does.
 * The two are modelled separately because the OpenAPI spec documents a single
 * `DispatchResponseDto` with `items` marked required, which is not what the
 * list endpoint actually sends.
 */
export interface DispatchSummary {
  readonly id: string;
  readonly sellerId: string;
  /** Dispatch day (ISO 8601 UTC). */
  readonly date: string;
  readonly status: DispatchStatus;
  readonly notes: string | null;
  readonly createdById: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * A single dispatch with its line items, as returned by `GET /dispatches/:id`.
 * Assigning reserves warehouse stock (available -> committed); receiving hands
 * it over to the seller.
 */
export interface Dispatch extends DispatchSummary {
  readonly items: readonly DispatchItem[];
}

/** A product line in the create payload. */
export interface DispatchItemInput {
  readonly productId: string;
  readonly quantity: number;
}

export interface CreateDispatchPayload {
  readonly sellerId: string;
  /** Dispatch day in YYYY-MM-DD (local calendar day, no time). */
  readonly date: string;
  readonly items: readonly DispatchItemInput[];
  readonly notes?: string;
}

/** What a seller currently carries, per product. */
export interface SellerStock {
  readonly sellerId: string;
  readonly productId: string;
  readonly quantity: number;
  readonly updatedAt: string;
}
