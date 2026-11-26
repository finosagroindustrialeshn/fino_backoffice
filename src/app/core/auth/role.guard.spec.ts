import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { describe, expect, it } from 'vitest';

import { AuthSession } from './auth-session';
import { roleGuard } from './role.guard';
import type { Role } from './user-profile.model';

interface FakeAuthOptions {
  readonly role: Role | null;
  readonly ready?: Promise<void>;
  readonly profileReady?: Promise<void>;
}

function setup({ role, ready = Promise.resolve(), profileReady = Promise.resolve() }: FakeAuthOptions) {
  const roleSignal = signal<Role | null>(role);
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: AuthSession,
        useValue: { ready: () => ready, profileReady: () => profileReady, role: roleSignal.asReadonly() },
      },
    ],
  });
  return { roleSignal, router: TestBed.inject(Router) };
}

function run(roles: readonly Role[] | undefined) {
  const route = { data: roles ? { roles } : {} } as unknown as ActivatedRouteSnapshot;
  const state = { url: '/x' } as RouterStateSnapshot;
  return TestBed.runInInjectionContext(() => roleGuard(route, state));
}

describe('roleGuard', () => {
  it('allows a role listed in the route data', async () => {
    setup({ role: 'ADMIN' });
    expect(await run(['ADMIN', 'SUPERVISOR'])).toBe(true);
  });

  it('redirects a role that is not listed to /dashboard', async () => {
    const { router } = setup({ role: 'SELLER' });
    const result = await run(['ADMIN', 'SUPERVISOR']);
    expect(result).toBeInstanceOf(UrlTree);
    expect(router.serializeUrl(result as UrlTree)).toBe('/dashboard');
  });

  it('redirects when there is no profile yet', async () => {
    const { router } = setup({ role: null });
    const result = await run(['ADMIN']);
    expect(router.serializeUrl(result as UrlTree)).toBe('/dashboard');
  });

  it('denies when the route declares no roles (fail closed)', async () => {
    setup({ role: 'ADMIN' });
    expect(await run(undefined)).toBeInstanceOf(UrlTree);
  });

  it('waits for the profile to load after the session is ready', async () => {
    let release!: () => void;
    const profileReady = new Promise<void>((resolve) => (release = resolve));
    const { roleSignal } = setup({ role: null, profileReady });

    let settled = false;
    const pending = Promise.resolve(run(['ADMIN'])).then((value) => {
      settled = true;
      return value;
    });
    await new Promise((resolve) => setTimeout(resolve));
    expect(settled).toBe(false);

    roleSignal.set('ADMIN');
    release();
    expect(await pending).toBe(true);
  });

  it('redirects when the profile settles without a role (load failed)', async () => {
    setup({ role: null });
    expect(await run(['ADMIN'])).toBeInstanceOf(UrlTree);
  });

  it('waits for auth to be ready before deciding', async () => {
    let release!: () => void;
    const ready = new Promise<void>((resolve) => (release = resolve));
    const { roleSignal } = setup({ role: null, ready });

    let settled = false;
    const pending = Promise.resolve(run(['ADMIN'])).then((value) => {
      settled = true;
      return value;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    roleSignal.set('ADMIN');
    release();
    expect(await pending).toBe(true);
  });
});
