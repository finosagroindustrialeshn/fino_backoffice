import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { Router } from '@angular/router';
import type { MenuItem } from 'primeng/api';
import { MenuModule } from 'primeng/menu';

import { AuthSession } from '../../../core/auth/auth-session';
import { getInitials, ROLE_LABELS } from '../../../core/auth/user-profile.model';

@Component({
  selector: 'app-topbar',
  imports: [MenuModule],
  templateUrl: './topbar.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Topbar {
  private readonly auth = inject(AuthSession);
  private readonly router = inject(Router);

  readonly title = input.required<string>();
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
