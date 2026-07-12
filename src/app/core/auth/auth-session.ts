import { computed, inject, Injectable, signal } from '@angular/core';
import type { Session } from '@supabase/supabase-js';

import { SupabaseService } from '../supabase/supabase.client';

export interface LoginCredentials {
  readonly email: string;
  readonly password: string;
}

/**
 * Cross-cutting auth state, backed by Supabase Auth. Supabase persists and
 * refreshes the session on its own; we mirror it into signals so the rest of
 * the app (interceptor, guard, UI) can read it synchronously and reactively.
 *
 * Lives in `core` because interceptors and guards depend on it; features
 * depend on core, never the other way around.
 */
@Injectable({ providedIn: 'root' })
export class AuthSession {
  private readonly supabase = inject(SupabaseService).client;

  private readonly _session = signal<Session | null>(null);

  readonly session = this._session.asReadonly();
  readonly user = computed(() => this._session()?.user ?? null);
  readonly accessToken = computed(() => this._session()?.access_token ?? null);
  readonly isAuthenticated = computed(() => this._session() !== null);

  constructor() {
    // Hydrate from any persisted session, then track future changes
    // (login, logout, silent token refresh).
    void this.supabase.auth
      .getSession()
      .then(({ data }) => this._session.set(data.session));
    this.supabase.auth.onAuthStateChange((_event, session) => {
      this._session.set(session);
    });
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
}
