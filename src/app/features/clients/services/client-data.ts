import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';

import { ApiClient, type QueryParams } from '../../../core/http/api-client';
import type {
  Paginated,
  PaginationQuery,
  SortOrder,
} from '../../../core/http/pagination.model';
import type { Client, ClientPayload } from '../models/client.model';

/** Fields the API can sort the client list by. */
export type ClientSortBy = 'name' | 'createdAt';

export interface ClientListQuery extends PaginationQuery {
  /** Case-insensitive search over name, contact, phone and address. */
  readonly search?: string;
  /** Filter by the seller who registered the client. */
  readonly createdById?: string;
  readonly isActive?: boolean;
  readonly sortBy?: ClientSortBy;
  readonly sortOrder?: SortOrder;
}

@Injectable({ providedIn: 'root' })
export class ClientDataClient {
  private readonly api = inject(ApiClient);

  list(query: ClientListQuery): Observable<Paginated<Client>> {
    const params: Record<string, string | number | boolean> = {};
    if (query.page) {
      params['page'] = query.page;
    }
    if (query.pageSize) {
      params['pageSize'] = query.pageSize;
    }
    if (query.search) {
      params['search'] = query.search;
    }
    if (query.createdById) {
      params['createdById'] = query.createdById;
    }
    if (query.isActive !== undefined) {
      params['isActive'] = query.isActive;
    }
    if (query.sortBy) {
      params['sortBy'] = query.sortBy;
    }
    if (query.sortOrder) {
      params['sortOrder'] = query.sortOrder;
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
