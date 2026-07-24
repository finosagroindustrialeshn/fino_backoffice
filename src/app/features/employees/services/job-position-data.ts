import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';

import { ApiClient } from '../../../core/http/api-client';
import type {
  Paginated,
  PaginationQuery,
} from '../../../core/http/pagination.model';
import { toQueryParams } from '../../../core/http/query-params';
import type {
  JobPosition,
  JobPositionInput,
} from '../models/job-position.model';

export interface JobPositionListQuery extends PaginationQuery {
  /** Include deactivated positions. Default: only active ones. */
  readonly includeInactive?: boolean;
}

/** Job positions (puestos). Reads need ADMIN or ACCOUNTANT, writes need ADMIN. */
@Injectable({ providedIn: 'root' })
export class JobPositionDataClient {
  private readonly api = inject(ApiClient);

  list(query?: JobPositionListQuery): Observable<Paginated<JobPosition>> {
    // `includeInactive` is only sent when true — a literal `false` in the query
    // string is a coercion hazard server-side, and omitting it means the same.
    return this.api.get<Paginated<JobPosition>>(
      '/job-positions',
      toQueryParams({
        page: query?.page,
        pageSize: query?.pageSize,
        includeInactive: query?.includeInactive ? true : undefined,
      }),
    );
  }

  get(id: string): Observable<JobPosition> {
    return this.api.get<JobPosition>(`/job-positions/${id}`);
  }

  create(dto: JobPositionInput): Observable<JobPosition> {
    return this.api.post<JobPosition>('/job-positions', dto);
  }

  update(id: string, dto: Partial<JobPositionInput>): Observable<JobPosition> {
    return this.api.patch<JobPosition>(`/job-positions/${id}`, dto);
  }

  activate(id: string): Observable<JobPosition> {
    return this.api.patch<JobPosition>(`/job-positions/${id}/activate`);
  }

  deactivate(id: string): Observable<JobPosition> {
    return this.api.patch<JobPosition>(`/job-positions/${id}/deactivate`);
  }

  remove(id: string): Observable<void> {
    return this.api.delete(`/job-positions/${id}`);
  }
}
