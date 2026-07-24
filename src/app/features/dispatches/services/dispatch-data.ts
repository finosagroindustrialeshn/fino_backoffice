import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';

import { ApiClient, type QueryParams } from '../../../core/http/api-client';
import type {
  Paginated,
  PaginationQuery,
} from '../../../core/http/pagination.model';
import type {
  CreateDispatchPayload,
  Dispatch,
  DispatchStatus,
  DispatchSummary,
  SellerStock,
} from '../models/dispatch.model';

export interface DispatchListQuery extends PaginationQuery {
  readonly sellerId?: string;
  readonly status?: DispatchStatus;
  /** Filter by a single day, YYYY-MM-DD. */
  readonly date?: string;
  /** Range start (inclusive), YYYY-MM-DD. Takes precedence over `date`. */
  readonly dateFrom?: string;
  /** Range end (inclusive), YYYY-MM-DD. Takes precedence over `date`. */
  readonly dateTo?: string;
}

@Injectable({ providedIn: 'root' })
export class DispatchDataClient {
  private readonly api = inject(ApiClient);

  /** Note: list rows carry no `items` — fetch one with `get()` for those. */
  list(query?: DispatchListQuery): Observable<Paginated<DispatchSummary>> {
    const params: Record<string, string | number | boolean> = {};
    if (query?.page) {
      params['page'] = query.page;
    }
    if (query?.pageSize) {
      params['pageSize'] = query.pageSize;
    }
    if (query?.sellerId) {
      params['sellerId'] = query.sellerId;
    }
    if (query?.status) {
      params['status'] = query.status;
    }
    if (query?.date) {
      params['date'] = query.date;
    }
    if (query?.dateFrom) {
      params['dateFrom'] = query.dateFrom;
    }
    if (query?.dateTo) {
      params['dateTo'] = query.dateTo;
    }
    return this.api.get<Paginated<DispatchSummary>>(
      '/dispatches',
      params as QueryParams,
    );
  }

  get(id: string): Observable<Dispatch> {
    return this.api.get<Dispatch>(`/dispatches/${id}`);
  }

  create(payload: CreateDispatchPayload): Observable<Dispatch> {
    return this.api.post<Dispatch>('/dispatches', payload);
  }

  /** Reserves warehouse stock for the load (available -> committed). */
  assign(id: string): Observable<Dispatch> {
    return this.api.post<Dispatch>(`/dispatches/${id}/assign`);
  }

  /** Hands the reserved load over to the seller (committed -> seller stock). */
  receive(id: string): Observable<Dispatch> {
    return this.api.post<Dispatch>(`/dispatches/${id}/receive`);
  }

  confirm(id: string): Observable<Dispatch> {
    return this.api.post<Dispatch>(`/dispatches/${id}/confirm`);
  }

  cancel(id: string): Observable<Dispatch> {
    return this.api.post<Dispatch>(`/dispatches/${id}/cancel`);
  }

  /** What a given seller currently carries (ADMIN/SUPERVISOR). */
  sellerStock(sellerId: string): Observable<SellerStock[]> {
    return this.api.get<SellerStock[]>(`/seller-stock/${sellerId}`);
  }
}
