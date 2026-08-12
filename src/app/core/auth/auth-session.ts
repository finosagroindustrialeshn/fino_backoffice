import { computed, inject, Injectable, signal } from '@angular/core';
import type { Session } from '@supabase/supabase-js';
import { firstValueFrom } from 'rxjs';

import { ApiClient } from '../http/api-client';
import { SupabaseService } from '../supabase/supabase.client';
import {
  clearCachedProfile,
  readCachedProfile,
  writeCachedProfile,
} from './profile-cache';
import type { UserProfile } from './user-profile.model';

export interface LoginCredentials {
  readonly email: string;
  readonly password: string;
}

/**
 * Cross-cutting auth state, backed by Supabase Auth. Supabase persists and
 * refreshes the session on its own; we mirror it into signals so the rest of
 * the app (interceptor, guard, UI) can read it synchronously and reactively.
 *
 * Also owns the business profile (GET /auth/me) — role, name, status — since
 * that's the other half of "who is logged in" and every consumer of session
 * state (guard, sidebar) needs both together.
 *
 * Lives in `core` because interceptors and guards depend on it; features
 * depend on core, never the other way around.
 */
@Injectable({ providedIn: 'root' })
export class AuthSession {
  private readonly supabase = inject(SupabaseService).client;
  private readonly api = inject(ApiClient);

  private readonly _session = signal<Session | null>(null);
  private readonly _profile = signal<UserProfile | null>(null);

  readonly session = this._session.asReadonly();
  readonly user = computed(() => this._session()?.user ?? null);
  readonly accessToken = computed(() => this._session()?.access_token ?? null);
  readonly isAuthenticated = computed(() => this._session() !== null);
  readonly profile = this._profile.asReadonly();
  readonly role = computed(() => this._profile()?.role ?? null);

  /**
   * The user whose profile is loaded or in flight.
   *
   * This is what keeps GET /auth/me down to one call. Both the initial
   * `getSession()` and `onAuthStateChange` funnel into `applySession()`, and
   * Supabase fires the listener again on INITIAL_SESSION, SIGNED_IN and every
   * silent TOKEN_REFRESHED. Whoever arrives first claims the id; everyone
   * after that sees it already claimed and does nothing. A refreshed token is
   * a new token, not a new person — the profile cannot have changed.
   */
  private profileUserId: string | null = null;

  /**
   * Resolves once the persisted session (if any) has been hydrated.
   * authGuard awaits this so a hard refresh doesn't redirect to /login
   * before we actually know whether a session exists.
   */
  private readonly initialSessionLoaded: Promise<void> = this.supabase.auth
    .getSession()
    .then(({ data }) => {
      this.applySession(data.session);
    });

  constructor() {
    // Tracks future changes too (login, logout, silent token refresh).
    this.supabase.auth.onAuthStateChange((_event, session) => {
      this.applySession(session);
    });
  }

  async ready(): Promise<void> {
    return this.initialSessionLoaded;
  }

  async login({ email, password }: LoginCredentials): Promise<void> {
    const { error } = await this.supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      throw error;
    }
  }

  async logout(): Promise<void> {
    await this.supabase.auth.signOut();
  }

  /**
   * Single entry point for "the session changed", whatever raised it.
   * Idempotent per user: re-entering with the same user is a no-op.
   */
  private applySession(session: Session | null): void {
    this._session.set(session);

    const userId = session?.user.id ?? null;
    if (!userId) {
      this.profileUserId = null;
      this._profile.set(null);
      clearCachedProfile();
      return;
    }

    if (userId === this.profileUserId) {
      return;
    }
    this.profileUserId = userId;

    // Paint from cache first so a hard refresh renders the sidebar with a
    // name and a role immediately, then confirm it against the API. A role
    // revoked while the tab was closed is corrected within one round trip,
    // and the API rejects the stale role in the meantime regardless.
    this._profile.set(readCachedProfile(userId));
    void this.syncProfile(userId);
  }

  private async syncProfile(userId: string): Promise<void> {
    try {
      const profile = await firstValueFrom(
        this.api.get<UserProfile>('/auth/me'),
      );
      // Someone else signed in while this was in flight: their profile is
      // already the current one, so this response is stale. Drop it.
      if (this.profileUserId !== userId) {
        return;
      }
      this._profile.set(profile);
      writeCachedProfile(userId, profile);
    } catch (error) {
      if (this.profileUserId !== userId) {
        return;
      }
      console.error('Failed to load user profile', error);
      // A failed revalidation does not invalidate what we already showed:
      // dropping a cached profile over a flaky network would blank the
      // sidebar mid-session. An actually invalid session fails at the
      // interceptor with a 401, which logs the user out anyway.
    }
  }
}
