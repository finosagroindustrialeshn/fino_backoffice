import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';

import { ApiClient, type QueryParams } from '../../../../core/http/api-client';
import type {
  Paginated,
  PaginationQuery,
} from '../../../../core/http/pagination.model';
import type { ReturnReason } from '../models/return-reason.model';

export interface ReturnReasonInput {
  readonly name: string;
  readonly description: string;
  readonly sortOrder: number;
}

@Injectable({ providedIn: 'root' })
export class ReturnReasonDataClient {
  private readonly api = inject(ApiClient);

  list(
    query: PaginationQuery & { readonly includeInactive?: boolean },
  ): Observable<Paginated<ReturnReason>> {
    const params: Record<string, string | number | boolean> = {};
    if (query.page) {
      params['page'] = query.page;
    }
    if (query.pageSize) {
      params['pageSize'] = query.pageSize;
    }
    if (query.includeInactive) {
      params['includeInactive'] = true;
    }
    return this.api.get<Paginated<ReturnReason>>(
      '/return-reasons',
      params as QueryParams,
    );
  }

  create(dto: ReturnReasonInput): Observable<ReturnReason> {
    return this.api.post<ReturnReason>('/return-reasons', dto);
  }

  update(id: string, dto: ReturnReasonInput): Observable<ReturnReason> {
    return this.api.patch<ReturnReason>(`/return-reasons/${id}`, dto);
  }

  activate(id: string): Observable<ReturnReason> {
    return this.api.patch<ReturnReason>(`/return-reasons/${id}/activate`);
  }

  deactivate(id: string): Observable<ReturnReason> {
    return this.api.patch<ReturnReason>(`/return-reasons/${id}/deactivate`);
  }

  remove(id: string): Observable<void> {
    return this.api.delete(`/return-reasons/${id}`);
  }
}
