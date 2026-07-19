import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';

import { ApiClient, type QueryParams } from '../../../../core/http/api-client';
import type {
  Paginated,
  PaginationQuery,
} from '../../../../core/http/pagination.model';
import type { ProductPresentation } from '../models/product-presentation.model';

export interface ProductPresentationPayload {
  readonly name: string;
  readonly description: string;
  readonly sortOrder: number;
}

@Injectable({ providedIn: 'root' })
export class ProductPresentationDataClient {
  private readonly api = inject(ApiClient);

  list(
    query: PaginationQuery & { readonly includeInactive?: boolean },
  ): Observable<Paginated<ProductPresentation>> {
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
    return this.api.get<Paginated<ProductPresentation>>(
      '/product-presentations',
      params as QueryParams,
    );
  }

  create(dto: ProductPresentationPayload): Observable<ProductPresentation> {
    return this.api.post<ProductPresentation>('/product-presentations', dto);
  }

  update(
    id: string,
    dto: ProductPresentationPayload,
  ): Observable<ProductPresentation> {
    return this.api.patch<ProductPresentation>(
      `/product-presentations/${id}`,
      dto,
    );
  }

  activate(id: string): Observable<ProductPresentation> {
    return this.api.patch<ProductPresentation>(
      `/product-presentations/${id}/activate`,
    );
  }

  deactivate(id: string): Observable<ProductPresentation> {
    return this.api.patch<ProductPresentation>(
      `/product-presentations/${id}/deactivate`,
    );
  }

  remove(id: string): Observable<void> {
    return this.api.delete(`/product-presentations/${id}`);
  }
}
