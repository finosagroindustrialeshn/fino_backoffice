import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';

import { ApiClient, type QueryParams } from '../../../core/http/api-client';
import type {
  Paginated,
  PaginationQuery,
} from '../../../core/http/pagination.model';
import type { Client, ClientPayload } from '../models/client.model';

@Injectable({ providedIn: 'root' })
export class ClientDataClient {
  private readonly api = inject(ApiClient);

  list(query: PaginationQuery): Observable<Paginated<Client>> {
    const params: Record<string, string | number | boolean> = {};
    if (query.page) {
      params['page'] = query.page;
    }
    if (query.pageSize) {
      params['pageSize'] = query.pageSize;
    }
    return this.api.get<Paginated<Client>>('/clients', params as QueryParams);
  }

  get(id: string): Observable<Client> {
    return this.api.get<Client>(`/clients/${id}`);
  }

  create(dto: ClientPayload): Observable<Client> {
    return this.api.post<Client>('/clients', dto);
  }

  update(id: string, dto: Partial<ClientPayload>): Observable<Client> {
    return this.api.patch<Client>(`/clients/${id}`, dto);
  }

  setActive(id: string, isActive: boolean): Observable<Client> {
    return this.api.patch<Client>(`/clients/${id}`, { isActive });
  }

  remove(id: string): Observable<void> {
    return this.api.delete(`/clients/${id}`);
  }
}
