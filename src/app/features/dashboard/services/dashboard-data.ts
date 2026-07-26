import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';

import { ApiClient } from '../../../core/http/api-client';
import { toQueryParams } from '../../../core/http/query-params';
import type { DashboardSummary } from '../models/dashboard.model';

/** Day-granularity bounds (YYYY-MM-DD). Both-or-neither; omitting both defaults to today. */
export interface DashboardSummaryQuery {
  readonly dateFrom?: string;
  readonly dateTo?: string;
  readonly lowStockThreshold?: number;
}

/** Read-only executive summary (ADMIN / SUPERVISOR / ACCOUNTANT). */
@Injectable({ providedIn: 'root' })
export class DashboardDataClient {
  private readonly api = inject(ApiClient);

  summary(query?: DashboardSummaryQuery): Observable<DashboardSummary> {
    return this.api.get<DashboardSummary>(
      '/dashboard/summary',
      toQueryParams({ ...query }),
    );
  }
}
