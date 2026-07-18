import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import {
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { SelectModule } from 'primeng/select';

import {
  ROLE_LABELS,
  type Role,
} from '../../../../core/auth/user-profile.model';
import type { CreateUserPayload } from '../../models/user-payload.model';
import { UserDataClient } from '../../services/user-data';

interface RoleOption {
  readonly label: string;
  readonly value: Role;
}

/** Minimum password length the form enforces before hitting the API. */
const MIN_PASSWORD_LENGTH = 8;

@Component({
  selector: 'app-user-form',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    ButtonModule,
    InputTextModule,
    PasswordModule,
    SelectModule,
  ],
  templateUrl: './user-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserForm {
  private readonly router = inject(Router);
  private readonly users = inject(UserDataClient);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly minPasswordLength = MIN_PASSWORD_LENGTH;
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);

  protected readonly roleOptions: RoleOption[] = (
    Object.keys(ROLE_LABELS) as Role[]
  ).map((value) => ({ label: ROLE_LABELS[value], value }));

  protected readonly form = this.fb.group({
    fullName: this.fb.control('', [Validators.required]),
    email: this.fb.control('', [Validators.required, Validators.email]),
    phone: this.fb.control('', [Validators.required]),
    password: this.fb.control('', [
      Validators.required,
      Validators.minLength(MIN_PASSWORD_LENGTH),
    ]),
    role: this.fb.control<Role | null>(null, [Validators.required]),
  });

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    if (!raw.role) {
      return;
    }

    this.saving.set(true);
    this.formError.set(null);
    try {
      const payload: CreateUserPayload = {
        fullName: raw.fullName.trim(),
        email: raw.email.trim(),
        phone: raw.phone.trim(),
        password: raw.password,
        role: raw.role,
      };
      await firstValueFrom(this.users.create(payload));
      await this.router.navigate(['/usuarios']);
    } catch (error) {
      this.formError.set(this.toMessage(error, 'No se pudo crear el usuario.'));
    } finally {
      this.saving.set(false);
    }
  }

  private toMessage(error: unknown, fallback: string): string {
    if (
      error &&
      typeof error === 'object' &&
      'message' in error &&
      typeof (error as { message: unknown }).message === 'string'
    ) {
      return (error as { message: string }).message;
    }
    return fallback;
  }
}
