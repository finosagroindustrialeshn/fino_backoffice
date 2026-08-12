export type ReturnStatus = 'DRAFT' | 'CONFIRMED' | 'CANCELLED';

export const RETURN_STATUS_LABELS: Record<ReturnStatus, string> = {
  DRAFT: 'Borrador',
  CONFIRMED: 'Confirmado',
  CANCELLED: 'Cancelado',
};

export const RETURN_STATUS_SEVERITY: Record<
  ReturnStatus,
  'secondary' | 'success' | 'danger'
> = {
  DRAFT: 'secondary',
  CONFIRMED: 'success',
  CANCELLED: 'danger',
};

/** A single product line inside a return. */
export interface ReturnItem {
  readonly id: string;
  readonly productId: string;
  /** Units returned to the warehouse (good stock). */
  readonly quantityReturned: number;
  /** Units lost (merma). */
  readonly quantityMerma: number;
  /** Merma reason (return_reasons catalog), or null. */
  readonly reasonId: string | null;
}

/**
 * Stock a seller hands back, as the list endpoint returns it. Stock only
 * moves once it is CONFIRMED.
 *
 * Carries NO line items: `GET /returns` returns the headers only. Declaring
 * them here anyway is what made the list blow up the first time it had rows
 * to render — the type promised an array that was never in the payload.
 */
export interface Return {
  readonly id: string;
  readonly sellerId: string;
  /** Return day (ISO 8601 UTC). */
  readonly date: string;
  readonly status: ReturnStatus;
  readonly notes: string | null;
  readonly createdById: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** A single return with its lines, as documented by `GET /returns/{id}`. */
export interface ReturnDetail extends Return {
  readonly items: readonly ReturnItem[];
}

/** A product line in the create payload. */
export interface ReturnItemInput {
  readonly productId: string;
  readonly quantityReturned: number;
  readonly quantityMerma: number;
  /** Required only when there is merma. */
  readonly reasonId?: string;
}

export interface CreateReturnPayload {
  readonly sellerId: string;
  /** Return day in YYYY-MM-DD (local calendar day, no time). */
  readonly date: string;
  readonly items: readonly ReturnItemInput[];
  readonly notes?: string;
}
