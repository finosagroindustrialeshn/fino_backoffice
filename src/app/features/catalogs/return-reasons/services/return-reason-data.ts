import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';

import { ApiClient, type QueryParams } from '../../../../core/http/api-client';
import type { ReturnReason } from '../models/return-reason.model';

export interface ReturnReasonInput {
  readonly code: string;
  readonly name: string;
  readonly description: string;
  readonly sortOrder: number;
}

@Injectable({ providedIn: 'root' })
export class ReturnReasonDataClient {
  private readonly api = inject(ApiClient);

  list(includeInactive?: boolean): Observable<ReturnReason[]> {
    const params: Record<string, boolean> = {};
    if (includeInactive) {
      params['includeInactive'] = true;
    }
    return this.api.get<ReturnReason[]>(
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
