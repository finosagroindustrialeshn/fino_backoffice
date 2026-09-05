import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Params, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { Table, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

import { AuthSession } from '../../../../core/auth/auth-session';
import { fetchAllPages } from '../../../../core/http/fetch-all-pages';
import { LazyList } from '../../../../core/http/lazy-list';
import { MAX_PAGE_SIZE } from '../../../../core/http/pagination.model';
import { DateRangePresets } from '../../../../shared/components/date-range-presets/date-range-presets';
import { formatDay } from '../../../../shared/utils/date-range';
import { parseRange, parseUuid } from '../../../../shared/utils/query-params';
import {
  buildTableSheet,
  exportToExcel,
  EXCEL_DATETIME_FORMAT,
  EXCEL_MONEY_FORMAT,
  type ExcelColumn,
} from '../../../../shared/utils/excel-export';
import { ClientDataClient } from '../../../clients/services/client-data';
import { ProductDataClient } from '../../../products/services/product-data';
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
const CLIENT_LOOKUP_SIZE = MAX_PAGE_SIZE;

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
  private readonly products = inject(ProductDataClient);
  private readonly auth = inject(AuthSession);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
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

  /**
   * Route, stop and product arrive in the URL rather than from a dropdown:
   * they are how a report OPENS this page — the compliance report drilling
   * into a route's sales, the by-product ranking into a product's — and
   * neither has a sensible standalone picker here.
   *
   * Query params are user input, so each is validated before it reaches the
   * API; anything unparseable degrades to "no filter".
   */
  private readonly params = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  protected readonly routeIdFilter = computed(() =>
    parseUuid(this.params().get('routeId')),
  );
  protected readonly routeStopIdFilter = computed(() =>
    parseUuid(this.params().get('routeStopId')),
  );
  protected readonly productIdFilter = computed(() =>
    parseUuid(this.params().get('productId')),
  );

  protected readonly statusFilter = signal<SaleStatus | null>(null);
  protected readonly channelFilter = signal<SaleChannel | null>(null);
  protected readonly paymentTypeFilter = signal<PaymentType | null>(null);
  protected readonly sellerFilter = signal<string | null>(null);
  /** [start, end] from the range datepicker; either end may be null mid-select. */
  protected readonly dateRange = signal<Date[] | null>(null);

  private readonly userNames = signal<ReadonlyMap<string, string>>(new Map());
  private readonly clientNames = signal<ReadonlyMap<string, string>>(new Map());
  private readonly productNames = signal<ReadonlyMap<string, string>>(new Map());

  /**
   * What the drill-down chip says, or null when the full listing is showing.
   * A route has no name of its own, so only the product resolves to one — the
   * others say what they filter by and rely on the chip to get back.
   */
  protected readonly contextLabel = computed(() => {
    const productId = this.productIdFilter();
    if (productId) {
      const name = this.productNames().get(productId);
      return name ? 'Ventas que incluyen ' + name : 'Ventas de un producto';
    }
    if (this.routeStopIdFilter()) {
      return 'Ventas de una visita';
    }
    if (this.routeIdFilter()) {
      return 'Ventas de una ruta';
    }
    return null;
  });

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
      routeId: this.routeIdFilter() ?? undefined,
      routeStopId: this.routeStopIdFilter() ?? undefined,
      productId: this.productIdFilter() ?? undefined,
      dateFrom: range?.[0] ? formatDay(range[0]) : undefined,
      dateTo: range?.[1] ? formatDay(range[1]) : undefined,
    });
  }, 'No se pudieron cargar las ventas.');

  protected readonly exporting = signal(false);
  protected readonly exportError = signal<string | null>(null);
  /** Set when the export hit the row ceiling, so the user knows it is partial. */
  protected readonly exportNotice = signal<string | null>(null);

  constructor() {
    // A drill-down carries the report's range so the listing opens on the
    // same period the figures were read from. Applied once, as a seed: from
    // there the datepicker owns the range like on any other visit.
    const [seededFrom, seededTo] = parseRange(
      this.params().get('dateFrom'),
      this.params().get('dateTo'),
    ) ?? [];
    if (seededFrom && seededTo) {
      this.dateRange.set([seededFrom, seededTo]);
    }

    // The table fetches on its own init, so the first run is skipped; after
    // that a changed drill-down (a new one, or the chip being dismissed)
    // sends it back to page 1 and refetches.
    let isFirstRun = true;
    effect(() => {
      this.routeIdFilter();
      this.routeStopIdFilter();
      this.productIdFilter();
      if (isFirstRun) {
        isFirstRun = false;
        return;
      }
      this.table().reset();
    });
  }

  ngOnInit(): void {
    void this.loadLookups();
  }

  /** Drops the drill-down and shows the full listing again. */
  protected clearContextFilter(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        routeId: null,
        routeStopId: null,
        productId: null,
      } satisfies Params,
      queryParamsHandling: 'merge',
    });
  }

  /**
   * Exports every sale matching the current filters — not the page on screen.
   *
   * Names are resolved from full lookups fetched here rather than from the
   * bounded ones the table uses: a spreadsheet built for analysis cannot have
   * a client column that degrades to a dash past row 200.
   */
  protected async exportSales(): Promise<void> {
    this.exporting.set(true);
    this.exportError.set(null);
    this.exportNotice.set(null);
    try {
      const range = this.dateRange();
      const [sales, users, clients] = await Promise.all([
        fetchAllPages((page, pageSize) =>
          this.sales.list({
            page,
            pageSize,
            status: this.statusFilter() ?? undefined,
            channel: this.channelFilter() ?? undefined,
            paymentType: this.paymentTypeFilter() ?? undefined,
            sellerId: this.sellerFilter() ?? undefined,
            routeId: this.routeIdFilter() ?? undefined,
            routeStopId: this.routeStopIdFilter() ?? undefined,
            productId: this.productIdFilter() ?? undefined,
            dateFrom: range?.[0] ? formatDay(range[0]) : undefined,
            dateTo: range?.[1] ? formatDay(range[1]) : undefined,
          }),
        ),
        fetchAllPages((page, pageSize) => this.users.list({ page, pageSize })),
        fetchAllPages((page, pageSize) => this.clients.list({ page, pageSize })),
      ]);

      const userNames = new Map(users.rows.map((user) => [user.id, user.fullName]));
      const clientNames = new Map(
        clients.rows.map((client) => [client.id, client.name]),
      );

      const columns: readonly ExcelColumn<Sale>[] = [
        {
          header: 'Fecha',
          value: (sale) => new Date(sale.createdAt),
          numberFormat: EXCEL_DATETIME_FORMAT,
          width: 18,
        },
        {
          header: 'Cliente',
          // Falls back to the id, never to a dash: an unresolved name still
          // has to be traceable in the spreadsheet.
          value: (sale) =>
            sale.clientId
              ? (clientNames.get(sale.clientId) ?? sale.clientId)
              : 'Consumidor final',
          width: 28,
        },
        {
          header: 'Vendedor',
          value: (sale) => userNames.get(sale.sellerId) ?? sale.sellerId,
          width: 24,
        },
        {
          header: 'Canal',
          value: (sale) => SALE_CHANNEL_LABELS[sale.channel],
          width: 12,
        },
        {
          header: 'Tipo de pago',
          value: (sale) => PAYMENT_TYPE_LABELS[sale.paymentType],
          width: 14,
        },
        {
          header: 'Estado',
          value: (sale) => SALE_STATUS_LABELS[sale.status],
          width: 12,
        },
        {
          header: 'Total',
          value: (sale) => Number(sale.total),
          numberFormat: EXCEL_MONEY_FORMAT,
          align: 'right',
          width: 16,
        },
        {
          header: 'Abonado',
          value: (sale) => Number(sale.amountPaid),
          numberFormat: EXCEL_MONEY_FORMAT,
          align: 'right',
          width: 16,
        },
        {
          header: 'Saldo',
          value: (sale) => Number(sale.balanceDue),
          numberFormat: EXCEL_MONEY_FORMAT,
          align: 'right',
          width: 16,
        },
        { header: 'Notas', value: (sale) => sale.notes, width: 32 },
      ];

      await exportToExcel({
        fileName: `ventas-${formatDay(new Date())}`,
        sheets: [buildTableSheet('Ventas', columns, sales.rows)],
      });

      if (sales.truncated) {
        this.exportNotice.set(
          `El archivo incluye las primeras ${sales.rows.length} de ${sales.total} ventas. Acotá el rango de fechas para exportarlas todas.`,
        );
      }
    } catch (error) {
      this.exportError.set(toMessage(error, 'No se pudo generar el archivo.'));
    } finally {
      this.exporting.set(false);
    }
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
      const [users, clients, products] = await Promise.all([
        firstValueFrom(this.users.list({ pageSize: LOOKUP_SIZE })),
        firstValueFrom(this.clients.list({ pageSize: CLIENT_LOOKUP_SIZE })),
        firstValueFrom(this.products.list({ pageSize: LOOKUP_SIZE })),
      ]);
      this.userNames.set(
        new Map(users.items.map((user) => [user.id, user.fullName])),
      );
      this.clientNames.set(
        new Map(clients.items.map((client) => [client.id, client.name])),
      );
      this.productNames.set(
        new Map(products.items.map((product) => [product.id, product.name])),
      );
    } catch {
      // Names fall back to a dash if the lookups fail.
    }
  }
}

function toMessage(error: unknown, fallback: string): string {
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
