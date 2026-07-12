export interface NavItem {
  readonly label: string;
  /** PrimeIcons class, e.g. 'pi pi-th-large'. */
  readonly icon: string;
  readonly route: string;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Dashboard', icon: 'pi pi-th-large', route: '/dashboard' },
  { label: 'Despacho', icon: 'pi pi-box', route: '/despacho' },
  { label: 'Retorno', icon: 'pi pi-replay', route: '/retorno' },
  { label: 'Mapa de rutas', icon: 'pi pi-map', route: '/mapa' },
  { label: 'Clientes', icon: 'pi pi-users', route: '/clientes' },
  { label: 'Contabilidad', icon: 'pi pi-calculator', route: '/contabilidad' },
  { label: 'Usuarios y roles', icon: 'pi pi-shield', route: '/usuarios' },
] as const;
