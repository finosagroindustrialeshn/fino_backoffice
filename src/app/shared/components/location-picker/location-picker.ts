import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { GoogleMap, MapAdvancedMarker } from '@angular/google-maps';

import { environment } from '../../../../environments/environment';
import { GoogleMapsLoader } from '../../../core/maps/google-maps-loader';

export interface Coordinates {
  readonly lat: number;
  readonly lng: number;
}

type PickerStatus = 'loading' | 'ready' | 'error' | 'no-key';

/** Default map center (San Pedro Sula, Honduras) shown when no point is set. */
const DEFAULT_CENTER: google.maps.LatLngLiteral = { lat: 15.5041, lng: -88.025 };

/**
 * Map location picker: tap the map or drag the pin to choose a point, emitting
 * its coordinates. Lazily loads the Google Maps script; degrades gracefully to
 * a message (so the parent's manual coordinate inputs remain the fallback) when
 * the key is missing or the script fails to load.
 */
@Component({
  selector: 'app-location-picker',
  imports: [GoogleMap, MapAdvancedMarker],
  templateUrl: './location-picker.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LocationPicker {
  private readonly loader = inject(GoogleMapsLoader);

  readonly latitude = input(0);
  readonly longitude = input(0);
  readonly coordinatesChange = output<Coordinates>();

  protected readonly status = signal<PickerStatus>('loading');
  protected readonly zoom = signal(14);

  protected readonly hasPoint = computed(
    () => this.latitude() !== 0 || this.longitude() !== 0,
  );
  protected readonly center = computed<google.maps.LatLngLiteral>(() =>
    this.hasPoint()
      ? { lat: this.latitude(), lng: this.longitude() }
      : DEFAULT_CENTER,
  );
  protected readonly markerPosition = computed<google.maps.LatLngLiteral | null>(
    () =>
      this.hasPoint()
        ? { lat: this.latitude(), lng: this.longitude() }
        : null,
  );

  protected readonly mapOptions: google.maps.MapOptions = {
    // Advanced Markers require a Map ID (CF9). DEMO_MAP_ID is fine for
    // prototyping; set MAPS_MAP_ID in .env for a production Cloud-styled map.
    mapId: environment.mapsMapId || 'DEMO_MAP_ID',
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    clickableIcons: false,
  };

  constructor() {
    if (!this.loader.hasKey) {
      this.status.set('no-key');
      return;
    }
    this.loader.load().then(
      () => this.status.set('ready'),
      () => this.status.set('error'),
    );
  }

  protected onMapClick(event: google.maps.MapMouseEvent): void {
    this.emit(event.latLng);
  }

  protected onMarkerDragEnd(event: google.maps.MapMouseEvent): void {
    this.emit(event.latLng);
  }

  private emit(latLng: google.maps.LatLng | null): void {
    if (!latLng) {
      return;
    }
    this.coordinatesChange.emit({ lat: latLng.lat(), lng: latLng.lng() });
  }
}
