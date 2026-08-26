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
  /**
   * Product name as of the dispatch, denormalized by the API. Optional
   * because the spec does not mark it required; fall back to a lookup by
   * `productId` when it is absent.
   */
  readonly productName?: string;
  readonly productImageUrl?: string | null;
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
  /**
   * Number of the delivery order (orden de entrega) the load travels with.
   * Null ONLY on dispatches created before the API required it — every one
   * created since carries a number, unique across dispatches.
   */
  readonly deliveryOrderNumber: number | null;
  readonly notes: string | null;
  readonly createdById: string | null;
  /**
   * Why the dispatch was cancelled, in the canceller's own words. Always set
   * when a seller declined an ASSIGNED load; null on anything not cancelled.
   * Read together with `cancelledById`: the same text means something
   * different coming from the seller than from the back office.
   */
  readonly cancelReason: string | null;
  readonly cancelledById: string | null;
  readonly cancelledAt: string | null;
  /**
   * Total product lines the dispatch has. Sent by the LIST endpoint only —
   * on a single dispatch, count `items` instead.
   */
  readonly itemsCount?: number;
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
  /**
   * Number of the physical delivery order this load travels with. Required,
   * an integer >= 1, and UNIQUE across dispatches: it is the reference back
   * to the paper, and two dispatches sharing one leave nobody able to say
   * which load the document describes. A number already in use answers
   * DISPATCH_ORDER_NUMBER_TAKEN — resubmitting the same value cannot work.
   */
  readonly deliveryOrderNumber: number;
  readonly items: readonly DispatchItemInput[];
  readonly notes?: string;
}

/** Lower bound the API enforces on `deliveryOrderNumber`. */
export const MIN_DELIVERY_ORDER_NUMBER = 1;

/** Bounds the API enforces on a cancellation reason. */
export const MIN_CANCEL_REASON_LENGTH = 5;
export const MAX_CANCEL_REASON_LENGTH = 500;

export interface CancelDispatchPayload {
  /**
   * Required once the dispatch is ASSIGNED: from that point a cancellation is
   * one party refusing another's load, and the written reason is the record
   * of why. Optional while still DRAFT, which is the back office discarding
   * its own unassigned work.
   */
  readonly reason?: string;
}

/** What a seller currently carries, per product. */
export interface SellerStock {
  readonly sellerId: string;
  readonly productId: string;
  readonly quantity: number;
  readonly updatedAt: string;
}
