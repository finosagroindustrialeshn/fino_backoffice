import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';

import { ApiClient } from '../../../core/http/api-client';
import type {
  Paginated,
  PaginationQuery,
} from '../../../core/http/pagination.model';
import { toQueryParams } from '../../../core/http/query-params';
import type {
  CashSessionRow,
  DailyCashRow,
} from '../models/cash-report.model';

/**
 * Both cash endpoints REQUIRE both bounds and cap the span at 92 days —
 * the range is not optional here, unlike the sales reports. Bounds are
 * Honduras civil days (YYYY-MM-DD); see `utils/date-range`.
 */
export interface CashReportQuery extends PaginationQuery {
  readonly dateFrom: string;
  readonly dateTo: string;
}

/** Read-only cash-close reports (ADMIN / SUPERVISOR / ACCOUNTANT). */
@Injectable({ providedIn: 'root' })
export class ReportsCashDataClient {
  private readonly api = inject(ApiClient);

  daily(query: CashReportQuery): Observable<Paginated<DailyCashRow>> {
    return this.api.get<Paginated<DailyCashRow>>(
      '/reports/cash/daily',
      toQueryParams({ ...query }),
    );
  }

  sessions(query: CashReportQuery): Observable<Paginated<CashSessionRow>> {
    return this.api.get<Paginated<CashSessionRow>>(
      '/reports/cash/sessions',
      toQueryParams({ ...query }),
    );
  }
}
