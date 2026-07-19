import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';

import { ApiClient, type QueryParams } from '../../../core/http/api-client';
import type {
  Paginated,
  PaginationQuery,
} from '../../../core/http/pagination.model';
import type {
  InventoryMovement,
  MovementPayload,
  WarehouseStock,
} from '../models/inventory.model';

@Injectable({ providedIn: 'root' })
export class InventoryDataClient {
  private readonly api = inject(ApiClient);

  listStock(query: PaginationQuery): Observable<Paginated<WarehouseStock>> {
    const params: Record<string, string | number | boolean> = {};
    if (query.page) {
      params['page'] = query.page;
    }
    if (query.pageSize) {
      params['pageSize'] = query.pageSize;
    }
    return this.api.get<Paginated<WarehouseStock>>(
      '/inventory',
      params as QueryParams,
    );
  }

  listMovements(productId: string): Observable<InventoryMovement[]> {
    return this.api.get<InventoryMovement[]>(
      `/inventory/${productId}/movements`,
    );
  }

  registerMovement(
    productId: string,
    payload: MovementPayload,
  ): Observable<WarehouseStock> {
    return this.api.post<WarehouseStock>(
      `/inventory/${productId}/movements`,
      payload,
    );
  }
}
