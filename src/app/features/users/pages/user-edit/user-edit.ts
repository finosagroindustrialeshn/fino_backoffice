import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import {
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';

import {
  getInitials,
  ROLE_LABELS,
  type Role,
  type UserProfile,
} from '../../../../core/auth/user-profile.model';
import { UserDataClient } from '../../services/user-data';

interface RoleOption {
  readonly label: string;
  readonly value: Role;
}

@Component({
  selector: 'app-user-edit',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    ButtonModule,
    CheckboxModule,
    SelectModule,
    SkeletonModule,
  ],
  templateUrl: './user-edit.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserEdit implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly users = inject(UserDataClient);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly getInitials = getInitials;

  protected readonly loading = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly user = signal<UserProfile | null>(null);

  protected readonly roleOptions: RoleOption[] = (
    Object.keys(ROLE_LABELS) as Role[]
  ).map((value) => ({ label: ROLE_LABELS[value], value }));

  protected readonly form = this.fb.group({
    role: this.fb.control<Role | null>(null, [Validators.required]),
    isActive: this.fb.control(true),
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.loadError.set('Usuario no encontrado.');
      return;
    }
    void this.load(id);
  }

  private async load(id: string): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const user = await firstValueFrom(this.users.get(id));
      this.user.set(user);
      this.form.reset({ role: user.role, isActive: user.isActive });
    } catch (error) {
      this.loadError.set(this.toMessage(error, 'No se pudo cargar el usuario.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected async submit(): Promise<void> {
    const user = this.user();
    if (!user || this.form.invalid) {
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
      // Role and active state are two independent PATCH endpoints; only call
      // the ones that actually changed.
      if (raw.role !== user.role) {
        await firstValueFrom(this.users.updateRole(user.id, raw.role));
      }
      if (raw.isActive !== user.isActive) {
        await firstValueFrom(
          raw.isActive
            ? this.users.activate(user.id)
            : this.users.deactivate(user.id),
        );
      }
      await this.router.navigate(['/usuarios']);
    } catch (error) {
      this.formError.set(
        this.toMessage(error, 'No se pudo actualizar el usuario.'),
      );
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
