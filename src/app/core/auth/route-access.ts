import type { Role } from './user-profile.model';

/**
 * Single source of truth for which roles may reach a restricted area.
 *
 * Both the sidebar (what to show) and the router (what to allow) read from
 * here, so a menu entry can never be visible for a route the guard blocks, nor
 * a route stay reachable once its menu entry is hidden. Routes absent from
 * this map are open to every authenticated role.
 *
 * Keys are the top-level route segment, matching the `/segment` of the nav item.
 */
const OPERATIONS: readonly Role[] = ['ADMIN', 'SUPERVISOR'];
const FINANCE: readonly Role[] = ['ADMIN', 'SUPERVISOR', 'ACCOUNTANT'];
const ADMIN_ONLY: readonly Role[] = ['ADMIN'];

export const ROUTE_ACCESS = {
  despacho: OPERATIONS,
  retorno: OPERATIONS,
  vendedores: OPERATIONS,
  caja: OPERATIONS,
  contabilidad: FINANCE,
  reportes: FINANCE,
  productos: OPERATIONS,
  inventario: OPERATIONS,
  catalogos: OPERATIONS,
  empleados: OPERATIONS,
  usuarios: ADMIN_ONLY,
} as const satisfies Record<string, readonly Role[]>;

export type RestrictedArea = keyof typeof ROUTE_ACCESS;
