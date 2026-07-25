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
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Params, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';
import { Table, TableModule } from 'primeng/table';

import { LazyList } from '../../../../core/http/lazy-list';
import { DateRangePresets } from '../../../../shared/components/date-range-presets/date-range-presets';
import { formatDay, lastNDays, type DateRange } from '../../../../shared/utils/date-range';
import { UserDataClient } from '../../../users/services/user-data';
import {
  SALES_CHANNEL_LABELS,
  type ProductSalesRow,
  type ProductSalesSortBy,
  type SalesChannel,
  type SalesSummary,
  type SellerSalesRow,
} from '../../models/sales-report.model';
import { ReportsSalesDataClient } from '../../services/reports-sales-data';
import {
  parseOneOf,
  parseRange,
  parseUuid,
} from '../../utils/report-params';

type SummaryState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly summary: SalesSummary }
  | { readonly status: 'error'; readonly message: string };

/** Sellers are a bounded lookup used only to populate the filter dropdown. */
const LOOKUP_SIZE = 100;
/** Window used when the URL carries no range. */
const DEFAULT_RANGE_DAYS = 30;

const CHANNELS: readonly SalesChannel[] = ['FIELD', 'STORE'];

/** Maps a PrimeNG sort column to the sortBy the by-product endpoint accepts. */
const PRODUCT_SORT_FIELDS: Record<string, ProductSalesSortBy> = {
  revenue: 'revenue',
  unitsSold: 'units',
};

