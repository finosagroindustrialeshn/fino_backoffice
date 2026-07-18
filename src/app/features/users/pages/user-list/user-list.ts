import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

import {
  getInitials,
  ROLE_LABELS,
  type Role,
  type UserProfile,
} from '../../../../core/auth/user-profile.model';
import { UserDataClient } from '../../services/user-data';

type UsersState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly users: UserProfile[] }
  | { readonly status: 'error'; readonly message: string };

interface RoleOption {
  readonly label: string;
  readonly value: Role | null;
}

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
    SkeletonModule,
    TableModule,
    TagModule,
  ],
  templateUrl: './user-list.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserList implements OnInit {
  private readonly users = inject(UserDataClient);

  protected readonly getInitials = getInitials;
  protected readonly skeletonRows = [0, 1, 2, 3, 4];

  protected readonly roleFilterOptions: RoleOption[] = [
    { label: 'Todos los roles', value: null },
    ...(Object.keys(ROLE_LABELS) as Role[]).map((value) => ({
      label: ROLE_LABELS[value],
      value,
    })),
  ];

  protected readonly roleFilter = signal<Role | null>(null);
  protected readonly includeInactive = signal(false);
  protected readonly state = signal<UsersState>({ status: 'idle' });

  ngOnInit(): void {
    void this.load();
  }

  protected roleLabel(role: Role): string {
    return ROLE_LABELS[role];
  }

  protected roleSeverity(role: Role): 'danger' | 'warn' | 'info' | 'success' {
    return ROLE_SEVERITY[role];
  }

  protected onRoleFilterChange(role: Role | null): void {
    this.roleFilter.set(role);
    void this.load();
  }

  protected onIncludeInactiveChange(includeInactive: boolean): void {
    this.includeInactive.set(includeInactive);
    void this.load();
  }

  protected async load(): Promise<void> {
    this.state.set({ status: 'loading' });
    try {
      const users = await firstValueFrom(
        this.users.list({
          role: this.roleFilter() ?? undefined,
          includeInactive: this.includeInactive(),
        }),
      );
      this.state.set({ status: 'success', users });
    } catch (error) {
      this.state.set({
        status: 'error',
        message: this.toMessage(error, 'No se pudieron cargar los usuarios.'),
      });
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
