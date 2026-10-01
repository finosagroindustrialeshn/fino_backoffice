import { ChangeDetectionStrategy, Component, inject, input, model, output } from '@angular/core';
import {
  type AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  type ValidationErrors,
  Validators,
} from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { PasswordModule } from 'primeng/password';

/** Minimum password length the form enforces before hitting the API. */
const MIN_PASSWORD_LENGTH = 8;

/** Group-level: the confirmation must echo the new password exactly. */
function passwordsMatch(group: AbstractControl): ValidationErrors | null {
  const newPassword = group.get('newPassword')?.value;
  const confirmPassword = group.get('confirmPassword')?.value;
  return newPassword === confirmPassword ? null : { passwordsMatch: true };
}

/**
 * Lets the logged-in user change their own password.
 *
 * Presentational — it validates and emits the payload; the parent (Topbar)
 * makes the actual HTTP call and owns the `saving`/`error` state.
 */
@Component({
  selector: 'app-change-password-dialog',
  imports: [ReactiveFormsModule, ButtonModule, DialogModule, PasswordModule],
  templateUrl: './change-password-dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChangePasswordDialog {
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly minPasswordLength = MIN_PASSWORD_LENGTH;

  readonly visible = model(false);
  readonly saving = input(false);
  readonly error = input<string | null>(null);

  readonly submitted = output<{
    currentPassword: string;
    newPassword: string;
  }>();

  protected readonly form = this.fb.group(
    {
      currentPassword: this.fb.control('', [Validators.required]),
      newPassword: this.fb.control('', [
        Validators.required,
        Validators.minLength(MIN_PASSWORD_LENGTH),
      ]),
      confirmPassword: this.fb.control('', [Validators.required]),
    },
    { validators: passwordsMatch },
  );

  protected submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { currentPassword, newPassword } = this.form.getRawValue();
    this.submitted.emit({ currentPassword, newPassword });
  }

  /** Clears the form so a retry after an error starts from a known state. */
  reset(): void {
    this.form.reset({
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    });
  }

  protected cancel(): void {
    this.visible.set(false);
  }
}
