import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type { Observable } from 'rxjs';

import { environment } from '../../../environments/environment';

/** Query params accepted by ApiClient: an HttpParams or a plain object. */
export type QueryParams =
  | HttpParams
  | Record<string, string | number | boolean>;

/**
 * Single entry point for HTTP access. Feature services depend on ApiClient
 * (never on HttpClient directly), so cross-cutting concerns — base URL,
 * headers, auth, error handling — live in one place.
 *
 * Auth headers and error normalization are handled by interceptors, keeping
 * this wrapper focused on request shaping.
 */
@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl;

  get<T>(path: string, params?: QueryParams): Observable<T> {
    return this.http.get<T>(this.url(path), { params: this.toParams(params) });
  }

  post<T>(path: string, body?: unknown): Observable<T> {
    return this.http.post<T>(this.url(path), body);
  }

  put<T>(path: string, body?: unknown): Observable<T> {
    return this.http.put<T>(this.url(path), body);
  }

  patch<T>(path: string, body?: unknown): Observable<T> {
    return this.http.patch<T>(this.url(path), body);
  }

  delete<T>(path: string, params?: QueryParams): Observable<T> {
    return this.http.delete<T>(this.url(path), {
      params: this.toParams(params),
    });
  }

  private url(path: string): string {
    return `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  }

  private toParams(params?: QueryParams): HttpParams | undefined {
    if (!params) {
      return undefined;
    }
    if (params instanceof HttpParams) {
      return params;
    }
    let httpParams = new HttpParams();
    for (const [key, value] of Object.entries(params)) {
      httpParams = httpParams.set(key, String(value));
    }
    return httpParams;
  }
}
