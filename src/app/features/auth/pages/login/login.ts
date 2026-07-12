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
import { CheckboxModule } from 'primeng/checkbox';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';

import { AuthSession } from '../../../../core/auth/auth-session';

@Component({
  selector: 'app-login',
  imports: [
    ReactiveFormsModule,
    InputTextModule,
    PasswordModule,
    CheckboxModule,
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

  protected readonly form = this.fb.group({
    email: this.fb.control('', [Validators.required, Validators.email]),
    password: this.fb.control('', [Validators.required]),
    remember: this.fb.control(false),
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
