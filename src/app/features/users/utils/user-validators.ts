import { type AbstractControl, Validators, type ValidationErrors } from '@angular/forms';

/** Email is optional, so blank or whitespace-only input is not validated. */
export function validEmailIfPresent(
  control: AbstractControl,
): ValidationErrors | null {
  return String(control.value ?? '').trim() ? Validators.email(control) : null;
}
