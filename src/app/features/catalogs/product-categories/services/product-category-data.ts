import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';

import { ApiClient, type QueryParams } from '../../../../core/http/api-client';
import type {
  ProductCategory,
  ProductCategoryInput,
} from '../models/product-category.model';

@Injectable({ providedIn: 'root' })
export class ProductCategoryDataClient {
  private readonly api = inject(ApiClient);

  list(includeInactive?: boolean): Observable<ProductCategory[]> {
    const params: Record<string, boolean> = {};
    if (includeInactive) {
      params['includeInactive'] = true;
    }
    return this.api.get<ProductCategory[]>(
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
