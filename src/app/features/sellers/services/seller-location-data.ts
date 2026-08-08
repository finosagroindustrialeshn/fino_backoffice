import { inject, Injectable, type OnDestroy } from '@angular/core';
import { onValue, ref, type Unsubscribe } from 'firebase/database';

import { FirebaseService } from '../../../core/firebase/firebase.client';
import {
  parseSellerLocations,
  type SellerLocation,
} from '../models/seller-location.model';

/** Realtime Database path the field app publishes positions to. */
const SELLERS_PATH = 'sellers';

export type SellerLocationsListener = (
  locations: readonly SellerLocation[],
) => void;

export type SellerLocationsErrorListener = (message: string) => void;

/**
 * Live seller positions from Realtime Database.
 *
 * Deliberately NOT `providedIn: 'root'`: an open `onValue` listener keeps
 * receiving (and billing for) every write for as long as it lives, so this is
 * provided by the map page and torn down with it. A root singleton would keep
 * streaming the whole fleet while the user reads an unrelated screen.
 *
 * Firebase invokes its callbacks outside Angular. Consumers write the result
 * into signals, which notify regardless of the zone — this is a zoneless app.
 */
@Injectable()
export class SellerLocationDataClient implements OnDestroy {
  private readonly firebase = inject(FirebaseService);
  private unsubscribe: Unsubscribe | null = null;

  /**
   * Subscribes to every seller's position. Returns immediately; `onNext` fires
   * once with the current snapshot and again on every change.
   */
  watch(
    onNext: SellerLocationsListener,
    onError: SellerLocationsErrorListener,
  ): void {
    this.stop();
    this.unsubscribe = onValue(
      ref(this.firebase.database, SELLERS_PATH),
      (snapshot) => onNext(parseSellerLocations(snapshot.val())),
      // Firebase reports permission failures here, not as a thrown error.
      (error) =>
        onError(
          error.message ||
            'No se pudo conectar con la ubicación de los vendedores.',
        ),
    );
  }

  /** Detaches the listener. Safe to call when nothing is attached. */
  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  ngOnDestroy(): void {
    this.stop();
  }
}
