import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ConfirmationService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { SkeletonModule } from 'primeng/skeleton';
import { TagModule } from 'primeng/tag';

import { parseUuid } from '../../../../shared/utils/query-params';
import { ZoneDataClient } from '../../../catalogs/zones/services/zone-data';
import { UserDataClient } from '../../../users/services/user-data';
import {
  AddStopDialog,
  type AddStopSelection,
} from '../../components/add-stop-dialog/add-stop-dialog';
import { RouteMap } from '../../components/route-map/route-map';
import {
  hasCoordinates,
  isRouteClosed,
  ROUTE_STATUS_LABELS,
  ROUTE_STATUS_SEVERITY,
  ROUTE_STATUS_TRANSITIONS,
  ROUTE_STOP_STATUS_LABELS,
  ROUTE_STOP_STATUS_SEVERITY,
  toLocatedStops,
  type RouteDetail as RouteDetailDto,
  type RouteStatus,
  type RouteStop,
  type RouteStopStatus,
} from '../../models/route.model';
import { RouteDataClient } from '../../services/route-data';

/** Zones are a bounded catalog — one page is enough to name the route's zone. */
const ZONE_LOOKUP_SIZE = 200;

/**
 * Each action carries the same severity as the tag of the state it produces,
 * so "Marcar visitado" is the green the VISITED tag will become. A grey button
 * for a coloured outcome makes the user guess the mapping.
 */
const STOP_STATUS_ACTIONS: Record<
  RouteStopStatus,
  {
    readonly label: string;
    readonly icon: string;
    readonly severity: 'secondary' | 'success' | 'warn';
  }
> = {
  // Back to PENDING is an undo, not an outcome — it stays neutral.
  PENDING: { label: 'Marcar pendiente', icon: 'pi pi-undo', severity: 'secondary' },
  VISITED: { label: 'Marcar visitado', icon: 'pi pi-check', severity: 'success' },
  SKIPPED: { label: 'Marcar omitido', icon: 'pi pi-forward', severity: 'warn' },
};

/**
 * How a transition reads as an action, rather than as a state name.
 *
 * Advancing the route is what this screen is FOR, so those read as the primary
 * action: solid brand green, the same weight as "Crear despacho" elsewhere.
 * `null` severity means exactly that — PrimeNG falls back to the preset's
 * primary. Only cancelling is destructive, and it stays outlined so it never
 * competes with the action the user actually came to perform.
 */
const STATUS_ACTIONS: Record<
  RouteStatus,
  {
    readonly label: string;
    readonly icon: string;
    readonly severity: 'danger' | null;
  }
> = {
  PLANNED: {
    label: 'Volver a planificada',
    icon: 'pi pi-undo',
    severity: null,
  },
  IN_PROGRESS: {
    label: 'Iniciar ruta',
    icon: 'pi pi-play',
    severity: null,
  },
  COMPLETED: {
    label: 'Completar ruta',
    icon: 'pi pi-check',
    severity: null,
  },
  CANCELLED: {
    label: 'Cancelar ruta',
    icon: 'pi pi-times',
    severity: 'danger',
  },
};

/** Closing a route is one-way: the API then rejects every edit with 409. */
const FINAL_STATUS_CONFIRM: Record<
  'COMPLETED' | 'CANCELLED',
  { readonly header: string; readonly message: string }
> = {
  COMPLETED: {
    header: 'Completar ruta',
    message: 'Una ruta completada ya no admite cambios en sus paradas. ¿Deseas completarla?',
  },
  CANCELLED: {
    header: 'Cancelar ruta',
    message: 'Una ruta cancelada ya no admite cambios en sus paradas. ¿Deseas cancelarla?',
  },
};

type DetailState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly route: RouteDetailDto }
  | { readonly status: 'error'; readonly message: string };

/**
 * Route detail: the day's visit plan as a map plus an ordered stop list.
 *
 * The whole page costs a single GET /routes/:id — every stop already carries
 * its client (name, phone, address, GPS), so nothing here fetches per stop.
 * Mutating endpoints answer WITHOUT that join, so every mutation is followed by
 * a refetch instead of patching the response into local state.
 */
@Component({
  selector: 'app-route-detail',
  imports: [
    CurrencyPipe,
    DatePipe,
    RouterLink,
    AddStopDialog,
    ButtonModule,
    ConfirmDialogModule,
    RouteMap,
    SkeletonModule,
    TagModule,
  ],
  templateUrl: './route-detail.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ConfirmationService],
})
export class RouteDetail implements OnInit {
  private readonly routes = inject(RouteDataClient);
  private readonly users = inject(UserDataClient);
  private readonly zones = inject(ZoneDataClient);
  private readonly confirmation = inject(ConfirmationService);
  private readonly activated = inject(ActivatedRoute);

