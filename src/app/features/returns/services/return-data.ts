import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';

import { ApiClient } from '../../../core/http/api-client';
import type {
  Paginated,
  PaginationQuery,
} from '../../../core/http/pagination.model';
import { toQueryParams } from '../../../core/http/query-params';
import type {
  ConfirmReturnPayload,
  CreateReturnPayload,
  Return,
  ReturnDetail,
  ReturnStatus,
  ReturnSummary,
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

  list(query?: ReturnListQuery): Observable<Paginated<ReturnSummary>> {
    return this.api.get<Paginated<ReturnSummary>>(
      '/returns',
      toQueryParams({ ...query }),
    );
  }

  /** The only endpoint documented to carry the line items. */
  get(id: string): Observable<ReturnDetail> {
    return this.api.get<ReturnDetail>(`/returns/${id}`);
  }

  /**
   * Generates the draft return reconciling a shift, for a seller who left
   * without handing anything in. The lines come from their live carried stock
   * — nothing is typed, and no stock moves until the return is confirmed.
   */
  create(payload: CreateReturnPayload): Observable<Return> {
    return this.api.post<Return>('/returns', payload);
  }

  /**
   * Verifies the return and decides what goes back to inventory. Each incident
   * writes off part of a product; whatever is left of that line returns to the
   * warehouse. Sending none accepts the whole return as clean surplus.
   *
   * Typed as `Return` rather than `ReturnDetail` because the spec does not
   * promise the lines back — callers that need them refetch through `get()`
   * instead of trusting a shape that may not arrive.
   */
  confirm(id: string, payload?: ConfirmReturnPayload): Observable<Return> {
    return this.api.post<Return>(`/returns/${id}/confirm`, payload ?? {});
  }

  cancel(id: string): Observable<Return> {
    return this.api.post<Return>(`/returns/${id}/cancel`);
  }
}
