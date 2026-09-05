import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';

import { ApiClient } from '../../../core/http/api-client';
import type {
  Paginated,
  PaginationQuery,
} from '../../../core/http/pagination.model';
import { toQueryParams } from '../../../core/http/query-params';
import type { PaymentRow } from '../models/payment.model';
import type { PaymentMethod } from '../models/sale.model';

export interface PaymentListQuery extends PaginationQuery {
  /** The shift the money was collected in — the anchor its liquidation sums over. */
  readonly shiftId?: string;
  /** The store cash session the money was collected at. */
  readonly cashSessionId?: string;
  /** `CASH` itemises `cashCollected`; anything else itemises `otherCollected`. */
  readonly method?: PaymentMethod;
  /** Single day; superseded by dateFrom/dateTo when those are present. */
  readonly date?: string;
  readonly dateFrom?: string;
  readonly dateTo?: string;
}

/**
 * The individual collections behind a cash count, newest first.
 *
 * This is the drill-down the arqueo was missing: a line reading
 * `difference: -300` is unexplainable until the rows that built its
 * `totalCollected` can be listed and read one by one.
 */
@Injectable({ providedIn: 'root' })
export class PaymentDataClient {
  private readonly api = inject(ApiClient);

  list(query: PaymentListQuery): Observable<Paginated<PaymentRow>> {
    return this.api.get<Paginated<PaymentRow>>(
      '/payments',
      toQueryParams({ ...query }),
    );
  }
}
