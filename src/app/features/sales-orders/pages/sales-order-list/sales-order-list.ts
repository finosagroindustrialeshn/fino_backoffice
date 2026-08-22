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
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { Table, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToggleSwitchModule } from 'primeng/toggleswitch';

import { AuthSession } from '../../../../core/auth/auth-session';
import { LazyList } from '../../../../core/http/lazy-list';
import { DateRangePresets } from '../../../../shared/components/date-range-presets/date-range-presets';
import { formatDay } from '../../../../shared/utils/date-range';
import { UserDataClient } from '../../../users/services/user-data';
import {
  SALES_ORDER_STATUS_LABELS,
  SALES_ORDER_STATUS_SEVERITY,
  type SalesOrderListItem,
  type SalesOrderStatus,
  type SalesOrderTagSeverity,
} from '../../models/sales-order.model';
import {
  SalesOrderDataClient,
  type SalesOrderSort,
} from '../../services/sales-order-data';

interface FilterOption<T> {
  readonly label: string;
  readonly value: T | null;
}

/** Sellers and preventistas are bounded lookups used only by the filters. */
const LOOKUP_SIZE = 100;

/** Matches the clients list: long enough to finish typing a code like SO-42. */
const SEARCH_DEBOUNCE_MS = 350;

@Component({
  selector: 'app-sales-order-list',
  imports: [
    CurrencyPipe,
    DatePipe,
    FormsModule,
    RouterLink,
    ButtonModule,
    DatePickerModule,
    DateRangePresets,
    InputTextModule,
    SelectModule,
    TableModule,
    TagModule,
    ToggleSwitchModule,
  ],
  templateUrl: './sales-order-list.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SalesOrderList implements OnInit {
  private readonly orders = inject(SalesOrderDataClient);
  private readonly users = inject(UserDataClient);
  private readonly auth = inject(AuthSession);
  private readonly table = viewChild.required<Table>('dt');

  protected readonly rowsPerPageOptions = [5, 10, 20, 50];

  /**
   * The API scopes a preventista to the orders they took and a seller to the
   * ones assigned to them, and ignores these params for both — so offering
   * the filters would only promise a reach the route cannot express.
   */
  protected readonly canFilterByPerson = computed(() => {
    const role = this.auth.role();
    return role === 'ADMIN' || role === 'SUPERVISOR' || role === 'ACCOUNTANT';
  });

  /** Taking an order from the back office needs no open shift. */
  protected readonly canTakeOrder = computed(() => {
    const role = this.auth.role();
    return role === 'ADMIN' || role === 'SUPERVISOR';
  });

  protected readonly statusOptions: FilterOption<SalesOrderStatus>[] = [
    { label: 'Todos los estados', value: null },
    ...(Object.keys(SALES_ORDER_STATUS_LABELS) as SalesOrderStatus[]).map(
      (value) => ({ label: SALES_ORDER_STATUS_LABELS[value], value }),
    ),
  ];

  protected readonly sortOptions: { label: string; value: SalesOrderSort }[] = [
    { label: 'Más recientes primero', value: 'newest' },
    { label: 'Más antiguos primero', value: 'oldest' },
    { label: 'Por fecha de entrega', value: 'delivery' },
  ];

  /** Bound to the search box for instant feedback; debounced into `appliedSearch`. */
  protected readonly searchTerm = signal('');
  private readonly appliedSearch = signal('');
  private searchDebounce: ReturnType<typeof setTimeout> | null = null;
  protected readonly statusFilter = signal<SalesOrderStatus | null>(null);
  protected readonly openOnly = signal(false);
  protected readonly unassignedOnly = signal(false);
  protected readonly overdueOnly = signal(false);
  protected readonly takenByFilter = signal<string | null>(null);
  protected readonly assignedToFilter = signal<string | null>(null);
  protected readonly sort = signal<SalesOrderSort>('newest');
  /** [start, end] from the range datepicker; either end may be null mid-select. */
  protected readonly dateRange = signal<Date[] | null>(null);

  private readonly preventistas = signal<readonly { id: string; name: string }[]>([]);
  private readonly sellers = signal<readonly { id: string; name: string }[]>([]);

  protected readonly takenByOptions = computed(() => [
    { label: 'Todos los preventistas', value: null as string | null },
    ...this.preventistas().map(({ id, name }) => ({ label: name, value: id })),
  ]);

  protected readonly assignedToOptions = computed(() => [
    { label: 'Todos los vendedores', value: null as string | null },
    ...this.sellers().map(({ id, name }) => ({ label: name, value: id })),
  ]);

  /** True while the filters match the queue preset, so the button reads as on. */
  protected readonly isQueueView = computed(
    () =>
      this.openOnly() &&
      this.unassignedOnly() &&
      !this.overdueOnly() &&
      this.sort() === 'oldest',
  );

  /** True while the filters match the overdue preset. */
  protected readonly isOverdueView = computed(
    () => this.overdueOnly() && this.sort() === 'delivery',
  );

  protected readonly list = new LazyList<SalesOrderListItem>((page, pageSize) => {
    const range = this.dateRange();
    return this.orders.list({
      page,
      pageSize,
      search: this.appliedSearch() || undefined,
      // `openOnly` overrides `status` server-side, so it is sent only when on
      // — otherwise an explicit `false` would travel next to a real status.
      openOnly: this.openOnly() ? true : undefined,
      status: this.openOnly() ? undefined : (this.statusFilter() ?? undefined),
      // Both flags are omitted rather than sent as `false`: toQueryParams
      // keeps a literal false, and a filter nobody asked for should not
      // travel at all.
      unassignedOnly: this.unassignedOnly() ? true : undefined,
      overdueOnly: this.overdueOnly() ? true : undefined,
      takenById: this.takenByFilter() ?? undefined,
      assignedToId: this.assignedToFilter() ?? undefined,
      sort: this.sort(),
      dateFrom: range?.[0] ? formatDay(range[0]) : undefined,
      dateTo: range?.[1] ? formatDay(range[1]) : undefined,
    });
  }, 'No se pudieron cargar los pedidos.');

  ngOnInit(): void {
    void this.loadLookups();
  }

  /**
   * The real work queue: every open order nobody currently holds, oldest
   * first — the client who has been waiting longest comes first.
   *
   * Deliberately NOT `status=PLACED`. An order a seller handed back after
   * delivering part of it stays PARTIALLY_CONVERTED with nobody assigned, so
   * a PLACED-only filter would hide it forever while the client is still
   * owed product.
   */
  protected showQueue(): void {
    this.statusFilter.set(null);
    this.openOnly.set(true);
    this.unassignedOnly.set(true);
    this.overdueOnly.set(false);
    this.sort.set('oldest');
    this.table().reset();
  }

  /** Promises whose day already went by, soonest promised first. */
  protected showOverdue(): void {
    this.statusFilter.set(null);
    this.openOnly.set(false);
    this.unassignedOnly.set(false);
    this.overdueOnly.set(true);
    this.sort.set('delivery');
    this.table().reset();
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

  protected onUnassignedOnlyChange(value: boolean): void {
    this.unassignedOnly.set(value);
    this.table().reset();
  }

  protected onOverdueOnlyChange(value: boolean): void {
    this.overdueOnly.set(value);
    this.table().reset();
  }

  protected onStatusFilterChange(status: SalesOrderStatus | null): void {
    this.statusFilter.set(status);
    this.table().reset();
  }

  protected onOpenOnlyChange(openOnly: boolean): void {
    this.openOnly.set(openOnly);
    this.table().reset();
  }

  protected onTakenByChange(userId: string | null): void {
    this.takenByFilter.set(userId);
    this.table().reset();
  }

  protected onAssignedToChange(userId: string | null): void {
    this.assignedToFilter.set(userId);
    this.table().reset();
  }

  protected onSortChange(sort: SalesOrderSort): void {
    this.sort.set(sort);
    this.table().reset();
  }

  protected onDateRangeChange(range: Date[] | null): void {
    this.dateRange.set(range);
    // Refetch once the range is complete (both ends) or cleared.
    if (!range || range.length === 0 || (range[0] && range[1])) {
      this.table().reset();
    }
  }

  protected statusLabel(status: SalesOrderStatus): string {
    return SALES_ORDER_STATUS_LABELS[status];
  }

  protected statusSeverity(status: SalesOrderStatus): SalesOrderTagSeverity {
    return SALES_ORDER_STATUS_SEVERITY[status];
  }

  /** Units still owed to the client across the whole order. */
  protected unitsPending(order: SalesOrderListItem): number {
    return order.unitsOrdered - order.unitsFulfilled;
  }

  /**
   * A one-line summary of what was ordered, so the table answers "what did
   * they ask for" without opening the order. Truncated past two products —
   * the detail is one click away.
   */
  protected productsSummary(order: SalesOrderListItem): string {
    const [first, second, ...rest] = order.products;
    if (!first) {
      return '—';
    }
    const shown = [first, second]
      .filter((product) => product !== undefined)
      .map((product) => `${product.quantity}× ${product.name}`)
      .join(', ');
    return rest.length > 0 ? `${shown} +${rest.length}` : shown;
  }

  private async loadLookups(): Promise<void> {
    if (!this.canFilterByPerson()) {
      return;
    }
    try {
      const [preventistas, sellers] = await Promise.all([
        firstValueFrom(
          this.users.list({ role: 'PREVENTISTA', pageSize: LOOKUP_SIZE }),
        ),
        firstValueFrom(
          this.users.list({ role: 'SELLER', pageSize: LOOKUP_SIZE }),
        ),
      ]);
      this.preventistas.set(
        preventistas.items.map((user) => ({ id: user.id, name: user.fullName })),
      );
      this.sellers.set(
        sellers.items.map((user) => ({ id: user.id, name: user.fullName })),
      );
    } catch {
      // The filters degrade to "everyone" if the lookups fail.
    }
  }
}
