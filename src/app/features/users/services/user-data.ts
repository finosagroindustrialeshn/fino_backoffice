import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';

import { ApiClient, type QueryParams } from '../../../core/http/api-client';
import type {
  Paginated,
  PaginationQuery,
} from '../../../core/http/pagination.model';
import type { Role, UserProfile } from '../../../core/auth/user-profile.model';
import type { CreateUserPayload } from '../models/user-payload.model';

export interface UserListQuery extends PaginationQuery {
  readonly role?: Role;
  readonly includeInactive?: boolean;
}

@Injectable({ providedIn: 'root' })
export class UserDataClient {
  private readonly api = inject(ApiClient);

  list(query?: UserListQuery): Observable<Paginated<UserProfile>> {
    const params: Record<string, string | number | boolean> = {};
    if (query?.page) {
      params['page'] = query.page;
    }
    if (query?.pageSize) {
      params['pageSize'] = query.pageSize;
    }
    if (query?.role) {
      params['role'] = query.role;
    }
    if (query?.includeInactive) {
      params['includeInactive'] = true;
    }
    return this.api.get<Paginated<UserProfile>>('/users', params as QueryParams);
  }

  get(id: string): Observable<UserProfile> {
    return this.api.get<UserProfile>(`/users/${id}`);
  }

  create(payload: CreateUserPayload): Observable<UserProfile> {
    return this.api.post<UserProfile>('/users', payload);
  }

  activate(id: string): Observable<UserProfile> {
    return this.api.patch<UserProfile>(`/users/${id}/activate`);
  }

  deactivate(id: string): Observable<UserProfile> {
    return this.api.patch<UserProfile>(`/users/${id}/deactivate`);
  }

  updateRole(id: string, role: Role): Observable<UserProfile> {
    return this.api.patch<UserProfile>(`/users/${id}/role`, { role });
  }
}
