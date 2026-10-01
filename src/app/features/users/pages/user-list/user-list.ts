import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { Table, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

import { AuthSession } from '../../../../core/auth/auth-session';
import {
  getInitials,
  ROLE_LABELS,
  type Role,
  type UserProfile,
} from '../../../../core/auth/user-profile.model';
import { isApiError } from '../../../../core/http/api-error';
import { LazyList } from '../../../../core/http/lazy-list';
import { UserDataClient } from '../../services/user-data';
import { ResetPasswordDialog } from './reset-password-dialog/reset-password-dialog';

const RESET_PASSWORD_ERROR_MESSAGE = 'No se pudo restablecer la contraseña.';

interface RoleOption {
  readonly label: string;
  readonly value: Role | null;
}

const DEFAULT_ROWS = 10;

type RoleSeverity = 'danger' | 'warn' | 'info' | 'success' | 'secondary';

const ROLE_SEVERITY: Record<Role, RoleSeverity> = {
  ADMIN: 'danger',
  SUPERVISOR: 'warn',
  ACCOUNTANT: 'info',
  SELLER: 'success',
  // Distinct from SELLER on purpose: both work the field, but only one of
  // them carries stock and collects money.
  PRESELLER: 'secondary',
};

@Component({
  selector: 'app-user-list',
  imports: [
    DatePipe,
    FormsModule,
    RouterLink,
    ButtonModule,
    SelectModule,
    TableModule,
    TagModule,
    ResetPasswordDialog,
  ],
  templateUrl: './user-list.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserList {
  private readonly users = inject(UserDataClient);
  private readonly auth = inject(AuthSession);
  private readonly table = viewChild.required<Table>('dt');
  private readonly resetPasswordDialog = viewChild(ResetPasswordDialog);

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

  protected readonly canResetPasswords = computed(() => {
    const role = this.auth.role();
    return role === 'ADMIN' || role === 'SUPERVISOR';
  });

  protected readonly resetDialogOpen = signal(false);
  protected readonly resetTarget = signal<UserProfile | null>(null);
  protected readonly resettingPassword = signal(false);
  protected readonly resetError = signal<string | null>(null);

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

  protected roleSeverity(role: Role): RoleSeverity {
    return ROLE_SEVERITY[role];
  }

  protected openResetPassword(user: UserProfile): void {
    this.resetTarget.set(user);
    this.resetError.set(null);
    this.resetPasswordDialog()?.reset();
    this.resetDialogOpen.set(true);
  }

  protected async onResetPassword(newPassword: string): Promise<void> {
    const target = this.resetTarget();
    if (!target) {
      return;
    }

    this.resettingPassword.set(true);
    this.resetError.set(null);
    try {
      await firstValueFrom(this.users.resetPassword(target.id, newPassword));
      this.resetDialogOpen.set(false);
      this.resetPasswordDialog()?.reset();
    } catch (error) {
      this.resetError.set(
        isApiError(error) ? error.message : RESET_PASSWORD_ERROR_MESSAGE,
      );
    } finally {
      this.resettingPassword.set(false);
    }
  }
}
