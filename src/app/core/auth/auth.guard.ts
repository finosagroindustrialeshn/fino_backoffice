import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthSession } from './auth-session';

/**
 * Blocks access to protected routes when there is no Supabase session,
 * redirecting to the login page. Awaits AuthSession.ready() first so a hard
 * refresh doesn't redirect before the persisted session has been hydrated.
 */
export const authGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const auth = inject(AuthSession);
  await auth.ready();
  if (auth.isAuthenticated()) {
    return true;
  }
  return router.createUrlTree(['/login']);
};
