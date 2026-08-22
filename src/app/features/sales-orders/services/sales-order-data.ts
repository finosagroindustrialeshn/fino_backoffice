import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';

import { ApiClient } from '../../../core/http/api-client';
import type {
  Paginated,
  PaginationQuery,
} from '../../../core/http/pagination.model';
import { toQueryParams } from '../../../core/http/query-params';
import type {
  CreateSalesOrderPayload,
  SalesOrder,
  SalesOrderListItem,
  SalesOrderStatus,
  UpdateSalesOrderPayload,
} from '../models/sales-order.model';

/**
 * Listing order.
 *
 * `oldest` works the queue by AGE — with `status=PLACED` it puts first the
 * client who was promised something longest ago. `delivery` works it by NEED:
 * soonest `expectedDeliveryDate` first, orders with no date last.
 */
export type SalesOrderSort = 'newest' | 'oldest' | 'delivery';

export interface SalesOrderListQuery extends PaginationQuery {
  /**
   * Case-insensitive over the order code, the client code and the client
   * name. The order code is matched first — a client phoning about SO-0042
   * is the reason the code exists at all.
   */
  readonly search?: string;
  readonly status?: SalesOrderStatus;
  /** The preventista who took the order. Ignored by the API for a preventista. */
  readonly takenById?: string;
  /** The seller expected to deliver. Ignored by the API for a seller. */
  readonly assignedToId?: string;
  readonly clientId?: string;
  /** Everything except CONVERTED and CANCELLED. Overrides `status`. */
  readonly openOnly?: boolean;
  /** Orders nobody currently holds — never assigned, or handed back. */
  readonly unassignedOnly?: boolean;
  /** Open orders whose promised day has already gone by. */
  readonly overdueOnly?: boolean;
  /** Single day; superseded by dateFrom/dateTo when those are present. */
  readonly date?: string;
  readonly dateFrom?: string;
  readonly dateTo?: string;
  readonly sort?: SalesOrderSort;
}

@Injectable({ providedIn: 'root' })
export class SalesOrderDataClient {
  private readonly api = inject(ApiClient);

  list(query: SalesOrderListQuery): Observable<Paginated<SalesOrderListItem>> {
    return this.api.get<Paginated<SalesOrderListItem>>(
      '/sales-orders',
      toQueryParams({ ...query }),
    );
  }

  get(id: string): Observable<SalesOrder> {
    return this.api.get<SalesOrder>(`/sales-orders/${id}`);
  }

  /**
   * Takes an order. Nothing moves: no stock is reserved and no money is owed.
   *
   * A PREVENTISTA needs an open shift (409 SHIFT_REQUIRED otherwise);
   * ADMIN/SUPERVISOR do not, because an order taken over the phone is not
   * field work.
   *
   * `idempotencyKey` is required by this method, not optional as in the API:
   * a request lost on a bad rural connection is indistinguishable from one
   * that never arrived, and retrying without a key promises the same client
   * the same thing twice. Callers hold one key across retries of the same
   * order and mint a new one only when the payload changes.
   */
  create(
    payload: CreateSalesOrderPayload,
    idempotencyKey: string,
  ): Observable<SalesOrder> {
    return this.api.post<SalesOrder>('/sales-orders', payload, {
      idempotencyKey,
    });
  }

  /**
   * Corrects an order that is still open, keeping its SO- code.
   *
   * `items` is the WHOLE set of lines, never a patch — omit it to leave them
   * untouched, and always carry `unitPriceRef` forward on the lines you do
   * send or the API defaults them back to the catalog price.
   */
  update(id: string, payload: UpdateSalesOrderPayload): Observable<SalesOrder> {
    return this.api.patch<SalesOrder>(`/sales-orders/${id}`, payload);
  }

  /** DRAFT to PLACED. From here the preventista can no longer edit it. */
  place(id: string): Observable<SalesOrder> {
    return this.api.post<SalesOrder>(`/sales-orders/${id}/place`);
  }

  /**
   * Names the seller who will deliver it — first assignment and reassignment
   * are the same call. Sending the seller who already holds it is a no-op,
   * not a conflict, which is the shape an offline retry takes.
   *
   * Does NOT hand the client's cartera over: assigning one order is not a
   * reason to reassign the client permanently.
   */
  assign(id: string, sellerId: string): Observable<SalesOrder> {
    return this.api.post<SalesOrder>(`/sales-orders/${id}/assign`, { sellerId });
  }

  /**
   * Hands the order back to the queue, keeping the client's promise alive.
   *
   * `reason` is ALWAYS required — the next assignee has to know whether the
   * obstacle was the seller, the route or the client.
   */
  unassign(id: string, reason: string): Observable<SalesOrder> {
    return this.api.post<SalesOrder>(`/sales-orders/${id}/unassign`, { reason });
  }

  /** `reason` is required by the API once the order has been placed. */
  cancel(id: string, reason?: string): Observable<SalesOrder> {
    return this.api.post<SalesOrder>(`/sales-orders/${id}/cancel`, { reason });
  }
}
