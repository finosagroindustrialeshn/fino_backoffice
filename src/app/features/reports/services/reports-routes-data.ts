import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';

import { ApiClient } from '../../../core/http/api-client';
import type {
  Paginated,
  PaginationQuery,
} from '../../../core/http/pagination.model';
import { toQueryParams } from '../../../core/http/query-params';
import type { RouteStatus } from '../../routes/models/route.model';
import type { RouteComplianceRow } from '../models/route-compliance-report.model';

export interface RouteComplianceQuery extends PaginationQuery {
  readonly sellerId?: string;
  /**
   * Usually COMPLETED: a route still in progress has pending stops that are
   * not yet a failure to visit.
   */
  readonly status?: RouteStatus;
  /** Range bounds, YYYY-MM-DD. Take precedence over `date`. */
  readonly dateFrom?: string;
  readonly dateTo?: string;
}

/** Read-only route analytics (ADMIN / SUPERVISOR / ACCOUNTANT). */
@Injectable({ providedIn: 'root' })
export class ReportsRoutesDataClient {
  private readonly api = inject(ApiClient);

  compliance(
    query?: RouteComplianceQuery,
  ): Observable<Paginated<RouteComplianceRow>> {
    return this.api.get<Paginated<RouteComplianceRow>>(
      '/reports/routes/compliance',
      toQueryParams({ ...query }),
    );
  }
}
