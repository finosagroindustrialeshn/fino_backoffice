import type { Role } from '../../core/auth/user-profile.model';

export interface NavChild {
  readonly label: string;
  readonly route: string;
}

export interface NavItem {
  readonly label: string;
  /** PrimeIcons class, e.g. 'pi pi-th-large'. */
  readonly icon: string;
  readonly route: string;
  /** Roles allowed to see this item. Omit to show it to everyone. */
  readonly roles?: readonly Role[];
  /** Sibling routes shown as an expandable submenu instead of a link. */
  readonly children?: readonly NavChild[];
}

export interface NavGroup {
  /** Section heading shown above the group. Omit for an ungrouped lead item (Dashboard). */
  readonly label?: string;
  readonly items: readonly NavItem[];
}

export const NAV_GROUPS: readonly NavGroup[] = [
  {
    items: [{ label: 'Dashboard', icon: 'pi pi-th-large', route: '/dashboard' }],
  },
  {
    label: 'Operación',
    items: [
      {
        label: 'Despacho',
        icon: 'pi pi-box',
        route: '/despacho',
        roles: ['ADMIN', 'SUPERVISOR'],
      },
      {
        label: 'Retorno',
        icon: 'pi pi-replay',
        route: '/retorno',
        roles: ['ADMIN', 'SUPERVISOR'],
      },
      { label: 'Mapa de rutas', icon: 'pi pi-map', route: '/mapa' },
      {
        label: 'Vendedores',
        icon: 'pi pi-map-marker',
        route: '/vendedores',
        roles: ['ADMIN', 'SUPERVISOR'],
      },
      {
        label: 'Caja',
        icon: 'pi pi-wallet',
        route: '/caja',
        roles: ['ADMIN', 'SUPERVISOR'],
      },
    ],
  },
  {
    label: 'Comercial',
    items: [
      { label: 'Clientes', icon: 'pi pi-users', route: '/clientes' },
      {
        label: 'Contabilidad',
        icon: 'pi pi-calculator',
        route: '/contabilidad',
        roles: ['ADMIN', 'SUPERVISOR', 'ACCOUNTANT'],
      },
      {
        label: 'Reportes',
        icon: 'pi pi-chart-bar',
        route: '/reportes',
        roles: ['ADMIN', 'SUPERVISOR', 'ACCOUNTANT'],
        children: [
          { label: 'Ventas', route: '/reportes/ventas' },
          { label: 'Caja', route: '/reportes/caja' },
          { label: 'Inventario', route: '/reportes/inventario' },
        ],
      },
    ],
  },
  {
    label: 'Catálogo',
    items: [
      {
        label: 'Productos',
        icon: 'pi pi-shopping-bag',
        route: '/productos',
        roles: ['ADMIN', 'SUPERVISOR'],
      },
      {
        label: 'Inventario',
        icon: 'pi pi-inbox',
        route: '/inventario',
        roles: ['ADMIN', 'SUPERVISOR'],
      },
      {
        label: 'Catálogos',
        icon: 'pi pi-tags',
        route: '/catalogos',
        roles: ['ADMIN', 'SUPERVISOR'],
        children: [
          { label: 'Categorías de producto', route: '/catalogos/categorias-producto' },
          { label: 'Presentaciones', route: '/catalogos/presentaciones' },
          { label: 'Zonas', route: '/catalogos/zonas' },
          { label: 'Categorías de gasto', route: '/catalogos/categorias-gasto' },
          { label: 'Motivos de retorno', route: '/catalogos/motivos-retorno' },
        ],
      },
    ],
  },
  {
    label: 'Administración',
    items: [
      {
        label: 'Empleados',
        icon: 'pi pi-id-card',
        route: '/empleados',
        roles: ['ADMIN', 'SUPERVISOR'],
        children: [
          { label: 'Empleados', route: '/empleados/lista' },
          { label: 'Puestos', route: '/empleados/puestos' },
        ],
      },
      {
        label: 'Usuarios y roles',
        icon: 'pi pi-shield',
        route: '/usuarios',
        roles: ['ADMIN'],
      },
    ],
  },
] as const;
