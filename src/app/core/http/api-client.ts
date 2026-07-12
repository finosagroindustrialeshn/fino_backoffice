import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { map, type Observable } from 'rxjs';

import { environment } from '../../../environments/environment';
import type { ApiEnvelope } from './api-envelope';

/** Query params accepted by ApiClient: an HttpParams or a plain object. */
export type QueryParams =
  | HttpParams
  | Record<string, string | number | boolean>;

/**
 * Single entry point for HTTP access. Feature services depend on ApiClient
 * (never on HttpClient directly), so cross-cutting concerns — base URL,
 * headers, auth, error handling, response envelope — live in one place.
 *
 * Auth headers and error normalization are handled by interceptors. Every
 * successful response wraps its payload in an ApiEnvelope (per the OpenAPI
 * spec); get/post/put/patch unwrap it so callers only ever see `data`.
 * delete responses have no body (204), so it's left unwrapped.
 */
@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl;

  get<T>(path: string, params?: QueryParams): Observable<T> {
    return this.http
      .get<ApiEnvelope<T>>(this.url(path), { params: this.toParams(params) })
      .pipe(map((response) => response.data));
  }

  post<T>(path: string, body?: unknown): Observable<T> {
    return this.http
      .post<ApiEnvelope<T>>(this.url(path), body)
      .pipe(map((response) => response.data));
  }

  put<T>(path: string, body?: unknown): Observable<T> {
    return this.http
      .put<ApiEnvelope<T>>(this.url(path), body)
      .pipe(map((response) => response.data));
  }

  patch<T>(path: string, body?: unknown): Observable<T> {
    return this.http
      .patch<ApiEnvelope<T>>(this.url(path), body)
      .pipe(map((response) => response.data));
  }

  delete(path: string, params?: QueryParams): Observable<void> {
    return this.http.delete<void>(this.url(path), {
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
