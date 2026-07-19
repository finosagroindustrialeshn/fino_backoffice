import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';

import { ApiClient, type QueryParams } from '../../../core/http/api-client';
import type {
  Paginated,
  PaginationQuery,
} from '../../../core/http/pagination.model';
import type { Product, ProductPayload } from '../models/product.model';

@Injectable({ providedIn: 'root' })
export class ProductDataClient {
  private readonly api = inject(ApiClient);

  list(query: PaginationQuery): Observable<Paginated<Product>> {
    const params: Record<string, string | number | boolean> = {};
    if (query.page) {
      params['page'] = query.page;
    }
    if (query.pageSize) {
      params['pageSize'] = query.pageSize;
    }
    return this.api.get<Paginated<Product>>('/products', params as QueryParams);
  }

  get(id: string): Observable<Product> {
    return this.api.get<Product>(`/products/${id}`);
  }

  create(dto: ProductPayload): Observable<Product> {
    return this.api.post<Product>('/products', dto);
  }

  update(id: string, dto: Partial<ProductPayload>): Observable<Product> {
    return this.api.patch<Product>(`/products/${id}`, dto);
  }

  setActive(id: string, isActive: boolean): Observable<Product> {
    return this.api.patch<Product>(`/products/${id}`, { isActive });
  }

  remove(id: string): Observable<void> {
    return this.api.delete(`/products/${id}`);
  }
}
