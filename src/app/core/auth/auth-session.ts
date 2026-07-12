import { computed, inject, Injectable, signal } from '@angular/core';
import type { Session } from '@supabase/supabase-js';
import { firstValueFrom } from 'rxjs';

import { ApiClient } from '../http/api-client';
import { SupabaseService } from '../supabase/supabase.client';
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
   * Resolves once the persisted session (if any) has been hydrated.
   * authGuard awaits this so a hard refresh doesn't redirect to /login
   * before we actually know whether a session exists.
   */
  private readonly initialSessionLoaded: Promise<void> = this.supabase.auth
    .getSession()
    .then(({ data }) => {
      this._session.set(data.session);
    });

  constructor() {
    void this.initialSessionLoaded.then(() => this.syncProfile());
    // Tracks future changes too (login, logout, silent token refresh).
    this.supabase.auth.onAuthStateChange((_event, session) => {
      this._session.set(session);
      void this.syncProfile();
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

  private async syncProfile(): Promise<void> {
    if (!this.isAuthenticated()) {
      this._profile.set(null);
      return;
    }
    try {
      const profile = await firstValueFrom(
        this.api.get<UserProfile>('/auth/me'),
      );
      this._profile.set(profile);
    } catch (error) {
      console.error('Failed to load user profile', error);
      this._profile.set(null);
    }
  }
}
