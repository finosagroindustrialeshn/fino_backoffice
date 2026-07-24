import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';

import { ApiClient } from '../../../core/http/api-client';
import type {
  Paginated,
  PaginationQuery,
} from '../../../core/http/pagination.model';
import { toQueryParams } from '../../../core/http/query-params';
import type {
  KardexEntry,
  SellerStockRow,
  StockReportRow,
} from '../models/inventory-report.model';

export interface StockReportQuery extends PaginationQuery {
  /** Low-stock view: only products whose available qty is strictly below it. */
  readonly lowStockThreshold?: number;
}

export interface KardexQuery extends PaginationQuery {
  /** Required — the API 404s on an unknown product. */
  readonly productId: string;
  readonly dateFrom?: string;
  readonly dateTo?: string;
}

export interface SellerStockQuery extends PaginationQuery {
  /** Omit for all sellers. */
  readonly sellerId?: string;
}

/** Read-only inventory reports (ADMIN / SUPERVISOR / ACCOUNTANT). */
@Injectable({ providedIn: 'root' })
export class ReportsInventoryDataClient {
  private readonly api = inject(ApiClient);

  stock(query?: StockReportQuery): Observable<Paginated<StockReportRow>> {
    return this.api.get<Paginated<StockReportRow>>(
      '/reports/inventory/stock',
      toQueryParams({ ...query }),
    );
  }

  kardex(query: KardexQuery): Observable<Paginated<KardexEntry>> {
    return this.api.get<Paginated<KardexEntry>>(
      '/reports/inventory/kardex',
      toQueryParams({ ...query }),
    );
  }

  sellerStock(query?: SellerStockQuery): Observable<Paginated<SellerStockRow>> {
    return this.api.get<Paginated<SellerStockRow>>(
      '/reports/inventory/seller-stock',
      toQueryParams({ ...query }),
    );
  }
}