@Component({
  selector: 'app-sales-report',
  imports: [
    CurrencyPipe,
    DecimalPipe,
    FormsModule,
    ButtonModule,
    DatePickerModule,
    DateRangePresets,
    SelectModule,
    SkeletonModule,
    TableModule,
  ],
  templateUrl: './sales-report.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SalesReport implements OnInit {
  private readonly reports = inject(ReportsSalesDataClient);
  private readonly users = inject(UserDataClient);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly productTable = viewChild.required<Table>('productTable');
  private readonly sellerTable = viewChild.required<Table>('sellerTable');

  protected readonly rowsPerPageOptions = [5, 10, 20, 50];
  protected readonly skeletonRows = [0, 1, 2, 3];

  /**
   * The URL is the single source of truth for every filter: the controls only
   * navigate, and these computeds read the result back. That makes refresh,
   * browser back/forward and a shared link all behave identically.
   */
  private readonly params = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  /** Falls back to the last 30 days when the URL carries no valid range. */
  protected readonly dateRange = computed<DateRange>(() => {
    const params = this.params();
    return (
      parseRange(params.get('dateFrom'), params.get('dateTo')) ??
      lastNDays(DEFAULT_RANGE_DAYS, new Date())
    );
  });

  protected readonly sellerFilter = computed(() =>
    parseUuid(this.params().get('sellerId')),
  );

  protected readonly channelFilter = computed(() =>
    parseOneOf(this.params().get('channel'), CHANNELS),
  );

  /** Changes to these — and only these — trigger a refetch. */
  private readonly filterKey = computed(() =>
    JSON.stringify([
      this.range(),
      this.sellerFilter(),
      this.channelFilter(),
    ]),
  );

  protected readonly channelFilterOptions = [
    { label: 'Todos los canales', value: null as SalesChannel | null },
    ...(Object.keys(SALES_CHANNEL_LABELS) as SalesChannel[]).map((value) => ({
      label: SALES_CHANNEL_LABELS[value],
      value,
    })),
  ];

  private readonly sellerNames = signal<ReadonlyMap<string, string>>(new Map());

  protected readonly sellerFilterOptions = computed(() => [
    { label: 'Todos los vendedores', value: null as string | null },
    ...[...this.sellerNames()].map(([id, name]) => ({ label: name, value: id })),
  ]);

  protected readonly summaryState = signal<SummaryState>({ status: 'loading' });

  // Annotated explicitly: the fetcher reads back this.productList.sortOrder(),
  // which would otherwise make the type circular.
  protected readonly productList: LazyList<ProductSalesRow> =
    new LazyList<ProductSalesRow>(
      (page, pageSize) =>
        this.reports.byProduct({
          page,
          pageSize,
          ...this.range(),
          sortBy: this.productSortBy(),
          sortDir: this.productList.sortOrder() ?? 'desc',
        }),
      'No se pudo cargar el ranking por producto.',
    );

  protected readonly sellerList: LazyList<SellerSalesRow> =
    new LazyList<SellerSalesRow>(
      (page, pageSize) =>
        this.reports.bySeller({
          page,
          pageSize,
          ...this.range(),
          sortDir: this.sellerList.sortOrder() ?? 'desc',
        }),
      'No se pudo cargar el ranking por vendedor.',
    );

  constructor() {
    // Skips its own first run: the tables fetch on their own init, and the
    // summary is loaded from ngOnInit. From then on every URL change — a
    // control, a paste, browser back — refetches through this one path.
    let isFirstRun = true;
    effect(() => {
      this.filterKey();
      if (isFirstRun) {
        isFirstRun = false;
        return;
      }
      void this.loadSummary();
      // reset() jumps to page 1 and re-fires onLazyLoad with the new filters.
      this.productTable().reset();
      this.sellerTable().reset();
    });
  }

  ngOnInit(): void {
    void this.loadSellers();
    void this.loadSummary();
  }

  private range(): { dateFrom: string; dateTo: string } {
    const [from, to] = this.dateRange() ?? [];
    return {
      dateFrom: from ? formatDay(from) : '',
      dateTo: to ? formatDay(to) : '',
    };
  }

  private productSortBy(): ProductSalesSortBy {
    const field = this.productList.sortField();
    const sortBy = field ? PRODUCT_SORT_FIELDS[field] : undefined;
    return sortBy ?? 'revenue';
  }

  protected onDateRangeChange(range: Date[] | null): void {
    // Half-picked ranges are ignored until the second bound lands.
    if (range && range[0] && !range[1]) {
      return;
    }
    this.patchParams({
      dateFrom: range?.[0] ? formatDay(range[0]) : null,
      dateTo: range?.[1] ? formatDay(range[1]) : null,
    });
  }

  protected onSellerFilterChange(sellerId: string | null): void {
    this.patchParams({ sellerId });
  }

  protected onChannelFilterChange(channel: SalesChannel | null): void {
    this.patchParams({ channel });
  }

  protected refreshAll(): void {
    void this.loadSummary();
    this.productTable().reset();
    this.sellerTable().reset();
  }

  protected async loadSummary(): Promise<void> {
    this.summaryState.set({ status: 'loading' });
    try {
      const summary = await firstValueFrom(
        this.reports.summary({
          ...this.range(),
          sellerId: this.sellerFilter() ?? undefined,
          channel: this.channelFilter() ?? undefined,
        }),
      );
      this.summaryState.set({ status: 'success', summary });
    } catch (error) {
      this.summaryState.set({
        status: 'error',
        message: toMessage(error, 'No se pudo cargar el resumen de ventas.'),
      });
    }
  }

  /** Share of the total, as a 0-100 percentage. Guards the zero-sales case. */
  protected share(amount: number, total: number): number {
    return total > 0 ? (amount / total) * 100 : 0;
  }

  protected sellerName(sellerId: string): string {
    return this.sellerNames().get(sellerId) ?? sellerId;
  }

  /** Merges into the current query params; a null value drops the param. */
  private patchParams(patch: Params): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: patch,
      queryParamsHandling: 'merge',
    });
  }

  private async loadSellers(): Promise<void> {
    try {
      const sellers = await firstValueFrom(
        this.users.list({ role: 'SELLER', pageSize: LOOKUP_SIZE }),
      );
      this.sellerNames.set(
        new Map(sellers.items.map((user) => [user.id, user.fullName])),
      );
    } catch {
      // The dropdown just stays empty if the lookup fails.
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
