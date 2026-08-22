import type { Role } from '../../../core/auth/user-profile.model';

/**
 * Lifecycle of a pre-sale order (pedido de preventa).
 *
 * DRAFT is the preventista's own notebook; PLACED hands it to the back
 * office; ASSIGNED names the seller who will deliver it. The two CONVERTED
 * states are never set by hand — `POST /sales` with a `salesOrderId` advances
 * the lines and moves the order on its own.
 */
export type SalesOrderStatus =
  | 'DRAFT'
  | 'PLACED'
  | 'ASSIGNED'
  | 'PARTIALLY_CONVERTED'
  | 'CONVERTED'
  | 'CANCELLED';

/** A person named on the order, resolved by the API. */
export interface SalesOrderPerson {
  readonly id: string;
  readonly fullName: string;
}

/** The client the order was promised to, with everything needed to visit them. */
export interface SalesOrderClient {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly contactName: string | null;
  readonly phone: string | null;
  readonly address: string | null;
  /** Storefront photo. */
  readonly imageUrl: string | null;
  readonly latitude: number;
  readonly longitude: number;
}

export interface SalesOrderItem {
  readonly productId: string;
  readonly productName: string;
  readonly productSku: string;
  readonly productImageUrl: string | null;
  /** Units the client asked for. */
  readonly quantity: number;
  /** Units already sold against this line. */
  readonly quantityFulfilled: number;
  /** quantity - quantityFulfilled. What is still owed. */
  readonly quantityPending: number;
  /** Price quoted when the order was taken. A reference, not a receivable. */
  readonly unitPriceRef: number;
  /** quantity * unitPriceRef. */
  readonly lineTotal: number;
}

/** One line of a sale that was applied against this order. */
export interface FulfillmentSaleItem {
  readonly productId: string;
  readonly productName: string;
  readonly productSku: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly subtotal: number;
}

/**
 * A sale that settled part (or all) of this order. This is where the promise
 * actually turned into product in the client's hands — and where the price
 * that BINDS lives, as opposed to the `unitPriceRef` that was only quoted.
 */
export interface SalesOrderFulfillment {
  readonly saleId: string;
  readonly status: 'PAID' | 'PARTIAL' | 'PENDING';
  readonly paymentType: 'CASH' | 'CREDIT';
  readonly total: number;
  /** Collected so far. */
  readonly amountPaid: number;
  /** total - amountPaid. */
  readonly balanceDue: number;
  /** When the sale was made. */
  readonly soldAt: string;
  /** When the sale was tied to this order — usually the same moment. */
  readonly linkedAt: string;
  readonly seller: SalesOrderPerson;
  readonly items: readonly FulfillmentSaleItem[];
}

/**
 * One order with its lines, as returned by `GET /sales-orders/:id`.
 *
 * Fully resolved by the API: names, per-line product data and the unit totals
 * all arrive joined, so no screen has to look anything up or do the
 * subtraction itself.
 */
