import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthSession } from './auth-session';
import type { Role } from './user-profile.model';

/** Page every role can see; where users land when they hit a route above their role. */
const FALLBACK_URL = '/dashboard';

/**
 * Allows navigation only when the current role is listed in the route's
 * `data.roles`. Awaits AuthSession.ready() so a hard refresh does not bounce
 * a permitted user while the session is still hydrating.
 *
 * Fails closed: no role (profile not loaded) or no `roles` declared on the
 * route both deny. Route-level only — the API stays the real authority.
 */
export const roleGuard: CanActivateFn = async (route) => {
  const router = inject(Router);
  const auth = inject(AuthSession);
  await auth.ready();
  await auth.profileReady();

  const allowed = route.data['roles'] as readonly Role[] | undefined;
  const role = auth.role();
  if (role !== null && allowed?.includes(role)) {
    return true;
  }
  return router.createUrlTree([FALLBACK_URL]);
};
