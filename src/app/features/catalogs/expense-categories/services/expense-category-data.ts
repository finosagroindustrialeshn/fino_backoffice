import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';

import { ApiClient, type QueryParams } from '../../../../core/http/api-client';
import type {
  ExpenseCategory,
  ExpenseCategoryInput,
} from '../models/expense-category.model';

@Injectable({ providedIn: 'root' })
export class ExpenseCategoryDataClient {
  private readonly api = inject(ApiClient);

  list(includeInactive?: boolean): Observable<ExpenseCategory[]> {
    const params: Record<string, boolean> = {};
    if (includeInactive) {
      params['includeInactive'] = true;
    }
    return this.api.get<ExpenseCategory[]>(
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