  protected readonly statusLabels = ROUTE_STATUS_LABELS;
  protected readonly statusSeverity = ROUTE_STATUS_SEVERITY;
  protected readonly stopStatusLabels = ROUTE_STOP_STATUS_LABELS;
  protected readonly stopStatusSeverity = ROUTE_STOP_STATUS_SEVERITY;
  protected readonly stopStatusActions = STOP_STATUS_ACTIONS;
  protected readonly statusActions = STATUS_ACTIONS;
  protected readonly stopStatuses: readonly RouteStopStatus[] = ['PENDING', 'VISITED', 'SKIPPED'];

  private readonly pathParams = toSignal(this.activated.paramMap, {
    initialValue: this.activated.snapshot.paramMap,
  });

  /** Route params are user input too — a hand-edited id never reaches the API. */
  protected readonly routeId = computed(() => parseUuid(this.pathParams().get('id')));

  protected readonly state = signal<DetailState>({ status: 'loading' });

  protected readonly detail = computed<RouteDetailDto | null>(() => {
    const state = this.state();
    return state.status === 'success' ? state.route : null;
  });

  protected readonly isLoading = computed(() => this.state().status === 'loading');

  protected readonly errorMessage = computed<string | null>(() => {
    const state = this.state();
    return state.status === 'error' ? state.message : null;
  });

  protected readonly stops = computed<readonly RouteStop[]>(() => this.detail()?.stops ?? []);

  /** Only these can be drawn: joined client AND real coordinates. */
  protected readonly locatedStops = computed(() => toLocatedStops(this.stops()));

  /**
   * Stops the map cannot place. Listing them keeps the marker count from
   * silently disagreeing with the stop count.
   */
  protected readonly unplaceableStops = computed(() =>
    this.stops().filter((stop) => !stop.client || !hasCoordinates(stop.client)),
  );

  /** A missing route counts as closed: nothing may be mutated either way. */
  protected readonly isClosed = computed(() => {
    const detail = this.detail();
    return detail === null || isRouteClosed(detail.status);
  });

  protected readonly transitions = computed<readonly RouteStatus[]>(() => {
    const detail = this.detail();
    return detail ? ROUTE_STATUS_TRANSITIONS[detail.status] : [];
  });

  /** A client may appear only once per route, so these are never offered again. */
  protected readonly stopClientIds = computed(() => this.stops().map((stop) => stop.clientId));

  protected readonly nextSortOrder = computed(
    () => Math.max(0, ...this.stops().map((stop) => stop.sortOrder)) + 1,
  );

  protected readonly sellerName = signal<string | null>(null);
  protected readonly zoneName = signal<string | null>(null);

  /** Shared by the map and the list so both always point at the same stop. */
  protected readonly selectedStopId = signal<string | null>(null);

  /** Announced for screen readers, which never see the map's own card. */
  protected readonly selectionAnnouncement = computed(() => {
    const selectedId = this.selectedStopId();
    if (!selectedId) {
      return '';
    }
    const stop = this.stops().find((candidate) => candidate.id === selectedId);
    if (!stop) {
      return '';
    }
    return `Parada ${stop.sortOrder} seleccionada: ${stop.client?.name ?? 'cliente sin datos'}.`;
  });

  protected readonly addDialogVisible = signal(false);
  protected readonly addPending = signal(false);
  protected readonly statusPending = signal(false);
  /** Route-level failures (status change, adding a stop). */
  protected readonly actionError = signal<string | null>(null);
  private readonly pendingIds = signal<ReadonlySet<string>>(new Set());
  private readonly rowErrors = signal<Readonly<Record<string, string>>>({});

  constructor() {
    // The effect skips its own first run: ngOnInit already performs the initial
    // load, so an unguarded effect would double the request.
    let isFirstRun = true;
    effect(() => {
      this.routeId();
      if (isFirstRun) {
        isFirstRun = false;
        return;
      }
      void this.load();
    });
  }

  ngOnInit(): void {
    void this.load();
  }

  protected async load(): Promise<void> {
    const id = this.routeId();
    if (!id) {
      this.state.set({
        status: 'error',
        message: 'La ruta solicitada no existe.',
      });
      return;
    }
    this.state.set({ status: 'loading' });
    this.actionError.set(null);
    this.selectedStopId.set(null);
    try {
      const detail = await firstValueFrom(this.routes.get(id));
      this.state.set({ status: 'success', route: detail });
      void this.resolveSeller(detail.sellerId);
      void this.resolveZone(detail.zoneId);
    } catch (error) {
      this.state.set({
        status: 'error',
        message: this.toMessage(error, 'No se pudo cargar la ruta.'),
      });
    }
  }

