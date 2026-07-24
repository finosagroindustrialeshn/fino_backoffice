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

  /** Records an abono against a CREDIT sale and returns the updated sale. */
  addPayment(
    id: string,
    payload: CreateSalePaymentPayload,
  ): Observable<Sale> {
    return this.api.post<Sale>(`/sales/${id}/payments`, payload);
  }
}
