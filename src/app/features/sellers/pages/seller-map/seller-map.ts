import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  OnDestroy,
  OnInit,
  signal,
  untracked,
} from '@angular/core';
import { GoogleMap, MapAdvancedMarker } from '@angular/google-maps';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../../../../environments/environment';
import { GoogleMapsLoader } from '../../../../core/maps/google-maps-loader';
import { UserDataClient } from '../../../users/services/user-data';
import {
  ageMs,
  isLive,
  type SellerLocation,
} from '../../models/seller-location.model';
import { SellerLocationDataClient } from '../../services/seller-location-data';

type MapStatus = 'loading' | 'ready' | 'error' | 'no-key';

/** Sellers are a bounded list — one page is enough to name every marker. */
const SELLER_LOOKUP_SIZE = 100;
/** How often "hace X minutos" is recomputed, and markers restyled as they age. */
const CLOCK_TICK_MS = 30_000;
/** Map center (San Pedro Sula) used until there is something to frame. */
const DEFAULT_CENTER: google.maps.LatLngLiteral = { lat: 15.5041, lng: -88.025 };
/** fitBounds on a single point zooms all the way in — pin a street-level zoom. */
const SINGLE_SELLER_ZOOM = 15;
const BOUNDS_PADDING = 64;

const LIVE_COLOR = '#2d5e3a';
const STALE_COLOR = '#8b8168';

interface SellerMarker {
  readonly sellerId: string;
  readonly position: google.maps.LatLngLiteral;
  readonly title: string;
  readonly zIndex: number;
  readonly content: HTMLElement;
}

/**
 * Advanced Markers take a DOM element, so the pin is built by hand. It is
 * styled inline because Google mounts the element outside any Angular
 * template, where Tailwind's class scanner never looks.
 */
function buildPin(initial: string, live: boolean, selected: boolean): HTMLElement {
  const pin = document.createElement('div');
  pin.textContent = initial;
  pin.style.cssText = [
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'width:30px',
    'height:30px',
    'border-radius:9999px',
    `background:${live ? LIVE_COLOR : STALE_COLOR}`,
    'color:#ffffff',
    'font-family:Inter,system-ui,sans-serif',
    'font-size:13px',
    'font-weight:600',
    'line-height:1',
    `border:2px solid ${selected ? '#d9a441' : '#ffffff'}`,
    'box-shadow:0 1px 4px rgba(0,0,0,0.35)',
    `transform:scale(${selected ? 1.15 : 1})`,
  ].join(';');
  return pin;
}

function initialOf(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?';
}

/**
 * Live map of where the sellers are, straight from Realtime Database.
 *
 * The map is the whole screen: this answers one question, "where is everyone
 * right now", and anything else on the page competes with it.
 */
@Component({
  selector: 'app-seller-map',
  imports: [GoogleMap, MapAdvancedMarker],
  templateUrl: './seller-map.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Owned by this page so the Realtime Database listener dies with it.
  providers: [SellerLocationDataClient],
})
export class SellerMap implements OnInit, OnDestroy {
  private readonly loader = inject(GoogleMapsLoader);
  private readonly locationsClient = inject(SellerLocationDataClient);
  private readonly users = inject(UserDataClient);

  protected readonly status = signal<MapStatus>('loading');
  protected readonly feedError = signal<string | null>(null);
  /** Null until the first snapshot arrives, which is what tells loading apart from empty. */
  protected readonly locations = signal<readonly SellerLocation[] | null>(null);
  protected readonly selectedSellerId = signal<string | null>(null);

  private readonly sellerNames = signal<Readonly<Record<string, string>>>({});
  /** Drives the relative timestamps, so "hace 2 minutos" does not freeze. */
  private readonly now = signal(Date.now());
  private clock: ReturnType<typeof setInterval> | null = null;

  private readonly mapInstance = signal<google.maps.Map | null>(null);

  protected readonly defaultCenter = DEFAULT_CENTER;
  protected readonly defaultZoom = 12;

  protected readonly mapOptions: google.maps.MapOptions = {
    // Advanced Markers require a Map ID. DEMO_MAP_ID is fine for prototyping;
    // set MAPS_MAP_ID in .env for a production Cloud-styled map.
    mapId: environment.mapsMapId || 'DEMO_MAP_ID',
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    clickableIcons: false,
  };

