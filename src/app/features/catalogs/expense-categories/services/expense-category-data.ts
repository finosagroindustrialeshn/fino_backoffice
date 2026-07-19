import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';

import { ApiClient, type QueryParams } from '../../../../core/http/api-client';
import type {
  Paginated,
  PaginationQuery,
} from '../../../../core/http/pagination.model';
import type {
  ExpenseCategory,
  ExpenseCategoryInput,
} from '../models/expense-category.model';

@Injectable({ providedIn: 'root' })
export class ExpenseCategoryDataClient {
  private readonly api = inject(ApiClient);

  list(
    query: PaginationQuery & { readonly includeInactive?: boolean },
  ): Observable<Paginated<ExpenseCategory>> {
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
    return this.api.get<Paginated<ExpenseCategory>>(
      '/expense-categories',
      params as QueryParams,
    );
  }

  create(dto: ExpenseCategoryInput): Observable<ExpenseCategory> {
    return this.api.post<ExpenseCategory>('/expense-categories', dto);
  }

  update(id: string, dto: ExpenseCategoryInput): Observable<ExpenseCategory> {
    return this.api.patch<ExpenseCategory>(`/expense-categories/${id}`, dto);
  }

  activate(id: string): Observable<ExpenseCategory> {
    return this.api.patch<ExpenseCategory>(`/expense-categories/${id}/activate`);
  }

  deactivate(id: string): Observable<ExpenseCategory> {
    return this.api.patch<ExpenseCategory>(
      `/expense-categories/${id}/deactivate`,
    );
  }

  remove(id: string): Observable<void> {
    return this.api.delete(`/expense-categories/${id}`);
  }
}
