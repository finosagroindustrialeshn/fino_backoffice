export type DispatchStatus = 'DRAFT' | 'CONFIRMED' | 'CANCELLED';

export const DISPATCH_STATUS_LABELS: Record<DispatchStatus, string> = {
  DRAFT: 'Borrador',
  CONFIRMED: 'Confirmado',
  CANCELLED: 'Cancelado',
};

export const DISPATCH_STATUS_SEVERITY: Record<
  DispatchStatus,
  'secondary' | 'success' | 'danger'
> = {
  DRAFT: 'secondary',
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

/** A load assembled for a seller. Stock only moves once it is CONFIRMED. */
export interface Dispatch {
  readonly id: string;
  readonly sellerId: string;
  /** Dispatch day (ISO 8601 UTC). */
  readonly date: string;
  readonly status: DispatchStatus;
  readonly notes: string | null;
  readonly items: readonly DispatchItem[];
  readonly createdById: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
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
