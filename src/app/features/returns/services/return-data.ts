import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';

import { ApiClient, type QueryParams } from '../../../core/http/api-client';
import type {
  Paginated,
  PaginationQuery,
} from '../../../core/http/pagination.model';
import type {
  CreateReturnPayload,
  Return,
  ReturnStatus,
} from '../models/return.model';

export interface ReturnListQuery extends PaginationQuery {
  readonly sellerId?: string;
  readonly status?: ReturnStatus;
  /** Filter by a single day, YYYY-MM-DD. */
  readonly date?: string;
  /** Range start (inclusive), YYYY-MM-DD. Takes precedence over `date`. */
  readonly dateFrom?: string;
  /** Range end (inclusive), YYYY-MM-DD. Takes precedence over `date`. */
  readonly dateTo?: string;
}

@Injectable({ providedIn: 'root' })
export class ReturnDataClient {
  private readonly api = inject(ApiClient);

  list(query?: ReturnListQuery): Observable<Paginated<Return>> {
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
    return this.api.get<Paginated<Return>>('/returns', params as QueryParams);
  }

  get(id: string): Observable<Return> {
    return this.api.get<Return>(`/returns/${id}`);
  }

  create(payload: CreateReturnPayload): Observable<Return> {
    return this.api.post<Return>('/returns', payload);
  }

  confirm(id: string): Observable<Return> {
    return this.api.post<Return>(`/returns/${id}/confirm`);
  }

  cancel(id: string): Observable<Return> {
    return this.api.post<Return>(`/returns/${id}/cancel`);
  }
}
