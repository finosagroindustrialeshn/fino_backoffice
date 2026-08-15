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

/**
 * A single product line inside a return.
 *
 * While the return is DRAFT the whole quantity sits in `quantityReturned` and
 * `quantityMerma` is 0 — the seller declares what they carry, not what is
 * damaged. The split is decided by the back office at confirm time.
 */
export interface ReturnItem {
  readonly id: string;
  readonly productId: string;
  /** Units going back to the warehouse as good stock. */
  readonly quantityReturned: number;
  /** Units written off. Always 0 until the return is confirmed. */
  readonly quantityMerma: number;
  /** Merma reason (return_reasons catalog), or null. */
  readonly reasonId: string | null;
  /**
   * The seller marked this product as coming back with a problem. A hint for
   * whoever counts it — it classifies nothing and moves no stock.
   */
  readonly flaggedBySeller: boolean;
  /** What the seller said about this product, in their own words. */
  readonly sellerNote: string | null;
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
  /**
   * Who DECLARED the return — normally the seller, or a back-office user when
   * they generated it for a seller who never did.
   */
  readonly createdById: string | null;
  /** Who VERIFIED it. Null while the return is still pending. */
  readonly confirmedById: string | null;
  readonly confirmedAt: string | null;
  /** The jornada this return settles. */
  readonly shiftId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** A single return with its lines, as documented by `GET /returns/{id}`. */
export interface ReturnDetail extends Return {
  readonly items: readonly ReturnItem[];
}

/** A product the seller hands back with a problem. Carries no quantity. */
export interface ReturnFlagInput {
  readonly productId: string;
  /** What the seller says about this product, in their own words. */
  readonly note?: string;
}

/**
 * Generating a return on a seller's behalf. No quantities and no products
 * travel: the API computes the lines from the seller's live carried stock for
 * every product the shift received. Merma is not decided here.
 */
export interface CreateReturnPayload {
  /** Work shift (jornada) being reconciled. */
  readonly shiftId: string;
  readonly flags?: readonly ReturnFlagInput[];
  readonly notes?: string;
}

/**
 * A product that does NOT go back to the warehouse intact. Whatever is left of
 * the line after the write-off returns to stock — the line's total is never
 * changed, only its destination.
 */
export interface ReturnIncidentInput {
  readonly productId: string;
  /** Units written off. Cannot exceed what the seller declared for it. */
  readonly quantityMerma: number;
  /** Merma reason (return_reasons catalog). Required. */
  readonly reasonId: string;
}

/** Omit `incidents` to accept the whole return as clean surplus. */
export interface ConfirmReturnPayload {
  readonly incidents?: readonly ReturnIncidentInput[];
}
