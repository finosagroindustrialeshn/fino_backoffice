import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';

import { ApiClient, type QueryParams } from '../../../core/http/api-client';
import type {
  Paginated,
  PaginationQuery,
  SortOrder,
} from '../../../core/http/pagination.model';
import type {
  Product,
  ProductChange,
  ProductPayload,
} from '../models/product.model';

/** Fields the API can sort the product list by. */
export type ProductSortBy = 'name' | 'price' | 'cost' | 'createdAt';

export interface ProductListQuery extends PaginationQuery {
  /** Case-insensitive search over SKU, name and description. */
  readonly search?: string;
  readonly categoryId?: string;
  readonly presentationId?: string;
  readonly isActive?: boolean;
  readonly sortBy?: ProductSortBy;
  readonly sortOrder?: SortOrder;
}

@Injectable({ providedIn: 'root' })
export class ProductDataClient {
  private readonly api = inject(ApiClient);

  list(query: ProductListQuery): Observable<Paginated<Product>> {
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
    if (query.categoryId) {
      params['categoryId'] = query.categoryId;
    }
    if (query.presentationId) {
      params['presentationId'] = query.presentationId;
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

  /**
   * What has been edited on this product, newest first — one row per field
   * changed. Backoffice only: a field seller reads the catalog as it is
   * today, and how the price got there is an accounting question.
   */
  changes(
    id: string,
    query?: PaginationQuery,
  ): Observable<Paginated<ProductChange>> {
    const params: Record<string, string | number | boolean> = {};
    if (query?.page) {
      params['page'] = query.page;
    }
    if (query?.pageSize) {
      params['pageSize'] = query.pageSize;
    }
    return this.api.get<Paginated<ProductChange>>(
      `/products/${id}/changes`,
      params as QueryParams,
    );
  }
}
