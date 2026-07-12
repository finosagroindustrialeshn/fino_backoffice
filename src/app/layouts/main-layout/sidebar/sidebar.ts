import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  model,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { DrawerModule } from 'primeng/drawer';

import { AuthSession } from '../../../core/auth/auth-session';
import { getInitials, ROLE_LABELS } from '../../../core/auth/user-profile.model';
import { NAV_ITEMS } from '../nav-items';

@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive, NgTemplateOutlet, DrawerModule],
  templateUrl: './sidebar.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Sidebar {
  private readonly auth = inject(AuthSession);

  /** Controls the off-canvas drawer below `lg`; ignored at `lg+` where the sidebar is static. */
  readonly open = model(false);

  protected readonly profile = this.auth.profile;
  protected readonly roleLabel = computed(() => {
    const role = this.auth.role();
    return role ? ROLE_LABELS[role] : '';
  });
  protected readonly initials = computed(() =>
    getInitials(this.profile()?.fullName),
  );
  protected readonly navItems = computed(() => {
    const role = this.auth.role();
    return NAV_ITEMS.filter(
      (item) => !item.roles || (role !== null && item.roles.includes(role)),
    );
  });
}
