import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import {
  type AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  type ValidationErrors,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';

import {
  getInitials,
  ROLE_LABELS,
  type Role,
  type UserProfile,
} from '../../../../core/auth/user-profile.model';
import {
  USERNAME_PATTERN,
  type UpdateUserPayload,
} from '../../models/user-payload.model';
import { UserDataClient } from '../../services/user-data';
import { validEmailIfPresent } from '../../utils/user-validators';

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
    InputTextModule,
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

  /**
   * The API cannot remove an email, so a user who already has one cannot
   * leave the field blank. Users without an email may leave it empty.
   */
  private readonly keepExistingEmail = (
    control: AbstractControl,
  ): ValidationErrors | null => {
    const hadEmail = Boolean(this.user()?.email);
    return hadEmail && !String(control.value ?? '').trim()
      ? { required: true }
      : null;
  };

  protected readonly form = this.fb.group({
    fullName: this.fb.control('', [Validators.required]),
    email: this.fb.control('', [validEmailIfPresent, this.keepExistingEmail]),
    phone: this.fb.control(''),
    username: this.fb.control('', [Validators.pattern(USERNAME_PATTERN)]),
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
      this.form.reset({
        fullName: user.fullName,
        email: user.email ?? '',
        phone: user.phone ?? '',
        username: user.username ?? '',
        role: user.role,
        isActive: user.isActive,
      });
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
      // Profile, role and active state live on separate endpoints; only call
      // the ones that actually changed.
      const profile = this.profileChanges(user, raw);
      if (Object.keys(profile).length > 0) {
        await firstValueFrom(this.users.updateProfile(user.id, profile));
      }
      // The email is the Supabase Auth credential, so it has its own endpoint.
      const email = raw.email.trim();
      if (email && email !== (user.email ?? '')) {
        await firstValueFrom(this.users.updateEmail(user.id, { email }));
      }
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

  private profileChanges(
    user: UserProfile,
    raw: { fullName: string; phone: string; username: string },
  ): UpdateUserPayload {
    const fullName = raw.fullName.trim();
    const phone = raw.phone.trim();
    const username = raw.username.trim().toLowerCase();
    return {
      ...(fullName !== user.fullName ? { fullName } : {}),
      ...(phone && phone !== (user.phone ?? '') ? { phone } : {}),
      ...(username && username !== (user.username ?? '') ? { username } : {}),
    };
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
