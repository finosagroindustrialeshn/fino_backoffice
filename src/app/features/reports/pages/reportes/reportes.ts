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

interface ReportTab {
  /** Child route path under /reportes. */
  readonly path: string;
  /** Short label shown in the tab strip. */
  readonly tabLabel: string;
  /** Heading shown above the tabs, driven by the active tab. */
  readonly title: string;
  readonly description: string;
}

const REPORT_TABS: readonly ReportTab[] = [
  {
    path: 'ventas',
    tabLabel: 'Ventas',
    title: 'Reporte de ventas',
    description:
      'Totales del período, contado vs. crédito, y el ranking por producto y por vendedor.',
  },
  {
    path: 'caja',
    tabLabel: 'Caja',
    title: 'Cierre de caja',
    description:
      'Cierre consolidado por día y el arqueo de cada jornada y caja, sobre el día civil de Honduras.',
  },
  {
    path: 'inventario',
    tabLabel: 'Inventario',
    title: 'Reporte de inventario',
    description:
      'Existencias de bodega, kardex por producto y el stock que carga cada vendedor.',
  },
];

@Component({
  selector: 'app-reportes',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './reportes.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReportesShell {
  private readonly router = inject(Router);

  protected readonly tabs = REPORT_TABS;

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
      this.tabs.find((tab) => url.includes(`/reportes/${tab.path}`)) ??
      this.tabs[0]
    );
  });
}
