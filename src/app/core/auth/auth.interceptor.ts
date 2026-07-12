import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

import { environment } from '../../../environments/environment';
import { AuthSession } from './auth-session';

/**
 * Attaches the Supabase access token as a Bearer header — but only to requests
 * hitting our own API. Supabase's own traffic never reaches here (it uses
 * fetch), and we must not leak the token to any third-party URL.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(AuthSession).accessToken();
  if (!token || !req.url.startsWith(environment.apiUrl)) {
    return next(req);
  }
  return next(
    req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }),
  );
};
