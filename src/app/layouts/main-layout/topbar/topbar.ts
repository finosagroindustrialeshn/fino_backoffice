import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  output,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import type { MenuItem } from 'primeng/api';
import { MenuModule } from 'primeng/menu';
import { PopoverModule } from 'primeng/popover';

import { AuthSession } from '../../../core/auth/auth-session';
import { getInitials, ROLE_LABELS } from '../../../core/auth/user-profile.model';

@Component({
  selector: 'app-topbar',
  imports: [MenuModule, PopoverModule],
  templateUrl: './topbar.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Topbar {
  private readonly auth = inject(AuthSession);
  private readonly router = inject(Router);

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

  /** No notifications source wired yet; starts at zero. */
  protected readonly notificationCount = signal(0);
  protected readonly notificationLabel = computed(() => {
    const count = this.notificationCount();
    return count === 0 ? 'Sin novedad' : `${count} notificaciones`;
  });

  protected readonly userMenuItems: MenuItem[] = [
    {
      label: 'Cerrar sesión',
      icon: 'pi pi-sign-out',
      command: () => void this.logout(),
    },
  ];

  private async logout(): Promise<void> {
    await this.auth.logout();
    await this.router.navigate(['/login']);
  }
}
