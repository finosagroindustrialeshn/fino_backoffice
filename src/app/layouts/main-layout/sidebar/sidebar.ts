import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  model,
  signal,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { DrawerModule } from 'primeng/drawer';

import { AuthSession } from '../../../core/auth/auth-session';
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

  /** Icon-only rail at `lg+`; the mobile drawer always renders expanded. */
  protected readonly collapsed = signal(false);

  protected toggleCollapsed(): void {
    this.collapsed.update((value) => !value);
  }

  protected readonly navItems = computed(() => {
    const role = this.auth.role();
    return NAV_ITEMS.filter(
      (item) => !item.roles || (role !== null && item.roles.includes(role)),
    );
  });

  /** Submenus expanded by the user; a section on the active route is open regardless. */
  private readonly expandedSections = signal<ReadonlySet<string>>(new Set());

  protected isSectionOpen(route: string): boolean {
    return this.expandedSections().has(route);
  }

  protected toggleSection(route: string): void {
    this.expandedSections.update((current) => {
      const next = new Set(current);
      if (next.has(route)) {
        next.delete(route);
      } else {
        next.add(route);
      }
      return next;
    });
  }
}
