import { inject, Injectable } from '@angular/core';
import { catchError, of, throwError, type Observable } from 'rxjs';

import { ApiClient } from '../../../core/http/api-client';
import type {
  CashSession,
  CloseCashSessionPayload,
  OpenCashSessionPayload,
} from '../models/cash-session.model';

@Injectable({ providedIn: 'root' })
export class CashSessionDataClient {
  private readonly api = inject(ApiClient);

  /**
   * The caller's open till, or null when there is none.
   *
   * The API answers 404 for "no open session" — that is a state, not a
   * failure, so it is translated here instead of reaching the UI as an error.
   * Any other failure still propagates.
   */
  current(): Observable<CashSession | null> {
    return this.api.get<CashSession>('/cash-sessions/current').pipe(
      catchError((error: unknown) =>
        isNotFound(error) ? of(null) : throwError(() => error),
      ),
    );
  }

  get(id: string): Observable<CashSession> {
    return this.api.get<CashSession>(`/cash-sessions/${id}`);
  }

  open(payload: OpenCashSessionPayload): Observable<CashSession> {
    return this.api.post<CashSession>('/cash-sessions', payload);
  }

  close(
    id: string,
    payload: CloseCashSessionPayload,
  ): Observable<CashSession> {
    return this.api.post<CashSession>(`/cash-sessions/${id}/close`, payload);
  }
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    (error as { status: unknown }).status === 404
  );
}
