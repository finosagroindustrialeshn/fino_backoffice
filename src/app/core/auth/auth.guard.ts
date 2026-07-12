import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthSession } from './auth-session';

/**
 * Blocks access to protected routes when there is no Supabase session,
 * redirecting to the login page. Apply it to the shell route:
 *   { path: '', component: MainLayout, canActivate: [authGuard], ... }
 */
export const authGuard: CanActivateFn = () => {
  const router = inject(Router);
  if (inject(AuthSession).isAuthenticated()) {
    return true;
  }
  return router.createUrlTree(['/login']);
};
