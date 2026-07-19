import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { SelectModule } from 'primeng/select';
import { Table, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

import {
  getInitials,
  ROLE_LABELS,
  type Role,
  type UserProfile,
} from '../../../../core/auth/user-profile.model';
import { LazyList } from '../../../../core/http/lazy-list';
import { UserDataClient } from '../../services/user-data';

interface RoleOption {
  readonly label: string;
  readonly value: Role | null;
}

const DEFAULT_ROWS = 10;

const ROLE_SEVERITY: Record<Role, 'danger' | 'warn' | 'info' | 'success'> = {
  ADMIN: 'danger',
  SUPERVISOR: 'warn',
  ACCOUNTANT: 'info',
  SELLER: 'success',
};

@Component({
  selector: 'app-user-list',
  imports: [
    DatePipe,
    FormsModule,
    RouterLink,
    ButtonModule,
    CheckboxModule,
    SelectModule,
    TableModule,
    TagModule,
  ],
  templateUrl: './user-list.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserList {
  private readonly users = inject(UserDataClient);
  private readonly table = viewChild.required<Table>('dt');

  protected readonly getInitials = getInitials;
  protected readonly defaultRows = DEFAULT_ROWS;
  protected readonly rowsPerPageOptions = [5, 10, 20, 50];

  protected readonly roleFilterOptions: RoleOption[] = [
    { label: 'Todos los roles', value: null },
    ...(Object.keys(ROLE_LABELS) as Role[]).map((value) => ({
      label: ROLE_LABELS[value],
      value,
    })),
  ];

  protected readonly roleFilter = signal<Role | null>(null);
  protected readonly includeInactive = signal(false);

  protected readonly list = new LazyList<UserProfile>(
    (page, pageSize) =>
      this.users.list({
        page,
        pageSize,
        role: this.roleFilter() ?? undefined,
        includeInactive: this.includeInactive(),
      }),
    'No se pudieron cargar los usuarios.',
  );

  protected onRoleFilterChange(role: Role | null): void {
    this.roleFilter.set(role);
    // reset() jumps to page 1 and re-fires onLazyLoad with the new filter.
    this.table().reset();
  }

  protected onIncludeInactiveChange(includeInactive: boolean): void {
    this.includeInactive.set(includeInactive);
    this.table().reset();
  }

  protected roleLabel(role: Role): string {
    return ROLE_LABELS[role];
  }

  protected roleSeverity(role: Role): 'danger' | 'warn' | 'info' | 'success' {
    return ROLE_SEVERITY[role];
  }
}
