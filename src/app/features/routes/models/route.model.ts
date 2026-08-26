import type { Client, LastPurchase } from '../../clients/models/client.model';

/** Lifecycle of a route. COMPLETED and CANCELLED are final. */
export type RouteStatus =
  | 'PLANNED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

export const ROUTE_STATUS_LABELS: Record<RouteStatus, string> = {
  PLANNED: 'Planificada',
  IN_PROGRESS: 'En curso',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
};

export type RouteStatusSeverity = 'info' | 'warn' | 'success' | 'danger';

export const ROUTE_STATUS_SEVERITY: Record<RouteStatus, RouteStatusSeverity> = {
  PLANNED: 'info',
  IN_PROGRESS: 'warn',
  COMPLETED: 'success',
  CANCELLED: 'danger',
};

/**
 * Transitions the API accepts, mirroring PATCH /routes/:id/status. Re-sending
 * the current status is a no-op server-side, so it is left out here: this map
 * answers "where can the user move it", not "what will not 409".
 */
export const ROUTE_STATUS_TRANSITIONS: Record<
  RouteStatus,
  readonly RouteStatus[]
> = {
  PLANNED: ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

/** A closed route rejects edits and stop changes with 409 ROUTE_CLOSED. */
export function isRouteClosed(status: RouteStatus): boolean {
  return status === 'COMPLETED' || status === 'CANCELLED';
}

/** Visit outcome of a single stop. */
export type RouteStopStatus = 'PENDING' | 'VISITED' | 'SKIPPED';

export const ROUTE_STOP_STATUS_LABELS: Record<RouteStopStatus, string> = {
  PENDING: 'Pendiente',
  VISITED: 'Visitado',
  SKIPPED: 'Omitido',
};

export type RouteStopStatusSeverity = 'info' | 'success' | 'warn';

export const ROUTE_STOP_STATUS_SEVERITY: Record<
  RouteStopStatus,
  RouteStopStatusSeverity
> = {
  PENDING: 'info',
  VISITED: 'success',
  SKIPPED: 'warn',
};

export interface RouteStop {
  readonly id: string;
  readonly routeId: string;
  readonly clientId: string;
  /**
   * The client to visit, embedded by the API so a stop renders — name, phone,
   * address, photo and GPS — without a second call.
   *
   * Null only on a stop returned WITHOUT the join, which is exactly what
   * POST /routes/:id/stops and PATCH .../status return. Refetch the route
   * after those calls rather than trusting the returned stop to draw a marker.
   */
  readonly client: Client | null;
  /** Last sale with its lines, so the seller can repeat it on the spot. */
  readonly lastPurchase: LastPurchase | null;
  readonly sortOrder: number;
  readonly status: RouteStopStatus;
  /** ISO 8601 UTC, or null while the stop is still PENDING. */
  readonly visitedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface Route {
  readonly id: string;
  /** ISO 8601 UTC timestamp of the route day — localize only for display. */
  readonly date: string;
  readonly sellerId: string;
  readonly zoneId: string | null;
  readonly status: RouteStatus;
  readonly notes: string | null;
  /**
   * Ordered stops. Optional because the API only guarantees them on
   * GET /routes/:id — the list endpoint may omit them.
   */
  readonly stops?: readonly RouteStop[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** A route from GET /routes/:id, where stops are always joined. */
export interface RouteDetail extends Route {
  readonly stops: readonly RouteStop[];
}

export interface RoutePayload {
  /** Route day as YYYY-MM-DD — a calendar day, not an instant. */
  readonly date: string;
  /** Defaults to the authenticated user. ADMIN/SUPERVISOR may set another. */
  readonly sellerId?: string;
  readonly zoneId?: string;
  readonly notes?: string;
}

/** PATCH /routes/:id — the seller cannot be reassigned, status has its own route. */
export type RouteUpdatePayload = Partial<Omit<RoutePayload, 'sellerId'>>;

export interface RouteStopPayload {
  readonly clientId: string;
  /** Visit order. Omit to let the API append. */
  readonly sortOrder?: number;
}

/**
 * A stop that carries its client, so it can be placed on the map. Narrowing
 * to this once keeps every consumer from re-checking `client` for null.
 */
export type LocatedRouteStop = RouteStop & { readonly client: Client };

/**
 * A client at 0,0 is the API's "no GPS captured yet" — Null Island is not a
 * real location, so a marker there would be a lie on the map.
 */
export function hasCoordinates(client: Client): boolean {
  return client.latitude !== 0 || client.longitude !== 0;
}

/** Stops that can actually be drawn: joined client AND real coordinates. */
export function toLocatedStops(
  stops: readonly RouteStop[],
): readonly LocatedRouteStop[] {
  return stops.filter(
    (stop): stop is LocatedRouteStop =>
      stop.client !== null && hasCoordinates(stop.client),
  );
}

/**
 * Body of `PATCH /routes/:id/stops/order`.
 *
 * The WHOLE order, never one stop at a time: a reorder moves several
 * positions at once, and applying it stop by stop would leave the agenda
 * readable mid-way with positions colliding until the last call landed.
 * Sending the complete list also makes the request safe to repeat.
 */
export interface ReorderRouteStopsPayload {
  /**
   * Every stop on the route, exactly once, in visit order. A partial list is
   * refused with ROUTE_STOP_ORDER_INVALID.
   */
  readonly stopIds: readonly string[];
}
