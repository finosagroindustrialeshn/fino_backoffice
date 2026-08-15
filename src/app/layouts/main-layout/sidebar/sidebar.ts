import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  model,
  signal,
} from '@angular/core';
import { NgOptimizedImage, NgTemplateOutlet } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { DrawerModule } from 'primeng/drawer';

import { AuthSession } from '../../../core/auth/auth-session';
import { NAV_GROUPS } from '../nav-items';

@Component({
  selector: 'app-sidebar',
  imports: [
    RouterLink,
    RouterLinkActive,
    NgOptimizedImage,
    NgTemplateOutlet,
    DrawerModule,
  ],
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

  /** Each group's items filtered by role; groups left with nothing to show are dropped. */
  protected readonly navGroups = computed(() => {
    const role = this.auth.role();
    return NAV_GROUPS.map((group) => ({
      label: group.label,
      items: group.items.filter(
        (item) => !item.roles || (role !== null && item.roles.includes(role)),
      ),
    })).filter((group) => group.items.length > 0);
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

  /** Groups start open; tracks only the ones the user collapsed. */
  private readonly collapsedGroups = signal<ReadonlySet<string>>(new Set());

  /** Ungrouped (undefined label) items have no toggle and are always shown. */
  protected isGroupOpen(label: string | undefined): boolean {
    return label === undefined || !this.collapsedGroups().has(label);
  }

  protected toggleGroup(label: string): void {
    this.collapsedGroups.update((current) => {
      const next = new Set(current);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  }
}
