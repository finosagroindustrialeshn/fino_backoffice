import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';

import { ApiClient } from '../../../core/http/api-client';
import type {
  Paginated,
  PaginationQuery,
} from '../../../core/http/pagination.model';
import { toQueryParams } from '../../../core/http/query-params';
import type {
  CreateSalePayload,
  CreateSalePaymentPayload,
  PaymentType,
  Sale,
  SaleChannel,
  SalePayment,
  SaleStatus,
} from '../models/sale.model';

export interface SaleListQuery extends PaginationQuery {
  readonly channel?: SaleChannel;
  readonly shiftId?: string;
  readonly cashSessionId?: string;
  readonly sellerId?: string;
  readonly clientId?: string;
  /**
   * The sales that closed a stop of this route. Reproduces the
   * salesCount / salesAmount of the route compliance report.
   */
  readonly routeId?: string;
  /** A single visit — the sales made at that stop. */
  readonly routeStopId?: string;
  /**
   * Sales carrying at least one line for this product. Row totals stay the
   * WHOLE sale, not the product's share of it, so these figures do NOT add up
   * to the product's revenue in the by-product report.
   */
  readonly productId?: string;
  readonly paymentType?: PaymentType;
  readonly status?: SaleStatus;
  /** Single day; superseded by dateFrom/dateTo when those are present. */
  readonly date?: string;
  readonly dateFrom?: string;
  readonly dateTo?: string;
}

@Injectable({ providedIn: 'root' })
export class SaleDataClient {
  private readonly api = inject(ApiClient);

  list(query: SaleListQuery): Observable<Paginated<Sale>> {
    return this.api.get<Paginated<Sale>>('/sales', toQueryParams({ ...query }));
  }

  get(id: string): Observable<Sale> {
    return this.api.get<Sale>(`/sales/${id}`);
  }

  /**
   * Registers a sale. A STORE sale needs the caller to have an open cash
   * session; the API derives the till from auth, never from the payload.
   */
  create(payload: CreateSalePayload): Observable<Sale> {
    return this.api.post<Sale>('/sales', payload);
  }

  payments(id: string): Observable<readonly SalePayment[]> {
    return this.api.get<readonly SalePayment[]>(`/sales/${id}/payments`);
  }

  /**
   * Records an abono against a CREDIT sale and returns the updated sale.
   *
   * `idempotencyKey` is required, not optional: a retried abono after a lost
   * response is money counted twice against the balance, and afterwards it is
   * indistinguishable from a legitimate second part-payment. Callers must hold
   * the same key across retries of the same collection and mint a new one only
   * when the amount changes.
   */
  addPayment(
    id: string,
    payload: CreateSalePaymentPayload,
    idempotencyKey: string,
  ): Observable<Sale> {
    return this.api.post<Sale>(`/sales/${id}/payments`, payload, {
      idempotencyKey,
    });
  }
}
