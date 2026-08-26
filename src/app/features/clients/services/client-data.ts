import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';

import { ApiClient, type QueryParams } from '../../../core/http/api-client';
import type {
  Paginated,
  PaginationQuery,
  SortOrder,
} from '../../../core/http/pagination.model';
import type {
  Client,
  ClientDetail,
  ClientPayload,
} from '../models/client.model';

/** Fields the API can sort the client list by. */
export type ClientSortBy = 'name' | 'createdAt';

export interface ClientListQuery extends PaginationQuery {
  /**
   * Case-insensitive search over code, name, contact, phone and address.
   * A client code (CLI-0042) is matched first, so it wins over addresses
   * that merely contain the same digits.
   */
  readonly search?: string;
  /** Filter by the seller who registered the client (audit trail). */
  readonly createdById?: string;
  /** Filter by the seller who owns the client. Ignored by the API for a SELLER. */
  readonly assignedSellerId?: string;
  /**
   * Filter by the preseller who owns the client — the second, independent
   * client book. Applied by the API only when `assignedSellerId` and
   * `unassignedOnly` are both absent.
   */
  readonly assignedPresellerId?: string;
  /**
   * Only clients with no SELLER assigned yet. A preseller having already
   * claimed a client does not make it assigned in this sense. Takes
   * precedence over both `assignedSellerId` and `assignedPresellerId`.
   */
  readonly unassignedOnly?: boolean;
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
    if (query.assignedSellerId) {
      params['assignedSellerId'] = query.assignedSellerId;
    }
    if (query.assignedPresellerId) {
      params['assignedPresellerId'] = query.assignedPresellerId;
    }
    if (query.unassignedOnly) {
      params['unassignedOnly'] = true;
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

  /** Not scoped to the caller's cartera — any client can be opened by id. */
  get(id: string): Observable<ClientDetail> {
    return this.api.get<ClientDetail>(`/clients/${id}`);
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
