import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';

import { ApiClient } from '../../../core/http/api-client';
import type {
  Paginated,
  PaginationQuery,
} from '../../../core/http/pagination.model';
import { toQueryParams } from '../../../core/http/query-params';
import type {
  Employee,
  EmployeePayload,
  EmploymentStatus,
} from '../models/employee.model';

export interface EmployeeListQuery extends PaginationQuery {
  /** Free-text search over name, employee code and national ID. */
  readonly search?: string;
  readonly status?: EmploymentStatus;
  readonly positionId?: string;
}

/** HR employees. Reads need ADMIN or ACCOUNTANT, writes need ADMIN. */
@Injectable({ providedIn: 'root' })
export class EmployeeDataClient {
  private readonly api = inject(ApiClient);

  list(query?: EmployeeListQuery): Observable<Paginated<Employee>> {
    return this.api.get<Paginated<Employee>>(
      '/employees',
      toQueryParams({ ...query }),
    );
  }

  get(id: string): Observable<Employee> {
    return this.api.get<Employee>(`/employees/${id}`);
  }

  create(payload: EmployeePayload): Observable<Employee> {
    return this.api.post<Employee>('/employees', payload);
  }

  update(id: string, payload: Partial<EmployeePayload>): Observable<Employee> {
    return this.api.patch<Employee>(`/employees/${id}`, payload);
  }

  remove(id: string): Observable<void> {
    return this.api.delete(`/employees/${id}`);
  }
}
