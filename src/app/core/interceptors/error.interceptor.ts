import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { AuthSession } from '../auth/auth-session';
import {
  API_ERROR_MESSAGES,
  isApiErrorCode,
  type ApiErrorCode,
} from '../http/api-error-codes';
import type { ApiError } from '../http/api-error';

/**
 * Centralizes HTTP error handling: normalizes every failure into an ApiError
 * and reacts to auth expiry. Consumers only ever see ApiError.
 *
 * Localization happens here, at the single point where ApiError is built, so
 * every existing consumer renders Spanish without changing a line. The API's
 * own `message` is documented as English prose "intended for logs and
 * developers" — accurate, but not copy to put in front of a user.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const auth = inject(AuthSession);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401) {
        void auth.logout();
        void router.navigate(['/login']);
      }

      const code = extractCode(error);
      const apiError: ApiError = {
        status: error.status,
        ...(code ? { code } : {}),
        message: resolveMessage(error, code),
        details: error.error,
      };
      return throwError(() => apiError);
    }),
  );
};

function extractCode(error: HttpErrorResponse): ApiErrorCode | undefined {
  const body: unknown = error.error;
  if (body && typeof body === 'object' && 'code' in body) {
    const code = (body as { code: unknown }).code;
    if (isApiErrorCode(code)) {
      return code;
    }
  }
  return undefined;
}

/**
 * Prefers our Spanish copy for a known code, and falls back to the API's
 * message for anything unmapped — inaccurate-but-English beats a generic
 * "something went wrong" that tells the user nothing.
 */
function resolveMessage(
  error: HttpErrorResponse,
  code: ApiErrorCode | undefined,
): string {
  if (code) {
    const message = API_ERROR_MESSAGES[code];
    if (message) {
      return message;
    }
  }
  return extractMessage(error);
}

function extractMessage(error: HttpErrorResponse): string {
  const body = error.error;
  if (body && typeof body === 'object' && 'message' in body) {
    return String((body as { message: unknown }).message);
  }
  if (error.status === 0) {
    return 'No se pudo conectar con el servidor. Revisá tu conexión.';
  }
  return error.message || 'Ocurrió un error inesperado.';
}
