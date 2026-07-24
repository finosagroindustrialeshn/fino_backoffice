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

interface EmployeeTab {
  /** Child route path under /empleados. */
  readonly path: string;
  /** Short label shown in the tab strip. */
  readonly tabLabel: string;
  /** Heading shown above the tabs, driven by the active tab. */
  readonly title: string;
  readonly description: string;
}

const EMPLOYEE_TABS: readonly EmployeeTab[] = [
  {
    path: 'lista',
    tabLabel: 'Empleados',
    title: 'Empleados',
    description: 'Administrá el personal de planilla y sus datos laborales.',
  },
  {
    path: 'puestos',
    tabLabel: 'Puestos',
    title: 'Puestos de trabajo',
    description: 'Definí los puestos usados para clasificar a los empleados.',
  },
];

@Component({
  selector: 'app-empleados',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './empleados.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmployeesShell {
  private readonly router = inject(Router);

  protected readonly tabs = EMPLOYEE_TABS;

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
      this.tabs.find((tab) => url.includes(`/empleados/${tab.path}`)) ??
      this.tabs[0]
    );
  });
}
