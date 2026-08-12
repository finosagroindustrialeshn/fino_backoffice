import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';

import { ApiClient } from '../../../core/http/api-client';
import type {
  Paginated,
  PaginationQuery,
} from '../../../core/http/pagination.model';
import { toQueryParams } from '../../../core/http/query-params';
import type { Expense } from '../models/expense.model';

export interface ExpenseListQuery extends PaginationQuery {
  readonly sellerId?: string;
  readonly shiftId?: string;
  readonly categoryId?: string;
  /** Single day; superseded by dateFrom/dateTo when those are present. */
  readonly date?: string;
  readonly dateFrom?: string;
  readonly dateTo?: string;
}

/**
 * Field expenses, read-only from the backoffice.
 *
 * `POST /expenses` is not exposed here on purpose: the API charges the expense
 * against *the authenticated seller's open shift*, so a supervisor calling it
 * from the backoffice either fails with SHIFT_REQUIRED or would book the cost
 * against their own non-existent float. Registering a gasto is a field-app
 * action; the backoffice supervises it.
 */
@Injectable({ providedIn: 'root' })
export class ExpenseDataClient {
  private readonly api = inject(ApiClient);

  list(query: ExpenseListQuery): Observable<Paginated<Expense>> {
    return this.api.get<Paginated<Expense>>(
      '/expenses',
      toQueryParams({ ...query }),
    );
  }

  get(id: string): Observable<Expense> {
    return this.api.get<Expense>(`/expenses/${id}`);
  }
}