  protected onMapSelection(stopId: string | null): void {
    this.selectedStopId.set(stopId);
    if (stopId) {
      document.getElementById(`stop-row-${stopId}`)?.scrollIntoView({ block: 'nearest' });
    }
  }

  protected selectStop(stopId: string): void {
    this.selectedStopId.update((current) => (current === stopId ? null : stopId));
  }

  protected requestStatusChange(next: RouteStatus): void {
    if (next !== 'COMPLETED' && next !== 'CANCELLED') {
      void this.changeStatus(next);
      return;
    }
    const copy = FINAL_STATUS_CONFIRM[next];
    this.confirmation.confirm({
      header: copy.header,
      message: copy.message,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Confirmar',
      rejectLabel: 'Volver',
      accept: () => {
        void this.changeStatus(next);
      },
    });
  }

  protected async setStopStatus(stop: RouteStop, status: RouteStopStatus): Promise<void> {
    const id = this.routeId();
    if (!id) {
      return;
    }
    this.startPending(stop.id);
    this.clearRowError(stop.id);
    try {
      await firstValueFrom(this.routes.updateStopStatus(id, stop.id, status));
      await this.refresh();
    } catch (error) {
      this.setRowError(stop.id, this.toMessage(error, 'No se pudo actualizar la parada.'));
    } finally {
      this.stopPending(stop.id);
    }
  }

  protected confirmRemoveStop(stop: RouteStop): void {
    const name = stop.client?.name ?? 'este cliente';
    this.confirmation.confirm({
      header: 'Quitar parada',
      message: `¿Quitar a ${name} de la ruta? El orden de las demás paradas no cambia.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Quitar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        void this.removeStop(stop);
      },
    });
  }

  protected async onStopAdded(selection: AddStopSelection): Promise<void> {
    const id = this.routeId();
    if (!id) {
      return;
    }
    this.addPending.set(true);
    this.actionError.set(null);
    try {
      await firstValueFrom(
        this.routes.addStop(id, {
          clientId: selection.clientId,
          sortOrder: selection.sortOrder,
        }),
      );
      this.addDialogVisible.set(false);
      await this.refresh();
    } catch (error) {
      this.actionError.set(this.toMessage(error, 'No se pudo agregar la parada.'));
    } finally {
      this.addPending.set(false);
    }
  }

  protected isPending(id: string): boolean {
    return this.pendingIds().has(id);
  }

  protected rowError(id: string): string | undefined {
    return this.rowErrors()[id];
  }

  private async changeStatus(next: RouteStatus): Promise<void> {
    const id = this.routeId();
    if (!id) {
      return;
    }
    this.statusPending.set(true);
    this.actionError.set(null);
    try {
      await firstValueFrom(this.routes.updateStatus(id, next));
      await this.refresh();
    } catch (error) {
      this.actionError.set(this.toMessage(error, 'No se pudo cambiar el estado de la ruta.'));
    } finally {
      this.statusPending.set(false);
    }
  }

  private async removeStop(stop: RouteStop): Promise<void> {
    const id = this.routeId();
    if (!id) {
      return;
    }
    this.startPending(stop.id);
    this.clearRowError(stop.id);
    try {
      await firstValueFrom(this.routes.removeStop(id, stop.id));
      if (this.selectedStopId() === stop.id) {
        this.selectedStopId.set(null);
      }
      await this.refresh();
    } catch (error) {
      this.setRowError(stop.id, this.toMessage(error, 'No se pudo quitar la parada.'));
    } finally {
      this.stopPending(stop.id);
    }
  }

  /**
   * Re-reads the route after a mutation. Mutating endpoints answer with a stop
   * whose client is NOT joined, so their response can never feed the map — only
   * GET /routes/:id carries the coordinates the markers need.
   */
  private async refresh(): Promise<void> {
    const id = this.routeId();
    if (!id) {
      return;
    }
    const detail = await firstValueFrom(this.routes.get(id));
    this.state.set({ status: 'success', route: detail });
  }

  private async resolveSeller(sellerId: string): Promise<void> {
    this.sellerName.set(null);
    try {
      const seller = await firstValueFrom(this.users.get(sellerId));
      this.sellerName.set(seller.fullName);
    } catch {
      // The header simply shows a dash — the route itself is already usable.
    }
  }

  private async resolveZone(zoneId: string | null): Promise<void> {
    this.zoneName.set(null);
    if (!zoneId) {
      return;
    }
    try {
      const page = await firstValueFrom(
        this.zones.list({ pageSize: ZONE_LOOKUP_SIZE, includeInactive: true }),
      );
      const zone = page.items.find((candidate) => candidate.id === zoneId);
      this.zoneName.set(zone?.name ?? null);
    } catch {
      // Same as the seller: a missing label never blocks the visit plan.
    }
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
