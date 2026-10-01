import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import type { MenuItem } from 'primeng/api';
import { MenuModule } from 'primeng/menu';

import { AuthSession } from '../../../core/auth/auth-session';
import { isApiError } from '../../../core/http/api-error';
import { getInitials, ROLE_LABELS } from '../../../core/auth/user-profile.model';
import { ChangePasswordDialog } from './change-password-dialog/change-password-dialog';

const CHANGE_PASSWORD_ERROR_MESSAGE = 'No se pudo cambiar la contraseña.';

@Component({
  selector: 'app-topbar',
  imports: [MenuModule, ChangePasswordDialog],
  templateUrl: './topbar.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Topbar {
  private readonly auth = inject(AuthSession);
  private readonly router = inject(Router);
  private readonly changePasswordDialog = viewChild(ChangePasswordDialog);

  /** Emitted when the mobile hamburger is pressed; the layout owns the drawer's open state. */
  readonly menuToggle = output<void>();

  protected readonly profile = this.auth.profile;
  protected readonly roleLabel = computed(() => {
    const role = this.auth.role();
    return role ? ROLE_LABELS[role] : '';
  });
  protected readonly initials = computed(() =>
    getInitials(this.profile()?.fullName),
  );

  protected readonly changePasswordOpen = signal(false);
  protected readonly changingPassword = signal(false);
  protected readonly changePasswordError = signal<string | null>(null);

  protected readonly userMenuItems: MenuItem[] = [
    {
      label: 'Cambiar contraseña',
      icon: 'pi pi-key',
      command: () => this.openChangePassword(),
    },
    {
      label: 'Cerrar sesión',
      icon: 'pi pi-sign-out',
      command: () => void this.logout(),
    },
  ];

  protected async onChangePassword(payload: {
    currentPassword: string;
    newPassword: string;
  }): Promise<void> {
    this.changingPassword.set(true);
    this.changePasswordError.set(null);
    try {
      await this.auth.changePassword(payload);
      this.changePasswordOpen.set(false);
      this.changePasswordDialog()?.reset();
    } catch (error) {
      this.changePasswordError.set(this.toMessage(error));
    } finally {
      this.changingPassword.set(false);
    }
  }

  private openChangePassword(): void {
    this.changePasswordError.set(null);
    this.changePasswordDialog()?.reset();
    this.changePasswordOpen.set(true);
  }

  private toMessage(error: unknown): string {
    if (isApiError(error) && error.status === 401) {
      return 'La contraseña actual no es correcta.';
    }
    if (isApiError(error)) {
      return error.message;
    }
    return CHANGE_PASSWORD_ERROR_MESSAGE;
  }

  private async logout(): Promise<void> {
    await this.auth.logout();
    await this.router.navigate(['/login']);
  }
}