  protected readonly isLoadingFeed = computed(() => this.locations() === null);
  protected readonly hasSellers = computed(
    () => (this.locations()?.length ?? 0) > 0,
  );
  protected readonly liveCount = computed(
    () =>
      this.locations()?.filter((location) => isLive(location, this.now()))
        .length ?? 0,
  );
  protected readonly totalCount = computed(() => this.locations()?.length ?? 0);

  protected readonly markers = computed<readonly SellerMarker[]>(() => {
    const selectedId = this.selectedSellerId();
    const now = this.now();
    const names = this.sellerNames();
    return (this.locations() ?? []).map((location, index) => {
      const name = names[location.sellerId] ?? 'Vendedor';
      const live = isLive(location, now);
      return {
        sellerId: location.sellerId,
        position: { lat: location.latitude, lng: location.longitude },
        title: `${name} — ${live ? 'en línea' : 'sin señal reciente'}`,
        zIndex: location.sellerId === selectedId ? 1000 : index,
        content: buildPin(
          initialOf(name),
          live,
          location.sellerId === selectedId,
        ),
      };
    });
  });

  protected readonly selected = computed(() => {
    const selectedId = this.selectedSellerId();
    if (!selectedId) {
      return null;
    }
    const location = this.locations()?.find(
      (candidate) => candidate.sellerId === selectedId,
    );
    if (!location) {
      return null;
    }
    return {
      name: this.sellerNames()[location.sellerId] ?? 'Vendedor',
      live: isLive(location, this.now()),
      since: this.relativeAge(location),
    };
  });

  /**
   * Only a change in the plotted COORDINATES refits the map. Positions refresh
   * constantly, and refitting on every tick would fight the user for control
   * of the viewport.
   */
  private readonly boundsKey = computed(() =>
    (this.locations() ?? [])
      .map((location) => `${location.latitude},${location.longitude}`)
      .join('|'),
  );

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
  }

  ngOnInit(): void {
    this.locationsClient.watch(
      (locations) => {
        this.feedError.set(null);
        this.locations.set(locations);
      },
      (message) => {
        this.feedError.set(message);
        // Keep whatever was already on screen: a dropped connection does not
        // mean the sellers vanished.
        this.locations.update((current) => current ?? []);
      },
    );
    this.clock = setInterval(() => this.now.set(Date.now()), CLOCK_TICK_MS);
    void this.loadSellerNames();
  }

  ngOnDestroy(): void {
    if (this.clock) {
      clearInterval(this.clock);
    }
  }

  protected onMapInitialized(map: google.maps.Map): void {
    this.mapInstance.set(map);
  }

  protected select(sellerId: string | null): void {
    this.selectedSellerId.set(sellerId);
  }

  private async loadSellerNames(): Promise<void> {
    try {
      const result = await firstValueFrom(
        this.users.list({ role: 'SELLER', pageSize: SELLER_LOOKUP_SIZE }),
      );
      this.sellerNames.set(
        Object.fromEntries(result.items.map((user) => [user.id, user.fullName])),
      );
    } catch {
      // Markers fall back to "Vendedor"; the map is still the point.
    }
  }

  /** Coarse and honest: minutes until it is hours, hours until it is days. */
  private relativeAge(location: SellerLocation): string {
    const age = ageMs(location, this.now());
    if (age === null) {
      return 'sin fecha de captura';
    }
    const minutes = Math.max(0, Math.floor(age / 60_000));
    if (minutes < 1) {
      return 'hace menos de un minuto';
    }
    if (minutes < 60) {
      return `hace ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`;
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return `hace ${hours} ${hours === 1 ? 'hora' : 'horas'}`;
    }
    const days = Math.floor(hours / 24);
    return `hace ${days} ${days === 1 ? 'día' : 'días'}`;
  }

  private frame(
    map: google.maps.Map,
    markers: readonly SellerMarker[],
  ): void {
    const [first, ...rest] = markers;
    if (!first) {
      return;
    }
    if (rest.length === 0) {
      map.setCenter(first.position);
      map.setZoom(SINGLE_SELLER_ZOOM);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    for (const marker of markers) {
      bounds.extend(marker.position);
    }
    map.fitBounds(bounds, BOUNDS_PADDING);
  }
}
