import type { Route } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { routes } from '../../app.routes';
import { NAV_GROUPS } from '../../layouts/main-layout/nav-items';
import { ROUTE_ACCESS } from './route-access';
import { roleGuard } from './role.guard';
import type { Role } from './user-profile.model';

interface ResolvedRoute {
  readonly path: string;
  readonly roles: readonly Role[] | null;
}

/** Flattens the route tree into full paths plus the roles enforced by a roleGuard ancestor. */
function flatten(
  tree: readonly Route[],
  prefix = '',
  inherited: readonly Role[] | null = null,
): ResolvedRoute[] {
  return tree.flatMap((route) => {
    const path = [prefix, route.path ?? ''].filter(Boolean).join('/');
    const guarded = route.canActivate?.includes(roleGuard) ?? false;
    const roles = guarded
      ? ((route.data?.['roles'] as readonly Role[] | undefined) ?? [])
      : inherited;
    const self: ResolvedRoute[] = route.children ? [] : [{ path, roles }];
    return [...self, ...flatten(route.children ?? [], path, roles)];
  });
}

const resolved = flatten(routes);

function find(url: string): ResolvedRoute | undefined {
  return resolved.find((route) => `/${route.path}` === url);
}

describe('route access', () => {
  const restricted = NAV_GROUPS.flatMap((group) => group.items).filter((item) => item.roles);

  it('has restricted nav items to check', () => {
    expect(restricted.length).toBeGreaterThan(0);
  });

  for (const item of NAV_GROUPS.flatMap((group) => group.items).filter(
    (candidate) => candidate.roles,
  )) {
    const targets = item.children?.map((child) => child.route) ?? [item.route];
    for (const target of targets) {
      it(`guards ${target} with the same roles as its menu item`, () => {
        const route = find(target);
        expect(route, `no route for ${target}`).toBeDefined();
        expect(route?.roles).toEqual(item.roles);
      });
    }
  }

  it.each(Object.keys(ROUTE_ACCESS))('has a guarded route for ROUTE_ACCESS key %s', (key) => {
    const guarded = resolved.filter(
      (route) => route.path === key || route.path.startsWith(`${key}/`),
    );
    expect(guarded.length).toBeGreaterThan(0);
    for (const route of guarded) {
      expect(route.roles).toEqual(ROUTE_ACCESS[key as keyof typeof ROUTE_ACCESS]);
    }
  });

  it.each([
    '/despacho/nuevo',
    '/retorno/nuevo',
    '/productos/nuevo',
    '/productos/:id/editar',
    '/contabilidad/clientes/:clientId',
    '/empleados/nuevo',
    '/empleados/:id/editar',
    '/usuarios/nuevo',
    '/usuarios/:id/editar',
    '/caja/venta',
  ])('guards the child route %s', (url) => {
    const route = find(url);
    expect(route, `no route for ${url}`).toBeDefined();
    expect(route?.roles).not.toBeNull();
  });

  it.each(['/dashboard', '/ventas', '/pedidos', '/clientes', '/jornadas', '/gastos', '/mapa'])(
    'leaves %s open to every role',
    (url) => {
      expect(find(url)?.roles).toBeNull();
    },
  );
});
