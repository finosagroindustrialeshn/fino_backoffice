import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';

import { ApiClient } from '../../../core/http/api-client';
import type {
  Paginated,
  PaginationQuery,
  SortOrder,
} from '../../../core/http/pagination.model';
import { toQueryParams } from '../../../core/http/query-params';
import type {
  ProductSalesRow,
  ProductSalesSortBy,
  SalesChannel,
  SalesSummary,
  SellerSalesRow,
} from '../models/sales-report.model';

/** Date bounds shared by every sales report, YYYY-MM-DD (day granularity). */
export interface SalesReportRange {
  readonly dateFrom?: string;
  readonly dateTo?: string;
}

export interface SalesSummaryQuery extends SalesReportRange {
  readonly sellerId?: string;
  readonly channel?: SalesChannel;
}

export interface ProductSalesQuery extends SalesReportRange, PaginationQuery {
  readonly sortBy?: ProductSalesSortBy;
  readonly sortDir?: SortOrder;
}

export interface SellerSalesQuery extends SalesReportRange, PaginationQuery {
  readonly sortDir?: SortOrder;
}

/** Read-only sales analytics (ADMIN / SUPERVISOR / ACCOUNTANT). */
@Injectable({ providedIn: 'root' })
export class ReportsSalesDataClient {
  private readonly api = inject(ApiClient);

  summary(query?: SalesSummaryQuery): Observable<SalesSummary> {
    return this.api.get<SalesSummary>(
      '/reports/sales/summary',
      toQueryParams({ ...query }),
    );
  }

  byProduct(query?: ProductSalesQuery): Observable<Paginated<ProductSalesRow>> {
    return this.api.get<Paginated<ProductSalesRow>>(
      '/reports/sales/by-product',
      toQueryParams({ ...query }),
    );
  }

  bySeller(query?: SellerSalesQuery): Observable<Paginated<SellerSalesRow>> {
    return this.api.get<Paginated<SellerSalesRow>>(
      '/reports/sales/by-seller',
      toQueryParams({ ...query }),
    );
  }
}
