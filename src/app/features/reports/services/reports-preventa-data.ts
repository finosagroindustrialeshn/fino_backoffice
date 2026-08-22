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
  PreventaSummary,
  PreventistaOrdersRow,
} from '../models/preventa-report.model';

/** Date bounds shared by both preventa reports, YYYY-MM-DD (day granularity). */
export interface PreventaReportQuery extends PaginationQuery {
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

  summary(query?: PreventaReportQuery): Observable<PreventaSummary> {
    return this.api.get<PreventaSummary>(
      '/reports/preventa/summary',
      toQueryParams({ ...query }),
    );
  }

  byPreventista(
    query?: PreventaReportQuery,
  ): Observable<Paginated<PreventistaOrdersRow>> {
    return this.api.get<Paginated<PreventistaOrdersRow>>(
      '/reports/preventa/by-preventista',
      toQueryParams({ ...query }),
    );
  }
}
