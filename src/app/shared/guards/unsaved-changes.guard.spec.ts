import { TestBed } from '@angular/core/testing';
import type {
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
} from '@angular/router';
import { vi } from 'vitest';

import {
  unsavedChangesGuard,
  type HasUnsavedChanges,
} from './unsaved-changes.guard';

/** The guard reads none of these; they only satisfy the CanDeactivateFn shape. */
const SNAPSHOT = {} as ActivatedRouteSnapshot;
const STATE = {} as RouterStateSnapshot;

function run(component: HasUnsavedChanges): boolean | Promise<boolean> {
  return TestBed.runInInjectionContext(
    () =>
      unsavedChangesGuard(component, SNAPSHOT, STATE, STATE) as
        | boolean
        | Promise<boolean>,
  );
}

describe('unsavedChangesGuard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lets a clean page go without asking', () => {
    const confirmSpy = vi.spyOn(window, 'confirm');

    expect(run({ hasUnsavedChanges: () => false })).toBe(true);
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it('leaves when the user confirms', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    expect(run({ hasUnsavedChanges: () => true })).toBe(true);
  });

  // The whole point: a stray navigation must not throw the work away.
  it('stays put when the user cancels', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    expect(run({ hasUnsavedChanges: () => true })).toBe(false);
  });
});
