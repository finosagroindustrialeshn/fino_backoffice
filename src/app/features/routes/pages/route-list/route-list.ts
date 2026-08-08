import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ConfirmationService, type MenuItem } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DatePickerModule } from 'primeng/datepicker';
import { Menu, MenuModule } from 'primeng/menu';
import { SelectModule } from 'primeng/select';
import { Table, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

import { AuthSession } from '../../../../core/auth/auth-session';
import { LazyList } from '../../../../core/http/lazy-list';
import { formatDay } from '../../../../shared/utils/date-range';
import { ZoneDataClient } from '../../../catalogs/zones/services/zone-data';
import { UserDataClient } from '../../../users/services/user-data';
import {
  RouteFormDialog,
  type RouteLookupOption,
} from '../../components/route-form-dialog/route-form-dialog';
import {
  ROUTE_STATUS_LABELS,
  ROUTE_STATUS_SEVERITY,
  ROUTE_STATUS_TRANSITIONS,
  type Route,
  type RouteDetail,
  type RouteStatus,
  type RouteStatusSeverity,
} from '../../models/route.model';
import { RouteDataClient } from '../../services/route-data';

/** Sellers and zones are bounded lookups joined to the paginated routes. */
const LOOKUP_SIZE = 100;

interface SelectOption<T> {
  readonly label: string;
  readonly value: T;
}

@Component({
  selector: 'app-route-list',
  imports: [
    FormsModule,
    RouterLink,
    ButtonModule,
    ConfirmDialogModule,
    DatePickerModule,
    MenuModule,
    RouteFormDialog,
    SelectModule,
    TableModule,
    TagModule,
  ],
  templateUrl: './route-list.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ConfirmationService],
})
export class RouteList implements OnInit {
  private readonly routes = inject(RouteDataClient);
  private readonly users = inject(UserDataClient);
  private readonly zones = inject(ZoneDataClient);
  private readonly auth = inject(AuthSession);
  private readonly confirmation = inject(ConfirmationService);
  private readonly router = inject(Router);
  private readonly table = viewChild.required<Table>('dt');
  private readonly statusMenu = viewChild.required<Menu>('statusMenu');

  protected readonly rowsPerPageOptions = [5, 10, 20, 50];

  /** DELETE /routes/:id is the only routes endpoint restricted by role. */
  protected readonly canDelete = computed(() => {
    const role = this.auth.role();
    return role === 'ADMIN' || role === 'SUPERVISOR';
  });

  // Filters — read inside the fetcher closure so reload() uses the latest values.
  protected readonly sellerFilter = signal<string | null>(null);
  protected readonly statusFilter = signal<RouteStatus | null>(null);
  /** [start, end] from the range datepicker; either end may be null mid-select. */
  protected readonly dateRange = signal<Date[] | null>(null);

  private readonly sellerNames = signal<ReadonlyMap<string, string>>(new Map());
  private readonly zoneNames = signal<ReadonlyMap<string, string>>(new Map());

  protected readonly sellerFilterOptions = computed<SelectOption<string | null>[]>(
    () => [
      { label: 'Todos los vendedores', value: null },
      ...[...this.sellerNames()].map(([id, name]) => ({
        label: name,
        value: id as string | null,
      })),
    ],
  );

  protected readonly statusFilterOptions: SelectOption<RouteStatus | null>[] = [
    { label: 'Todos los estados', value: null },
    ...(Object.keys(ROUTE_STATUS_LABELS) as RouteStatus[]).map((value) => ({
      label: ROUTE_STATUS_LABELS[value],
      value: value as RouteStatus | null,
    })),
  ];

  /** Lookups handed to the create dialog, so it does not refetch what is here. */
  protected readonly sellerOptions = computed<RouteLookupOption[]>(() =>
    [...this.sellerNames()].map(([id, name]) => ({ label: name, value: id })),
  );
  protected readonly zoneOptions = computed<RouteLookupOption[]>(() =>
    [...this.zoneNames()].map(([id, name]) => ({ label: name, value: id })),
  );

  protected readonly list = new LazyList<Route>((page, pageSize) => {
    const range = this.dateRange();
    return this.routes.list({
      page,
      pageSize,
      sellerId: this.sellerFilter() ?? undefined,
      status: this.statusFilter() ?? undefined,
      dateFrom: range?.[0] ? formatDay(range[0]) : undefined,
      dateTo: range?.[1] ? formatDay(range[1]) : undefined,
    });
  }, 'No se pudieron cargar las rutas.');

  private readonly pendingIds = signal<ReadonlySet<string>>(new Set());
  private readonly rowErrors = signal<Readonly<Record<string, string>>>({});

  protected readonly createOpen = signal(false);

  /** Row whose status menu is open — drives {@link statusMenuItems}. */
  private readonly statusTarget = signal<Route | null>(null);

  protected readonly statusMenuItems = computed<MenuItem[]>(() => {
    const route = this.statusTarget();
    if (!route) {
      return [];
    }
    return ROUTE_STATUS_TRANSITIONS[route.status].map((next) => ({
      label: ROUTE_STATUS_LABELS[next],
      command: () => {
        void this.changeStatus(route, next);
      },
    }));
  });

  ngOnInit(): void {
    void this.loadLookups();
  }

  protected onSellerFilterChange(sellerId: string | null): void {
    this.sellerFilter.set(sellerId);
    // reset() jumps to page 1 and re-fires onLazyLoad with the new filter.
    this.table().reset();
  }

  protected onStatusFilterChange(status: RouteStatus | null): void {
    this.statusFilter.set(status);
    this.table().reset();
  }

  protected onDateRangeChange(range: Date[] | null): void {
    this.dateRange.set(range);
    // Refetch once the range is complete (both ends) or cleared.
    if (!range || range.length === 0 || (range[0] && range[1])) {
      this.table().reset();
    }
  }

  protected statusLabel(status: RouteStatus): string {
    return ROUTE_STATUS_LABELS[status];
  }

  protected statusSeverity(status: RouteStatus): RouteStatusSeverity {
    return ROUTE_STATUS_SEVERITY[status];
  }

  protected sellerName(sellerId: string): string {
    return this.sellerNames().get(sellerId) ?? '—';
  }

  protected zoneName(zoneId: string | null): string {
    if (!zoneId) {
      return 'Sin zona';
    }
    return this.zoneNames().get(zoneId) ?? '—';
  }

  /** Closed routes have nowhere left to move, so the action is hidden. */
  protected hasTransitions(status: RouteStatus): boolean {
    return ROUTE_STATUS_TRANSITIONS[status].length > 0;
  }

  protected isPending(id: string): boolean {
    return this.pendingIds().has(id);
  }

  protected rowError(id: string): string | undefined {
    return this.rowErrors()[id];
  }

  protected openStatusMenu(route: Route, event: Event): void {
    this.statusTarget.set(route);
    this.statusMenu().toggle(event);
  }

  protected openCreate(): void {
    this.createOpen.set(true);
  }

  /**
   * A new route is an empty shell — its clients are added on the detail
   * screen, so the user is taken straight there instead of back to the list.
   */
  protected onRouteCreated(route: RouteDetail): void {
    void this.router.navigate(['/mapa', route.id]);
  }

  private async changeStatus(route: Route, status: RouteStatus): Promise<void> {
    this.startPending(route.id);
    this.clearRowError(route.id);
    try {
      await firstValueFrom(this.routes.updateStatus(route.id, status));
      this.list.reload();
    } catch (error) {
      this.setRowError(
        route.id,
        this.toMessage(error, 'No se pudo actualizar el estado.'),
      );
    } finally {
      this.stopPending(route.id);
    }
  }

  /**
   * Deletion drops the stops with the route, so the visit history goes with
   * it. The API itself recommends CANCELLED instead, and the copy says so.
   */
  protected confirmDelete(route: Route): void {
    this.confirmation.confirm({
      header: 'Eliminar ruta',
      message: `¿Eliminar esta ruta? La ruta del ${this.dayLabel(route.date)} y sus paradas se borrarán de forma permanente. Marcarla como "Cancelada" conserva el historial de visitas; eliminarla lo borra todo.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      // Not "Cancelar": the message talks about cancelling the ROUTE, and the
      // same word on the dismiss button would read as that action.
      rejectLabel: 'Volver',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        void this.remove(route);
      },
    });
  }

  private async remove(route: Route): Promise<void> {
    this.startPending(route.id);
    this.clearRowError(route.id);
    try {
      await firstValueFrom(this.routes.remove(route.id));
      this.list.reload();
    } catch (error) {
      this.setRowError(
        route.id,
        this.toMessage(error, 'No se pudo eliminar la ruta.'),
      );
    } finally {
      this.stopPending(route.id);
    }
  }

  private async loadLookups(): Promise<void> {
    try {
      const [sellers, zones] = await Promise.all([
        firstValueFrom(
          this.users.list({ role: 'SELLER', pageSize: LOOKUP_SIZE }),
        ),
        firstValueFrom(this.zones.list({ pageSize: LOOKUP_SIZE })),
      ]);
      this.sellerNames.set(
        new Map(sellers.items.map((user) => [user.id, user.fullName])),
      );
      this.zoneNames.set(
        new Map(zones.items.map((zone) => [zone.id, zone.name])),
      );
    } catch {
      // Names fall back to a dash and the filters keep only their "all" option.
    }
  }

  /**
   * The route day is a calendar day pinned at UTC midnight, so it is read from
   * its UTC parts — localizing it would roll it back a day in Honduras (UTC-6),
   * which is why this replaces `DatePipe` for every route date on screen.
   */
  protected dayLabel(iso: string): string {
    const date = new Date(iso);
    const day = `${date.getUTCDate()}`.padStart(2, '0');
    const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
    return `${day}/${month}/${date.getUTCFullYear()}`;
  }

  private startPending(id: string): void {
    this.pendingIds.update((ids) => new Set(ids).add(id));
  }

  private stopPending(id: string): void {
    this.pendingIds.update((ids) => {
      const next = new Set(ids);
      next.delete(id);
      return next;
    });
  }

  private setRowError(id: string, message: string): void {
    this.rowErrors.update((errors) => ({ ...errors, [id]: message }));
  }

  private clearRowError(id: string): void {
    this.rowErrors.update((errors) => {
      const { [id]: _removed, ...rest } = errors;
      return rest;
    });
  }

  private toMessage(error: unknown, fallback: string): string {
    if (
      error &&
      typeof error === 'object' &&
      'message' in error &&
      typeof (error as { message: unknown }).message === 'string'
    ) {
      return (error as { message: string }).message;
    }
    return fallback;
  }
}
