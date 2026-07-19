import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';

import { ApiClient, type QueryParams } from '../../../../core/http/api-client';
import type {
  Paginated,
  PaginationQuery,
} from '../../../../core/http/pagination.model';
import type {
  ProductCategory,
  ProductCategoryInput,
} from '../models/product-category.model';

@Injectable({ providedIn: 'root' })
export class ProductCategoryDataClient {
  private readonly api = inject(ApiClient);

  list(
    query: PaginationQuery & { readonly includeInactive?: boolean },
  ): Observable<Paginated<ProductCategory>> {
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
    return this.api.get<Paginated<ProductCategory>>(
      '/product-categories',
      params as QueryParams,
    );
  }

  create(dto: ProductCategoryInput): Observable<ProductCategory> {
    return this.api.post<ProductCategory>('/product-categories', dto);
  }

  update(id: string, dto: ProductCategoryInput): Observable<ProductCategory> {
    return this.api.patch<ProductCategory>(`/product-categories/${id}`, dto);
  }

  activate(id: string): Observable<ProductCategory> {
    return this.api.patch<ProductCategory>(
      `/product-categories/${id}/activate`,
    );
  }

  deactivate(id: string): Observable<ProductCategory> {
    return this.api.patch<ProductCategory>(
      `/product-categories/${id}/deactivate`,
    );
  }

  remove(id: string): Observable<void> {
    return this.api.delete(`/product-categories/${id}`);
  }
}
