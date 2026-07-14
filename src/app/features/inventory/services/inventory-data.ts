import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';

import { ApiClient } from '../../../core/http/api-client';
import type {
  InventoryMovement,
  MovementPayload,
  WarehouseStock,
} from '../models/inventory.model';

@Injectable({ providedIn: 'root' })
export class InventoryDataClient {
  private readonly api = inject(ApiClient);

  listStock(): Observable<WarehouseStock[]> {
    return this.api.get<WarehouseStock[]>('/inventory');
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