export interface SalesOrder {
  readonly id: string;
  /** Human-readable label the client was given (SO-0042). */
  readonly code: string;
  readonly status: SalesOrderStatus;
  readonly clientId: string;
  readonly client: SalesOrderClient;
  /** Preventista who took it. */
  readonly takenById: string;
  readonly takenBy: SalesOrderPerson;
  /** Seller expected to deliver it, or null while nobody owns it yet. */
  readonly assignedToId: string | null;
  readonly assignedTo: SalesOrderPerson | null;
  readonly assignedById: string | null;
  readonly assignedAt: string | null;
  /** Why the last assignee handed it back. Cleared on the next assignment. */
  readonly unassignReason: string | null;
  readonly unassignedById: string | null;
  readonly unassignedAt: string | null;
  /** The preventista's shift the order was stamped with, if any. */
  readonly shiftId: string | null;
  /** Sum of quantity * unitPriceRef. Planning only; nothing is owed yet. */
  readonly estimatedTotal: number;
  /** The day the client asked for it (YYYY-MM-DD), or null if none was named. */
  readonly expectedDeliveryDate: string | null;
  readonly notes: string | null;
  readonly cancelReason: string | null;
  readonly cancelledById: string | null;
  readonly cancelledAt: string | null;
  /** Distinct product lines. */
  readonly lineCount: number;
  readonly unitsOrdered: number;
  readonly unitsFulfilled: number;
  /** Units the client is still owed. Computed server-side. */
  readonly unitsPending: number;
  readonly items: readonly SalesOrderItem[];
  /** The sales that covered this order, newest last. */
  readonly fulfillments: readonly SalesOrderFulfillment[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** A product line as summarized inside a list row. */
export interface SalesOrderListProduct {
  readonly name: string;
  readonly sku: string;
  readonly quantity: number;
  readonly quantityFulfilled: number;
  readonly quantityPending: number;
}

/**
 * A row of `GET /sales-orders`. Arrives already joined: names, unit totals
 * and the ordered products come with it, so the table draws a complete row
 * without a single extra lookup.
 */
export interface SalesOrderListItem {
  readonly id: string;
  readonly code: string;
  readonly status: SalesOrderStatus;
  readonly clientName: string;
  readonly clientCode: string;
  readonly takenByName: string;
  readonly assignedToName: string | null;
  /** Distinct product lines. */
  readonly lineCount: number;
  readonly unitsOrdered: number;
  readonly unitsFulfilled: number;
  readonly estimatedTotal: number;
  readonly expectedDeliveryDate: string | null;
  readonly createdAt: string;
  readonly products: readonly SalesOrderListProduct[];
}

/** A line as sent to the API on create and update. */
export interface SalesOrderLineInput {
  readonly productId: string;
  readonly quantity: number;
  /** Omitted means the catalog price. Always send it when correcting an
   *  existing order, or a negotiated price is silently overwritten. */
  readonly unitPriceRef?: number;
}

export interface CreateSalesOrderPayload {
  readonly clientId: string;
  /** YYYY-MM-DD. Optional: plenty of clients just say "cuando pasen". */
  readonly expectedDeliveryDate?: string;
  readonly notes?: string;
  readonly items: readonly SalesOrderLineInput[];
}

export interface UpdateSalesOrderPayload {
  /** The WHOLE set of lines, not a patch. Omit to leave the lines alone. */
  readonly items?: readonly SalesOrderLineInput[];
  /** Explicit null clears the date. */
  readonly expectedDeliveryDate?: string | null;
  readonly notes?: string;
}

export const SALES_ORDER_STATUS_LABELS: Record<SalesOrderStatus, string> = {
  DRAFT: 'Borrador',
  PLACED: 'Ingresado',
  ASSIGNED: 'Asignado',
  PARTIALLY_CONVERTED: 'Entrega parcial',
  CONVERTED: 'Entregado',
  CANCELLED: 'Cancelado',
};

export type SalesOrderTagSeverity =
  | 'secondary'
  | 'warn'
  | 'info'
  | 'success'
  | 'danger';

/**
 * PLACED is `warn` rather than `info`: a placed order is a promise nobody has
 * picked up yet, and the queue exists precisely to make that visible.
 */
export const SALES_ORDER_STATUS_SEVERITY: Record<
  SalesOrderStatus,
  SalesOrderTagSeverity
> = {
  DRAFT: 'secondary',
  PLACED: 'warn',
  ASSIGNED: 'info',
  PARTIALLY_CONVERTED: 'info',
  CONVERTED: 'success',
  CANCELLED: 'danger',
};

/** CONVERTED and CANCELLED are history — editing either would rewrite it. */
export function isOrderClosed(status: SalesOrderStatus): boolean {
  return status === 'CONVERTED' || status === 'CANCELLED';
}

/**
 * Who may correct an order, and until when.
 *
 * The back office fields the call that changes an order, so it may correct
 * anything still open. A preventista may only fix their OWN draft: handing it
 * in is the point of no return, since from there the office plans around the
 * order and a seller may already be carrying it.
 */
export function canEditOrder(
  order: SalesOrder,
  role: Role | null,
  currentUserId: string | null,
): boolean {
  if (isOrderClosed(order.status)) {
    return false;
  }
  if (role === 'ADMIN' || role === 'SUPERVISOR') {
    return true;
  }
  if (role === 'PREVENTISTA') {
    return order.status === 'DRAFT' && order.takenById === currentUserId;
  }
  return false;
}

/** An empty draft cannot be handed in — the API answers SALES_ORDER_EMPTY. */
export function canPlaceOrder(order: SalesOrder): boolean {
  return order.status === 'DRAFT' && order.items.length > 0;
}

/**
 * Naming a seller is accepted from PLACED (the first assignment) and from
 * ASSIGNED or PARTIALLY_CONVERTED alike — reassigning is the SAME operation
 * aimed at somebody else, not a special case. A seller falls ill or leaves,
 * and the alternative to moving the order would be cancelling a promise the
 * client never withdrew.
 */
export function canAssignOrder(order: SalesOrder): boolean {
  return (
    order.status === 'PLACED' ||
    order.status === 'ASSIGNED' ||
    order.status === 'PARTIALLY_CONVERTED'
  );
}

/**
 * Handing the order back to the queue gives up the PERSON while keeping the
 * client's promise — the counterpart to assign, and deliberately not cancel.
 *
 * Needs somebody to hand it back FROM, so an order nobody holds cannot be
 * released. ASSIGNED returns to PLACED; PARTIALLY_CONVERTED stays put with
 * nobody assigned, because the delivered half is a fact, not a state to
 * rewind.
 */
export function canUnassignOrder(order: SalesOrder): boolean {
  if (order.assignedToId === null) {
    return false;
  }
  return order.status === 'ASSIGNED' || order.status === 'PARTIALLY_CONVERTED';
}

/**
 * A partially converted order can still be cancelled: the sale that already
 * happened stands on its own, and what dies is the promise of the remainder.
 */
export function canCancelOrder(order: SalesOrder): boolean {
  return !isOrderClosed(order.status);
}

/**
 * Past DRAFT, a cancellation is one party walking away from what another was
 * promised — without the sentence, a client who changed their mind reads
 * exactly like an order that was never real.
 */
export function isCancelReasonRequired(status: SalesOrderStatus): boolean {
  return status !== 'DRAFT';
}

/**
 * Turns stored lines into an editable payload, carrying `unitPriceRef`
 * forward. Dropping it would default the line back to the catalog price and
 * quietly undo whatever the preventista negotiated at the door.
 */
export function toLineInputs(order: SalesOrder): SalesOrderLineInput[] {
  return order.items.map((item) => ({
    productId: item.productId,
    quantity: item.quantity,
    unitPriceRef: item.unitPriceRef,
  }));
}

/**
 * True when the client was promised a day that has already gone by and the
 * order is still open. An order with no date is NEVER overdue — "cuando
 * pasen" cannot be late.
 *
 * `today` is passed in rather than read from the clock so the caller owns the
 * notion of "now" (and so this stays testable).
 */
export function isOverdue(order: SalesOrder, today: string): boolean {
  if (!order.expectedDeliveryDate || isOrderClosed(order.status)) {
    return false;
  }
  return order.expectedDeliveryDate < today;
}
