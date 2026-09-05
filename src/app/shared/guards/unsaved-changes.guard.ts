import type { CanDeactivateFn } from '@angular/router';

/**
 * A screen that holds work the user would lose by navigating away.
 *
 * `hasUnsavedChanges()` answers whether there is anything worth keeping right
 * now — a component that has just submitted, or was never touched, returns
 * false so the guard stays out of the way.
 */
export interface HasUnsavedChanges {
  hasUnsavedChanges(): boolean;
}

const CONFIRM_MESSAGE =
  'Vas a salir y se va a perder lo que llevás cargado. ¿Salir de todos modos?';

/**
 * Asks before leaving a screen with work in progress.
 *
 * This exists because losing a half-built sale to a stray click is not a
 * recoverable mistake: nothing is persisted until the sale is registered, so
 * the only copy of those lines is on screen.
 *
 * `confirm` is deliberate rather than a styled dialog — a guard has to answer
 * synchronously to the router, and a native prompt cannot be dismissed by
 * clicking outside it, which is the exact failure being fixed.
 */
export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = (
  component,
) => {
  if (!component.hasUnsavedChanges()) {
    return true;
  }
  return confirm(CONFIRM_MESSAGE);
};
