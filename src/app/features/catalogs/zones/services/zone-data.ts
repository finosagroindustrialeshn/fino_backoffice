import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';

import { ApiClient, type QueryParams } from '../../../../core/http/api-client';
import type {
  Paginated,
  PaginationQuery,
} from '../../../../core/http/pagination.model';
import type { Zone, ZonePayload } from '../models/zone.model';

@Injectable({ providedIn: 'root' })
export class ZoneDataClient {
  private readonly api = inject(ApiClient);

  list(
    query: PaginationQuery & { readonly includeInactive?: boolean },
  ): Observable<Paginated<Zone>> {
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
    return this.api.get<Paginated<Zone>>('/zones', params as QueryParams);
  }

  create(dto: ZonePayload): Observable<Zone> {
    return this.api.post<Zone>('/zones', dto);
  }

  update(id: string, dto: ZonePayload): Observable<Zone> {
    return this.api.patch<Zone>(`/zones/${id}`, dto);
  }

  activate(id: string): Observable<Zone> {
    return this.api.patch<Zone>(`/zones/${id}/activate`);
  }

  deactivate(id: string): Observable<Zone> {
    return this.api.patch<Zone>(`/zones/${id}/deactivate`);
  }

  remove(id: string): Observable<void> {
    return this.api.delete(`/zones/${id}`);
  }
}
