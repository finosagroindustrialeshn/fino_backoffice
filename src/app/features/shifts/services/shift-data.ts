import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';

import { ApiClient } from '../../../core/http/api-client';
import type {
  Paginated,
  PaginationQuery,
} from '../../../core/http/pagination.model';
import { toQueryParams } from '../../../core/http/query-params';
import type {
  CloseShiftPayload,
  Shift,
  ShiftClosing,
  ShiftDetail,
  ShiftStatus,
} from '../models/shift.model';

export interface ShiftListQuery extends PaginationQuery {
  readonly sellerId?: string;
  readonly status?: ShiftStatus;
  /** Single day; superseded by dateFrom/dateTo when those are present. */
  readonly date?: string;
  readonly dateFrom?: string;
  readonly dateTo?: string;
}

/**
 * Shifts (jornadas) as the backoffice consumes them.
 *
 * `GET /shifts/current` is deliberately not exposed: it resolves the
 * *authenticated* seller's open shift, which is a field-app concern. A
 * supervisor browsing the backoffice has no shift of their own.
 */
@Injectable({ providedIn: 'root' })
export class ShiftDataClient {
  private readonly api = inject(ApiClient);

  list(query: ShiftListQuery): Observable<Paginated<Shift>> {
    return this.api.get<Paginated<Shift>>(
      '/shifts',
      toQueryParams({ ...query }),
    );
  }

  get(id: string): Observable<ShiftDetail> {
    return this.api.get<ShiftDetail>(`/shifts/${id}`);
  }

  /**
   * Closes a shift and returns it with the settled liquidation, the day's
   * payment breakdown and its best sellers.
   *
   * `idempotencyKey` is required, not optional. Closing is the last thing a
   * tired seller does on the worst connection of the day, and a retry after a
   * lost response is the one case where the client cannot tell whether the day
   * was already settled. Callers must hold the same key across retries of the
   * same close and mint a new one only when the counted amount changes.
   */
  close(
    id: string,
    payload: CloseShiftPayload,
    idempotencyKey: string,
  ): Observable<ShiftClosing> {
    return this.api.post<ShiftClosing>(`/shifts/${id}/close`, payload, {
      idempotencyKey,
    });
  }
}
