import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { Table, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

import { AuthSession } from '../../../../core/auth/auth-session';
import { LazyList } from '../../../../core/http/lazy-list';
import { DateRangePresets } from '../../../../shared/components/date-range-presets/date-range-presets';
import { formatDay } from '../../../../shared/utils/date-range';
import { UserDataClient } from '../../../users/services/user-data';
import {
  SHIFT_STATUS_LABELS,
  SHIFT_STATUS_SEVERITY,
  type Shift,
  type ShiftStatus,
  type ShiftTagSeverity,
} from '../../models/shift.model';
import { ShiftDataClient } from '../../services/shift-data';

interface FilterOption<T> {
  readonly label: string;
  readonly value: T | null;
}

/**
 * Users are a bounded lookup joined to the paginated shifts, which carry ids
 * only. A name missing from the lookup degrades to a dash rather than showing
 * a raw uuid.
 */
const LOOKUP_SIZE = 100;

@Component({
  selector: 'app-shift-list',
  imports: [
    CurrencyPipe,
    DatePipe,
    FormsModule,
    RouterLink,
    ButtonModule,
    DatePickerModule,
    DateRangePresets,
    SelectModule,
    TableModule,
    TagModule,
  ],
  templateUrl: './shift-list.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShiftList implements OnInit {
  private readonly shifts = inject(ShiftDataClient);
  private readonly users = inject(UserDataClient);
  private readonly auth = inject(AuthSession);
  private readonly table = viewChild.required<Table>('dt');

  protected readonly rowsPerPageOptions = [5, 10, 20, 50];

  /** A SELLER only ever sees their own shifts, so the seller filter is noise. */
  protected readonly canFilterBySeller = computed(() => {
    const role = this.auth.role();
    return role === 'ADMIN' || role === 'SUPERVISOR' || role === 'ACCOUNTANT';
  });

  protected readonly statusOptions: FilterOption<ShiftStatus>[] = [
    { label: 'Todos los estados', value: null },
    ...(Object.keys(SHIFT_STATUS_LABELS) as ShiftStatus[]).map((value) => ({
      label: SHIFT_STATUS_LABELS[value],
      value,
    })),
  ];

  protected readonly statusFilter = signal<ShiftStatus | null>(null);
  protected readonly sellerFilter = signal<string | null>(null);
  /** [start, end] from the range datepicker; either end may be null mid-select. */
  protected readonly dateRange = signal<Date[] | null>(null);

  private readonly userNames = signal<ReadonlyMap<string, string>>(new Map());

  protected readonly sellerFilterOptions = computed(() => [
    { label: 'Todos los vendedores', value: null as string | null },
    ...[...this.userNames()].map(([id, name]) => ({ label: name, value: id })),
  ]);

  protected readonly list = new LazyList<Shift>((page, pageSize) => {
    const range = this.dateRange();
    return this.shifts.list({
      page,
      pageSize,
      status: this.statusFilter() ?? undefined,
      sellerId: this.sellerFilter() ?? undefined,
      dateFrom: range?.[0] ? formatDay(range[0]) : undefined,
      dateTo: range?.[1] ? formatDay(range[1]) : undefined,
    });
  }, 'No se pudieron cargar las jornadas.');

  ngOnInit(): void {
    void this.loadLookups();
  }

  protected onStatusFilterChange(status: ShiftStatus | null): void {
    this.statusFilter.set(status);
    // reset() jumps to page 1 and re-fires onLazyLoad with the new filter.
    this.table().reset();
  }

  protected onSellerFilterChange(sellerId: string | null): void {
    this.sellerFilter.set(sellerId);
    this.table().reset();
  }

  protected onDateRangeChange(range: Date[] | null): void {
    this.dateRange.set(range);
    // Refetch once the range is complete (both ends) or cleared.
    if (!range || range.length === 0 || (range[0] && range[1])) {
      this.table().reset();
    }
  }

  protected statusLabel(status: ShiftStatus): string {
    return SHIFT_STATUS_LABELS[status];
  }

  protected statusSeverity(status: ShiftStatus): ShiftTagSeverity {
    return SHIFT_STATUS_SEVERITY[status];
  }

  protected sellerName(sellerId: string): string {
    return this.userNames().get(sellerId) ?? '—';
  }

  private async loadLookups(): Promise<void> {
    try {
      const users = await firstValueFrom(
        this.users.list({ pageSize: LOOKUP_SIZE }),
      );
      this.userNames.set(
        new Map(users.items.map((user) => [user.id, user.fullName])),
      );
    } catch {
      // Names fall back to a dash if the lookup fails.
    }
  }
}
