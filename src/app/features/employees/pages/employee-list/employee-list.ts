import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom, type Observable } from 'rxjs';
import { ConfirmationService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { Table, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

import { AuthSession } from '../../../../core/auth/auth-session';
import { LazyList } from '../../../../core/http/lazy-list';
import type { Paginated } from '../../../../core/http/pagination.model';
import {
  CONTRACT_TYPE_LABELS,
  EMPLOYMENT_STATUS_LABELS,
  EMPLOYMENT_STATUSES,
  type Employee,
  type EmploymentStatus,
} from '../../models/employee.model';
import type { JobPosition } from '../../models/job-position.model';
import { EmployeeDataClient } from '../../services/employee-data';
import { JobPositionDataClient } from '../../services/job-position-data';

/** Positions are bounded reference data — fetch enough for the lookup. */
const LOOKUP_SIZE = 100;
/** Delay before a keystroke turns into a search request. */
const SEARCH_DEBOUNCE_MS = 350;

interface SelectOption<T> {
  readonly label: string;
  readonly value: T;
}

type StatusSeverity = 'success' | 'info' | 'warn' | 'danger';

const STATUS_SEVERITIES: Record<EmploymentStatus, StatusSeverity> = {
  ACTIVE: 'success',
  ON_LEAVE: 'info',
  SUSPENDED: 'warn',
  TERMINATED: 'danger',
};

@Component({
  selector: 'app-employee-list',
  imports: [
    CurrencyPipe,
    DatePipe,
    FormsModule,
    RouterLink,
    ButtonModule,
    ConfirmDialogModule,
    InputTextModule,
    SelectModule,
    TableModule,
    TagModule,
  ],
  providers: [ConfirmationService],
  templateUrl: './employee-list.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmployeeList implements OnInit {
  private readonly employees = inject(EmployeeDataClient);
  private readonly positions = inject(JobPositionDataClient);
  private readonly auth = inject(AuthSession);
  private readonly confirmation = inject(ConfirmationService);
  private readonly table = viewChild.required<Table>('dt');

  /** Employee writes are ADMIN-only per the API contract. */
  protected readonly canManage = computed(() => this.auth.role() === 'ADMIN');

  // Filters — read inside the fetcher closure so reload() uses the latest values.
  /** Bound to the search box for instant feedback; debounced into `appliedSearch`. */
  protected readonly searchTerm = signal('');
  private readonly appliedSearch = signal('');
  protected readonly statusFilter = signal<EmploymentStatus | null>(null);
  protected readonly positionFilter = signal<string | null>(null);
  private searchDebounce: ReturnType<typeof setTimeout> | null = null;

  private readonly positionList = signal<readonly JobPosition[]>([]);

  private readonly positionNames = computed(
    () => new Map(this.positionList().map((p) => [p.id, p.name])),
  );

  protected readonly statusFilterOptions: SelectOption<EmploymentStatus | null>[] =
    [
      { label: 'Todos los estados', value: null },
      ...EMPLOYMENT_STATUSES.map((status) => ({
        label: EMPLOYMENT_STATUS_LABELS[status],
        value: status,
      })),
    ];

  protected readonly positionFilterOptions = computed<
    SelectOption<string | null>[]
  >(() => [
    { label: 'Todos los puestos', value: null },
    ...this.positionList().map((p) => ({ label: p.name, value: p.id })),
  ]);

  private readonly pendingIds = signal<ReadonlySet<string>>(new Set());
  private readonly rowErrors = signal<Readonly<Record<string, string>>>({});

  protected readonly list = new LazyList<Employee>(
    (page, pageSize): Observable<Paginated<Employee>> =>
      this.employees.list({
        page,
        pageSize,
        search: this.appliedSearch() || undefined,
        status: this.statusFilter() ?? undefined,
        positionId: this.positionFilter() ?? undefined,
      }),
    'No se pudieron cargar los empleados.',
  );

  ngOnInit(): void {
    void this.loadPositions();
  }

  protected onSearchInput(value: string): void {
    this.searchTerm.set(value);
    if (this.searchDebounce) {
      clearTimeout(this.searchDebounce);
    }
    this.searchDebounce = setTimeout(() => {
      this.appliedSearch.set(value.trim());
      this.table().reset();
    }, SEARCH_DEBOUNCE_MS);
  }

  protected onStatusFilterChange(status: EmploymentStatus | null): void {
    this.statusFilter.set(status);
    this.table().reset();
  }

  protected onPositionFilterChange(positionId: string | null): void {
    this.positionFilter.set(positionId);
    this.table().reset();
  }

  protected isPending(id: string): boolean {
    return this.pendingIds().has(id);
  }

  protected rowError(id: string): string | undefined {
    return this.rowErrors()[id];
  }

  protected positionName(id: string): string {
    return this.positionNames().get(id) ?? '—';
  }

  protected statusLabel(status: EmploymentStatus): string {
    return EMPLOYMENT_STATUS_LABELS[status];
  }

  protected statusSeverity(status: EmploymentStatus): StatusSeverity {
    return STATUS_SEVERITIES[status];
  }

  protected contractLabel(employee: Employee): string {
    return CONTRACT_TYPE_LABELS[employee.contractType];
  }

  private async loadPositions(): Promise<void> {
    try {
      const positions = await firstValueFrom(
        this.positions.list({
          pageSize: LOOKUP_SIZE,
          includeInactive: true,
        }),
      );
      this.positionList.set(positions.items);
    } catch {
      // The filter stays empty and position names fall back to '—'.
    }
  }

  protected confirmDelete(employee: Employee): void {
    this.confirmation.confirm({
      header: 'Eliminar empleado',
      message: `¿Eliminar a "${employee.fullName}"? Esta acción no se puede deshacer.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { severity: 'secondary', outlined: true },
      accept: () => void this.remove(employee),
    });
  }

  private async remove(employee: Employee): Promise<void> {
    this.startPending(employee.id);
    this.clearRowError(employee.id);
    try {
      await firstValueFrom(this.employees.remove(employee.id));
      this.list.reload();
    } catch (error) {
      this.setRowError(
        employee.id,
        this.toMessage(error, 'No se pudo eliminar el empleado.'),
      );
    } finally {
      this.stopPending(employee.id);
    }
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
