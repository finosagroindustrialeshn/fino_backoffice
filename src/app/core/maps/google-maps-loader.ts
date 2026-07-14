import { Injectable } from '@angular/core';

import { environment } from '../../../environments/environment';

/**
 * Loads the Google Maps JavaScript API on demand, exactly once. The `<script>`
 * is injected with the key from environment (never hardcoded in index.html), so
 * the map only pays its cost when a feature that needs it is opened.
 */
@Injectable({ providedIn: 'root' })
export class GoogleMapsLoader {
  private loader?: Promise<void>;

  get hasKey(): boolean {
    return environment.mapsApiKey.length > 0;
  }

  load(): Promise<void> {
    if (this.loader) {
      return this.loader;
    }

    if (!this.hasKey) {
      return Promise.reject(new Error('Falta la clave de Google Maps.'));
    }

    this.loader = new Promise<void>((resolve, reject) => {
      // Async bootstrap per Google's guidance: `loading=async` + a global
      // callback that fires once the core API is ready. Avoids the
      // "loaded directly without loading=async" performance warning.
      const callbackName = '__finoGoogleMapsReady';
      (window as unknown as Record<string, () => void>)[callbackName] = () =>
        resolve();

      const script = document.createElement('script');
      script.src =
        `https://maps.googleapis.com/maps/api/js?key=${environment.mapsApiKey}` +
        `&loading=async&callback=${callbackName}`;
      script.async = true;
      script.addEventListener('error', () =>
        reject(new Error('No se pudo cargar Google Maps.')),
      );
      document.head.appendChild(script);
    });

    return this.loader;
  }
}
