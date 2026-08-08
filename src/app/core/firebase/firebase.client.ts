import { Injectable } from '@angular/core';
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { getDatabase, type Database } from 'firebase/database';
import { getStorage, type FirebaseStorage } from 'firebase/storage';

import { environment } from '../../../environments/environment';

/**
 * Owns the single Firebase app instance and the two products we use: Cloud
 * Storage (file uploads) and Realtime Database (live state).
 *
 * We use the plain modular `firebase` SDK instead of `@angular/fire`: the app
 * is zoneless, so AngularFire's zone wrapping buys us nothing, and its stable
 * release still peers on `@angular/core` v20.
 *
 * The SDK talks to Firebase over its own transport (fetch/WebSocket), so it
 * never goes through Angular's HttpClient or our interceptors — errors surface
 * as `FirebaseError` and must be handled at the call site.
 */
@Injectable({ providedIn: 'root' })
export class FirebaseService {
  // Guard against re-initializing during HMR, which throws on a duplicate app.
  readonly app: FirebaseApp = getApps().length > 0 ? getApp() : initializeApp(environment.firebase);

  /** Cloud Storage bucket — file uploads and download URLs. */
  readonly storage: FirebaseStorage = getStorage(this.app);

  /** Realtime Database — live reads and writes. */
  readonly database: Database = getDatabase(this.app);
}
