import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';

import { ApiClient, type QueryParams } from '../../../core/http/api-client';
import type {
  Paginated,
  PaginationQuery,
} from '../../../core/http/pagination.model';
import type {
  Route,
  RouteDetail,
  RoutePayload,
  RouteStatus,
  RouteStop,
  RouteStopPayload,
  RouteStopStatus,
  RouteUpdatePayload,
} from '../models/route.model';

export interface RouteListQuery extends PaginationQuery {
  readonly sellerId?: string;
  readonly status?: RouteStatus;
  /** Single day, YYYY-MM-DD. Ignored by the API when a range is sent. */
  readonly date?: string;
  /** Range start, inclusive. Takes precedence over `date`. */
  readonly dateFrom?: string;
  /** Range end, inclusive. Takes precedence over `date`. */
  readonly dateTo?: string;
}

@Injectable({ providedIn: 'root' })
export class RouteDataClient {
  private readonly api = inject(ApiClient);

  /** Routes newest first. Stops are not guaranteed here — see {@link get}. */
  list(query: RouteListQuery): Observable<Paginated<Route>> {
    const params: Record<string, string | number | boolean> = {};
    if (query.page) {
      params['page'] = query.page;
    }
    if (query.pageSize) {
      params['pageSize'] = query.pageSize;
    }
    if (query.sellerId) {
      params['sellerId'] = query.sellerId;
    }
    if (query.status) {
      params['status'] = query.status;
    }
    if (query.dateFrom) {
      params['dateFrom'] = query.dateFrom;
    }
    if (query.dateTo) {
      params['dateTo'] = query.dateTo;
    }
    // Sent only as a fallback: the API ignores it whenever a range is present.
    if (query.date && !query.dateFrom && !query.dateTo) {
      params['date'] = query.date;
    }
    return this.api.get<Paginated<Route>>('/routes', params as QueryParams);
  }

  /** The only call that guarantees the stops, each with its client joined. */
  get(id: string): Observable<RouteDetail> {
    return this.api.get<RouteDetail>(`/routes/${id}`);
  }

  create(dto: RoutePayload): Observable<RouteDetail> {
    return this.api.post<RouteDetail>('/routes', dto);
  }

  /** Day, zone and notes only. A closed route rejects this with 409. */
  update(id: string, dto: RouteUpdatePayload): Observable<RouteDetail> {
    return this.api.patch<RouteDetail>(`/routes/${id}`, dto);
  }

  updateStatus(id: string, status: RouteStatus): Observable<RouteDetail> {
    return this.api.patch<RouteDetail>(`/routes/${id}/status`, { status });
  }

  remove(id: string): Observable<void> {
    return this.api.delete(`/routes/${id}`);
  }

  /**
   * Adds a stop. The returned stop comes back WITHOUT its client joined, so
   * refetch the route with {@link get} before redrawing the map.
   */
  addStop(routeId: string, dto: RouteStopPayload): Observable<RouteStop> {
    return this.api.post<RouteStop>(`/routes/${routeId}/stops`, dto);
  }

  removeStop(routeId: string, stopId: string): Observable<void> {
    return this.api.delete(`/routes/${routeId}/stops/${stopId}`);
  }

  /** Also returns the stop without its client — refetch to redraw. */
  updateStopStatus(
    routeId: string,
    stopId: string,
    status: RouteStopStatus,
  ): Observable<RouteStop> {
    return this.api.patch<RouteStop>(
      `/routes/${routeId}/stops/${stopId}/status`,
      { status },
    );
  }
}
