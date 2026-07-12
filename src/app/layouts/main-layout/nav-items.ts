import type { Role } from '../../core/auth/user-profile.model';

export interface NavItem {
  readonly label: string;
  /** PrimeIcons class, e.g. 'pi pi-th-large'. */
  readonly icon: string;
  readonly route: string;
  /** Roles allowed to see this item. Omit to show it to everyone. */
  readonly roles?: readonly Role[];
}

export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Dashboard', icon: 'pi pi-th-large', route: '/dashboard' },
  { label: 'Despacho', icon: 'pi pi-box', route: '/despacho' },
  { label: 'Retorno', icon: 'pi pi-replay', route: '/retorno' },
  { label: 'Mapa de rutas', icon: 'pi pi-map', route: '/mapa' },
  { label: 'Clientes', icon: 'pi pi-users', route: '/clientes' },
  {
    label: 'Productos',
    icon: 'pi pi-shopping-bag',
    route: '/productos',
    roles: ['ADMIN', 'SUPERVISOR'],
  },
  { label: 'Contabilidad', icon: 'pi pi-calculator', route: '/contabilidad' },
  {
    label: 'Usuarios y roles',
    icon: 'pi pi-shield',
    route: '/usuarios',
    roles: ['ADMIN'],
  },
] as const;
