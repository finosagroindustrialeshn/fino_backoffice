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
import { ClientDataClient } from '../../../clients/services/client-data';
import { UserDataClient } from '../../../users/services/user-data';
import {
  PAYMENT_TYPE_LABELS,
  SALE_CHANNEL_LABELS,
  SALE_CHANNEL_SEVERITY,
  SALE_STATUS_LABELS,
  SALE_STATUS_SEVERITY,
  type PaymentType,
  type Sale,
  type SaleChannel,
  type SaleStatus,
  type SaleTagSeverity,
} from '../../models/sale.model';
import { SaleDataClient } from '../../services/sale-data';

interface FilterOption<T> {
  readonly label: string;
  readonly value: T | null;
}

/**
 * Users and clients are bounded lookups joined to the paginated sales, which
 * carry ids only. A name missing from the lookup degrades to a dash rather
 * than showing a raw uuid.
 */
const LOOKUP_SIZE = 100;
const CLIENT_LOOKUP_SIZE = 200;

@Component({
  selector: 'app-sale-list',
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
  templateUrl: './sale-list.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaleList implements OnInit {
  private readonly sales = inject(SaleDataClient);
  private readonly users = inject(UserDataClient);
  private readonly clients = inject(ClientDataClient);
  private readonly auth = inject(AuthSession);
  private readonly table = viewChild.required<Table>('dt');

  protected readonly rowsPerPageOptions = [5, 10, 20, 50];

  /** A SELLER only ever sees their own sales, so the seller filter is noise. */
  protected readonly canFilterBySeller = computed(() => {
    const role = this.auth.role();
    return role === 'ADMIN' || role === 'SUPERVISOR' || role === 'ACCOUNTANT';
  });

  protected readonly statusOptions: FilterOption<SaleStatus>[] = [
    { label: 'Todos los estados', value: null },
    ...(Object.keys(SALE_STATUS_LABELS) as SaleStatus[]).map((value) => ({
      label: SALE_STATUS_LABELS[value],
      value,
    })),
  ];

  protected readonly channelOptions: FilterOption<SaleChannel>[] = [
    { label: 'Todos los canales', value: null },
    ...(Object.keys(SALE_CHANNEL_LABELS) as SaleChannel[]).map((value) => ({
      label: SALE_CHANNEL_LABELS[value],
      value,
    })),
  ];

  protected readonly paymentTypeOptions: FilterOption<PaymentType>[] = [
    { label: 'Contado y crédito', value: null },
    ...(Object.keys(PAYMENT_TYPE_LABELS) as PaymentType[]).map((value) => ({
      label: PAYMENT_TYPE_LABELS[value],
      value,
    })),
  ];

  protected readonly statusFilter = signal<SaleStatus | null>(null);
  protected readonly channelFilter = signal<SaleChannel | null>(null);
  protected readonly paymentTypeFilter = signal<PaymentType | null>(null);
  protected readonly sellerFilter = signal<string | null>(null);
  /** [start, end] from the range datepicker; either end may be null mid-select. */
  protected readonly dateRange = signal<Date[] | null>(null);

  private readonly userNames = signal<ReadonlyMap<string, string>>(new Map());
  private readonly clientNames = signal<ReadonlyMap<string, string>>(new Map());

  protected readonly sellerFilterOptions = computed(() => [
    { label: 'Todos los vendedores', value: null as string | null },
    ...[...this.userNames()].map(([id, name]) => ({ label: name, value: id })),
  ]);

  protected readonly list = new LazyList<Sale>((page, pageSize) => {
    const range = this.dateRange();
    return this.sales.list({
      page,
      pageSize,
      status: this.statusFilter() ?? undefined,
      channel: this.channelFilter() ?? undefined,
      paymentType: this.paymentTypeFilter() ?? undefined,
      sellerId: this.sellerFilter() ?? undefined,
      dateFrom: range?.[0] ? formatDay(range[0]) : undefined,
      dateTo: range?.[1] ? formatDay(range[1]) : undefined,
    });
  }, 'No se pudieron cargar las ventas.');

  ngOnInit(): void {
    void this.loadLookups();
  }

  protected onStatusFilterChange(status: SaleStatus | null): void {
    this.statusFilter.set(status);
    // reset() jumps to page 1 and re-fires onLazyLoad with the new filter.
    this.table().reset();
  }

  protected onChannelFilterChange(channel: SaleChannel | null): void {
    this.channelFilter.set(channel);
    this.table().reset();
  }

  protected onPaymentTypeFilterChange(paymentType: PaymentType | null): void {
    this.paymentTypeFilter.set(paymentType);
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

  protected statusLabel(status: SaleStatus): string {
    return SALE_STATUS_LABELS[status];
  }

  protected statusSeverity(status: SaleStatus): SaleTagSeverity {
    return SALE_STATUS_SEVERITY[status];
  }

  protected channelLabel(channel: SaleChannel): string {
    return SALE_CHANNEL_LABELS[channel];
  }

  protected channelSeverity(channel: SaleChannel): SaleTagSeverity {
    return SALE_CHANNEL_SEVERITY[channel];
  }

  protected paymentTypeLabel(paymentType: PaymentType): string {
    return PAYMENT_TYPE_LABELS[paymentType];
  }

  /** A STORE sale can be a walk-in with no client on file. */
  protected clientName(clientId: string | null): string {
    if (!clientId) {
      return 'Consumidor final';
    }
    return this.clientNames().get(clientId) ?? '—';
  }

  protected sellerName(sellerId: string): string {
    return this.userNames().get(sellerId) ?? '—';
  }

  private async loadLookups(): Promise<void> {
    try {
      // Not filtered by role: a STORE sale's "seller" is whoever was on the
      // till, which is an admin or supervisor, not a SELLER.
      const [users, clients] = await Promise.all([
        firstValueFrom(this.users.list({ pageSize: LOOKUP_SIZE })),
        firstValueFrom(this.clients.list({ pageSize: CLIENT_LOOKUP_SIZE })),
      ]);
      this.userNames.set(
        new Map(users.items.map((user) => [user.id, user.fullName])),
      );
      this.clientNames.set(
        new Map(clients.items.map((client) => [client.id, client.name])),
      );
    } catch {
      // Names fall back to a dash if the lookups fail.
    }
  }
}
