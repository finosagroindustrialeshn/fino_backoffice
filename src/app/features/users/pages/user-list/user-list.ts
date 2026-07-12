import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
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

  protected readonly roleOptions: RoleOption[] = (
    Object.keys(ROLE_LABELS) as Role[]
  ).map((value) => ({ label: ROLE_LABELS[value], value }));

  protected readonly roleFilter = signal<Role | null>(null);
  protected readonly includeInactive = signal(false);
  protected readonly state = signal<UsersState>({ status: 'idle' });

  private readonly pendingIds = signal<ReadonlySet<string>>(new Set());
  private readonly rowErrors = signal<Readonly<Record<string, string>>>({});

  ngOnInit(): void {
    void this.load();
  }

  protected roleLabel(role: Role): string {
    return ROLE_LABELS[role];
  }

  protected roleSeverity(role: Role): 'danger' | 'warn' | 'info' | 'success' {
    return ROLE_SEVERITY[role];
  }

  protected isPending(id: string): boolean {
    return this.pendingIds().has(id);
  }

  protected rowError(id: string): string | undefined {
    return this.rowErrors()[id];
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

  protected async toggleActive(user: UserProfile): Promise<void> {
    this.startPending(user.id);
    this.clearRowError(user.id);
    try {
      const updated = await firstValueFrom(
        user.isActive
          ? this.users.deactivate(user.id)
          : this.users.activate(user.id),
      );
      this.patchRow(updated);
    } catch (error) {
      this.setRowError(
        user.id,
        this.toMessage(error, 'No se pudo actualizar el estado.'),
      );
    } finally {
      this.stopPending(user.id);
    }
  }

  protected async changeRole(user: UserProfile, role: Role): Promise<void> {
    if (role === user.role) {
      return;
    }
    this.startPending(user.id);
    this.clearRowError(user.id);
    try {
      const updated = await firstValueFrom(
        this.users.updateRole(user.id, role),
      );
      this.patchRow(updated);
    } catch (error) {
      this.setRowError(
        user.id,
        this.toMessage(error, 'No se pudo actualizar el rol.'),
      );
    } finally {
      this.stopPending(user.id);
    }
  }

  private patchRow(updated: UserProfile): void {
    this.state.update((current) => {
      if (current.status !== 'success') {
        return current;
      }
      return {
        status: 'success',
        users: current.users.map((user) =>
          user.id === updated.id ? updated : user,
        ),
      };
    });
  }

  private startPending(id: string): void {
    this.pendingIds.update((ids) => new Set(ids).add(id));
  }

  private stopPending(id: string): void {
    this.pendingIds.update((ids) => {
      const next = new Set(ids);
      next.delete(id);
      return next;
    });
  }

  private setRowError(id: string, message: string): void {
    this.rowErrors.update((errors) => ({ ...errors, [id]: message }));
  }

  private clearRowError(id: string): void {
    this.rowErrors.update((errors) => {
      const { [id]: _removed, ...rest } = errors;
      return rest;
    });
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
