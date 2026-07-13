import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { filter, map } from 'rxjs';

interface CatalogTab {
  /** Child route path under /catalogos. */
  readonly path: string;
  /** Short label shown in the tab strip. */
  readonly tabLabel: string;
  /** Heading shown above the tabs, driven by the active tab. */
  readonly title: string;
  readonly description: string;
}

const CATALOG_TABS: readonly CatalogTab[] = [
  {
    path: 'categorias-producto',
    tabLabel: 'Categorías de producto',
    title: 'Categorías de producto',
    description: 'Administrá las clasificaciones de productos del catálogo.',
  },
  {
    path: 'presentaciones',
    tabLabel: 'Presentaciones',
    title: 'Presentaciones de producto',
    description: 'Administrá los formatos de empaque disponibles en el catálogo.',
  },
  {
    path: 'zonas',
    tabLabel: 'Zonas',
    title: 'Zonas',
    description: 'Zonas de venta y reparto usadas para armar rutas.',
  },
  {
    path: 'categorias-gasto',
    tabLabel: 'Categorías de gasto',
    title: 'Categorías de gasto',
    description: 'Clasificá los gastos operativos de caja chica en la contabilidad.',
  },
  {
    path: 'motivos-retorno',
    tabLabel: 'Motivos de retorno',
    title: 'Motivos de retorno',
    description: 'Clasificá por qué un producto vuelve en un retorno.',
  },
];

@Component({
  selector: 'app-catalogos',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './catalogos.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CatalogosShell {
  private readonly router = inject(Router);

  protected readonly tabs = CATALOG_TABS;

  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  /** The tab whose route is active, so the heading/description track it. */
  protected readonly activeTab = computed(() => {
    const url = this.currentUrl();
    return (
      this.tabs.find((tab) => url.includes(`/catalogos/${tab.path}`)) ??
      this.tabs[0]
    );
  });
}
