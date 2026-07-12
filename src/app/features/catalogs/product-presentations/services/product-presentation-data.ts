import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';

import { ApiClient, type QueryParams } from '../../../../core/http/api-client';
import type { ProductPresentation } from '../models/product-presentation.model';

export interface ProductPresentationPayload {
  readonly code: string;
  readonly name: string;
  readonly description: string;
  readonly sortOrder: number;
}

@Injectable({ providedIn: 'root' })
export class ProductPresentationDataClient {
  private readonly api = inject(ApiClient);

  list(includeInactive?: boolean): Observable<ProductPresentation[]> {
    const params: Record<string, boolean> = {};
    if (includeInactive) {
      params['includeInactive'] = true;
    }
    return this.api.get<ProductPresentation[]>(
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
