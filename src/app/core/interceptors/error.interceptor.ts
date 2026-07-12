import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { AuthSession } from '../auth/auth-session';
import type { ApiError } from '../http/api-error';

/**
 * Centralizes HTTP error handling: normalizes every failure into an ApiError
 * and reacts to auth expiry. Consumers only ever see ApiError.
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

      const apiError: ApiError = {
        status: error.status,
        message: extractMessage(error),
        details: error.error,
      };
      return throwError(() => apiError);
    }),
  );
};

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
