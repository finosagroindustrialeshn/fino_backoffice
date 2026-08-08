import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { GoogleMap, MapAdvancedMarker } from '@angular/google-maps';

import { environment } from '../../../../../environments/environment';
import { GoogleMapsLoader } from '../../../../core/maps/google-maps-loader';
import {
  ROUTE_STOP_STATUS_LABELS,
  type LocatedRouteStop,
  type RouteStopStatus,
} from '../../models/route.model';

type MapStatus = 'loading' | 'ready' | 'error' | 'no-key';

/** Fallback center (San Pedro Sula) while there is nothing to frame. */
const DEFAULT_CENTER: google.maps.LatLngLiteral = { lat: 15.5041, lng: -88.025 };
/** fitBounds on a single point zooms all the way in — pin a street-level zoom. */
const SINGLE_STOP_ZOOM = 16;
/** Keeps the outermost pins clear of the map edges when framing. */
const BOUNDS_PADDING = 48;

const MARKER_COLORS: Record<RouteStopStatus, string> = {
  PENDING: '#4a6b52',
  VISITED: '#15803d',
  SKIPPED: '#b45309',
};

interface StopMarker {
  readonly stopId: string;
  readonly position: google.maps.LatLngLiteral;
  /** Rollover + screen reader text for the marker. */
  readonly title: string;
  readonly zIndex: number;
  readonly content: HTMLElement;
}

/**
 * Advanced Markers take a DOM element, not a template, so the pin is built by
 * hand. It is styled inline because Google injects the element outside any
 * Angular template, where Tailwind's class scanner never looks.
 */
function buildPin(stop: LocatedRouteStop, isSelected: boolean): HTMLElement {
  const pin = document.createElement('div');
  pin.textContent = String(stop.sortOrder);
  pin.style.cssText = [
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'width:28px',
    'height:28px',
    'border-radius:9999px',
    `background:${MARKER_COLORS[stop.status]}`,
    'color:#ffffff',
    'font-family:Inter,system-ui,sans-serif',
    'font-size:13px',
    'font-weight:600',
    'line-height:1',
    `border:2px solid ${isSelected ? '#d9a441' : '#ffffff'}`,
    'box-shadow:0 1px 4px rgba(0,0,0,0.35)',
    `transform:scale(${isSelected ? 1.15 : 1})`,
  ].join(';');
  return pin;
}

/**
 * Visit map for a route. Draws one numbered marker per stop that carries real
 * coordinates — the caller narrows with `toLocatedStops()` first, so nothing
 * here re-checks the join or Null Island.
 *
 * The map is an aid, never the source of truth: when the key is missing or the
 * script fails, it degrades to a message and the caller's stop list keeps
 * working untouched.
 */
@Component({
  selector: 'app-route-map',
  imports: [GoogleMap, MapAdvancedMarker],
  templateUrl: './route-map.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RouteMap {
  private readonly loader = inject(GoogleMapsLoader);

  readonly stops = input.required<readonly LocatedRouteStop[]>();
  /** Selection is owned by the parent so map and list never disagree. */
  readonly selectedStopId = input<string | null>(null);
  /** Null when the user dismisses the on-map card. */
  readonly stopSelected = output<string | null>();

  protected readonly status = signal<MapStatus>('loading');
  private readonly mapInstance = signal<google.maps.Map | null>(null);

  protected readonly defaultCenter = DEFAULT_CENTER;
  protected readonly defaultZoom = 13;

  protected readonly markers = computed<readonly StopMarker[]>(() => {
    const selectedId = this.selectedStopId();
    return this.stops().map((stop) => ({
      stopId: stop.id,
      position: { lat: stop.client.latitude, lng: stop.client.longitude },
      title: `${stop.sortOrder}. ${stop.client.name} — ${ROUTE_STOP_STATUS_LABELS[stop.status]}`,
      zIndex: stop.id === selectedId ? 1000 : stop.sortOrder,
      content: buildPin(stop, stop.id === selectedId),
    }));
  });

  protected readonly selectedStop = computed<LocatedRouteStop | null>(() => {
    const selectedId = this.selectedStopId();
    if (!selectedId) {
      return null;
    }
    return this.stops().find((stop) => stop.id === selectedId) ?? null;
  });

  /**
   * Only a change in the plotted COORDINATES re-frames the map. Marking a stop
   * visited rebuilds every marker, and refitting on that would yank the map
   * back from wherever the user had panned it.
   */
  private readonly boundsKey = computed(() =>
    this.stops()
      .map((stop) => `${stop.client.latitude},${stop.client.longitude}`)
      .join('|'),
  );

  protected readonly mapOptions: google.maps.MapOptions = {
    // Advanced Markers require a Map ID. DEMO_MAP_ID is fine for prototyping;
    // set MAPS_MAP_ID in .env for a production Cloud-styled map.
    mapId: environment.mapsMapId || 'DEMO_MAP_ID',
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    clickableIcons: false,
  };

  constructor() {
    if (!this.loader.hasKey) {
      this.status.set('no-key');
    } else {
      this.loader.load().then(
        () => this.status.set('ready'),
        () => this.status.set('error'),
      );
    }

    effect(() => {
      const map = this.mapInstance();
      this.boundsKey();
      if (!map) {
        return;
      }
      this.frame(
        map,
        untracked(() => this.markers()),
      );
    });

    /**
     * Selecting a stop in the LIST has to bring the map to it. The marker is
     * often outside the current viewport, and highlighting something the user
     * cannot see is not feedback. panTo animates, so they keep their bearings
     * instead of being teleported.
     */
    effect(() => {
      const map = this.mapInstance();
      const stop = this.selectedStop();
      if (!map || !stop) {
        return;
      }
      map.panTo({ lat: stop.client.latitude, lng: stop.client.longitude });
    });
  }

  protected onMapInitialized(map: google.maps.Map): void {
    this.mapInstance.set(map);
  }

  private frame(map: google.maps.Map, markers: readonly StopMarker[]): void {
    const [first, ...rest] = markers;
    if (!first) {
      return;
    }
    if (rest.length === 0) {
      map.setCenter(first.position);
      map.setZoom(SINGLE_STOP_ZOOM);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    for (const marker of markers) {
      bounds.extend(marker.position);
    }
    map.fitBounds(bounds, BOUNDS_PADDING);
  }
}
