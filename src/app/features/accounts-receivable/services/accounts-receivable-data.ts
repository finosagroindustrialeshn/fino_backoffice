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
  AgingReport,
  ClientReceivable,
  ClientStatement,
  DebtorRow,
  DebtorSortBy,
  ReceivableSummary,
} from '../models/accounts-receivable.model';

export interface DebtorsQuery extends PaginationQuery {
  readonly sortBy?: DebtorSortBy;
  readonly sortDir?: SortOrder;
}

export interface AgingQuery {
  /** Scopes the aging to a single client; omit for the overall portfolio. */
  readonly clientId?: string;
}

/** Day-granularity bounds (YYYY-MM-DD) that window the statement entries. */
export interface StatementQuery {
  readonly dateFrom?: string;
  readonly dateTo?: string;
}

/** Read-only accounts receivable (ADMIN / SUPERVISOR / ACCOUNTANT). */
@Injectable({ providedIn: 'root' })
export class AccountsReceivableDataClient {
  private readonly api = inject(ApiClient);

  summary(): Observable<ReceivableSummary> {
    return this.api.get<ReceivableSummary>('/accounts-receivable/summary');
  }

  aging(query?: AgingQuery): Observable<AgingReport> {
    return this.api.get<AgingReport>(
      '/accounts-receivable/aging',
      toQueryParams({ ...query }),
    );
  }

  debtors(query?: DebtorsQuery): Observable<Paginated<DebtorRow>> {
    return this.api.get<Paginated<DebtorRow>>(
      '/accounts-receivable/debtors',
      toQueryParams({ ...query }),
    );
  }

  clientReceivable(clientId: string): Observable<ClientReceivable> {
    return this.api.get<ClientReceivable>(
      `/accounts-receivable/clients/${encodeURIComponent(clientId)}`,
    );
  }

  clientStatement(
    clientId: string,
    query?: StatementQuery,
  ): Observable<ClientStatement> {
    return this.api.get<ClientStatement>(
      `/accounts-receivable/clients/${encodeURIComponent(clientId)}/statement`,
      toQueryParams({ ...query }),
    );
  }
}
