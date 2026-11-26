import { TestBed } from '@angular/core/testing';
import { Subject, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiClient } from '../http/api-client';
import { SupabaseService } from '../supabase/supabase.client';
import { AuthSession } from './auth-session';
import { writeCachedProfile } from './profile-cache';
import type { UserProfile } from './user-profile.model';

const profile: UserProfile = {
  id: 'u1',
  email: 'a@b.c',
  username: null,
  fullName: 'Ana Admin',
  phone: null,
  role: 'ADMIN',
  isActive: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

function setup(options: { session: boolean; me: unknown }) {
  const session = options.session ? { user: { id: 'u1' } } : null;
  TestBed.configureTestingModule({
    providers: [
      {
        provide: SupabaseService,
        useValue: {
          client: {
            auth: {
              getSession: () => Promise.resolve({ data: { session } }),
              onAuthStateChange: vi.fn(),
            },
          },
        },
      },
      { provide: ApiClient, useValue: { get: () => options.me } },
    ],
  });
  return TestBed.inject(AuthSession);
}

describe('AuthSession.profileReady', () => {
  beforeEach(() => sessionStorage.clear());

  it('waits for /auth/me on a cache miss, even after ready() resolved', async () => {
    const me = new Subject<UserProfile>();
    const auth = setup({ session: true, me });
    await auth.ready();
    expect(auth.role()).toBeNull();

    let settled = false;
    const pending = auth.profileReady().then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);

    me.next(profile);
    me.complete();
    await pending;
    expect(auth.role()).toBe('ADMIN');
  });

  it('settles (does not hang) when /auth/me fails with no cache', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const auth = setup({ session: true, me: throwError(() => new Error('boom')) });
    await auth.profileReady();
    expect(auth.role()).toBeNull();
  });

  it('resolves immediately when a cached profile exists', async () => {
    writeCachedProfile('u1', profile);
    const auth = setup({ session: true, me: new Subject<UserProfile>() });
    await auth.profileReady();
    expect(auth.role()).toBe('ADMIN');
  });

  it('resolves immediately with no session', async () => {
    const auth = setup({ session: false, me: new Subject<UserProfile>() });
    await auth.profileReady();
    expect(auth.role()).toBeNull();
  });
});
