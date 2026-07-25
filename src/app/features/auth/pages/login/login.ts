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
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';

import { AuthSession } from '../../../../core/auth/auth-session';

/**
 * Hand-tuned rather than random: spread across the width and staggered with
 * negative animation-delays so leaves are already mid-fall on first paint
 * instead of every one starting stacked at the top.
 */
const BACKGROUND_LEAVES: readonly string[] = [
  'left:3%; width:1.1rem; --leaf-opacity:.16; animation-duration:24s; animation-delay:-3s;',
  'left:11%; width:1.6rem; --leaf-opacity:.12; animation-duration:31s; animation-delay:-18s;',
  'left:19%; width:0.9rem; --leaf-opacity:.2; animation-duration:19s; animation-delay:-9s;',
  'left:29%; width:1.3rem; --leaf-opacity:.14; animation-duration:27s; animation-delay:-22s;',
  'left:41%; width:1.8rem; --leaf-opacity:.1; animation-duration:34s; animation-delay:-6s;',
  'left:53%; width:1rem; --leaf-opacity:.18; animation-duration:21s; animation-delay:-15s;',
  'left:64%; width:1.4rem; --leaf-opacity:.13; animation-duration:29s; animation-delay:-4s;',
  'left:74%; width:0.95rem; --leaf-opacity:.2; animation-duration:23s; animation-delay:-19s;',
  'left:84%; width:1.6rem; --leaf-opacity:.11; animation-duration:32s; animation-delay:-11s;',
  'left:93%; width:1.2rem; --leaf-opacity:.16; animation-duration:25s; animation-delay:-1s;',
];

@Component({
  selector: 'app-login',
  imports: [
    ReactiveFormsModule,
    InputTextModule,
    PasswordModule,
    ButtonModule,
  ],
  templateUrl: './login.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Login {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly auth = inject(AuthSession);
  private readonly router = inject(Router);

  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  protected readonly backgroundLeaves = BACKGROUND_LEAVES;

  protected readonly form = this.fb.group({
    email: this.fb.control('', [Validators.required, Validators.email]),
    password: this.fb.control('', [Validators.required]),
  });

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.errorMessage.set(null);

    const { email, password } = this.form.getRawValue();
    try {
      await this.auth.login({ email, password });
      await this.router.navigate(['/dashboard']);
    } catch (error) {
      this.submitting.set(false);
      this.errorMessage.set(this.toMessage(error));
    }
  }

  private toMessage(error: unknown): string {
    const raw =
      error instanceof Error ? error.message : 'No se pudo iniciar sesión.';
    if (/invalid login credentials/i.test(raw)) {
      return 'Correo o contraseña incorrectos.';
    }
    if (/email not confirmed/i.test(raw)) {
      return 'Tu correo aún no fue confirmado.';
    }
    return raw;
  }
}
