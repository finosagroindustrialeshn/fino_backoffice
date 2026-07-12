import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';

import { ApiClient, type QueryParams } from '../../../../core/http/api-client';
import type { Zone, ZonePayload } from '../models/zone.model';

@Injectable({ providedIn: 'root' })
export class ZoneDataClient {
  private readonly api = inject(ApiClient);

  list(includeInactive?: boolean): Observable<Zone[]> {
    const params: Record<string, boolean> = {};
    if (includeInactive) {
      params['includeInactive'] = true;
    }
    return this.api.get<Zone[]>('/zones', params as QueryParams);
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
