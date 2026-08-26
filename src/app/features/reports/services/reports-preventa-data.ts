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
  PresalesSummary,
  PresellerOrdersRow,
} from '../models/preventa-report.model';

/** Date bounds shared by both preventa reports, YYYY-MM-DD (day granularity). */
export interface PresalesReportQuery extends PaginationQuery {
  readonly dateFrom?: string;
  readonly dateTo?: string;
  /** Narrow the report to a single preventista. */
  readonly takenById?: string;
  /** Direction by orders taken. The API defaults to the busiest first. */
  readonly sortDir?: SortOrder;
}

/** Read-only preventa analytics (ADMIN / SUPERVISOR / ACCOUNTANT). */
@Injectable({ providedIn: 'root' })
export class ReportsPreventaDataClient {
  private readonly api = inject(ApiClient);

  summary(query?: PresalesReportQuery): Observable<PresalesSummary> {
    return this.api.get<PresalesSummary>(
      '/reports/presales/summary',
      toQueryParams({ ...query }),
    );
  }

  byPreseller(
    query?: PresalesReportQuery,
  ): Observable<Paginated<PresellerOrdersRow>> {
    return this.api.get<Paginated<PresellerOrdersRow>>(
      '/reports/presales/by-preseller',
      toQueryParams({ ...query }),
    );
  }
}
