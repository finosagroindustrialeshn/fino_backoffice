import { CurrencyPipe, DecimalPipe, PercentPipe } from '@angular/common';
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
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { Table, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

import { fetchAllPages } from '../../../../core/http/fetch-all-pages';
import { LazyList } from '../../../../core/http/lazy-list';
import { DateRangePresets } from '../../../../shared/components/date-range-presets/date-range-presets';
import {
  formatDay,
  lastNDays,
  type DateRange,
} from '../../../../shared/utils/date-range';
import {
  buildTableSheet,
  EXCEL_DATE_FORMAT,
  EXCEL_MONEY_FORMAT,
  exportToExcel,
  type ExcelColumn,
} from '../../../../shared/utils/excel-export';
import {
  ROUTE_STATUS_LABELS,
  ROUTE_STATUS_SEVERITY,
  type RouteStatus,
  type RouteStatusSeverity,
} from '../../../routes/models/route.model';
import { UserDataClient } from '../../../users/services/user-data';
import type { RouteComplianceRow } from '../../models/route-compliance-report.model';
import { ReportsRoutesDataClient } from '../../services/reports-routes-data';

/** Sellers are a bounded lookup used only to populate the filter. */
const LOOKUP_SIZE = 100;
/** Window used before the user picks a range. */
const DEFAULT_RANGE_DAYS = 30;
/** The export walks every page; a bigger page means fewer round trips. */
const EXPORT_PAGE_SIZE = 100;

interface SelectOption<T> {
  readonly label: string;
  readonly value: T;
}

/**
 * Export columns. Rates go out as raw fractions with a percent format rather
 * than as "75%" text, so the spreadsheet can average them.
 */
const COLUMNS: readonly ExcelColumn<RouteComplianceRow>[] = [
  {
    header: 'Fecha',
    // Midday, not midnight: a plain YYYY-MM-DD parsed as UTC and rendered in
    // a negative-offset timezone lands on the previous day.
    value: (row) => new Date(`${row.date}T12:00:00`),
    numberFormat: EXCEL_DATE_FORMAT,
  },
  { header: 'Vendedor', value: (row) => row.sellerName, width: 24 },
  { header: 'Estado', value: (row) => ROUTE_STATUS_LABELS[row.status] },
  { header: 'Planificadas', value: (row) => row.plannedStops },
  { header: 'Visitadas', value: (row) => row.visitedStops },
  { header: 'Saltadas', value: (row) => row.skippedStops },
  { header: 'Sin llegar', value: (row) => row.pendingStops },
  { header: 'Con venta', value: (row) => row.stopsWithSale },
  { header: 'Ventas', value: (row) => row.salesCount },
  {
    header: 'Monto',
    value: (row) => row.salesAmount,
    numberFormat: EXCEL_MONEY_FORMAT,
  },
  { header: '% visita', value: (row) => row.visitRate, numberFormat: '0.0%' },
  {
    header: '% conversión',
    value: (row) => row.conversionRate,
    numberFormat: '0.0%',
  },
];

@Component({
  selector: 'app-route-compliance-report',
  imports: [
    CurrencyPipe,
    DecimalPipe,
    PercentPipe,
    FormsModule,
    ButtonModule,
    DatePickerModule,
    DateRangePresets,
    SelectModule,
    TableModule,
    TagModule,
  ],
  templateUrl: './route-compliance-report.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RouteComplianceReport implements OnInit {
  private readonly reports = inject(ReportsRoutesDataClient);
  private readonly users = inject(UserDataClient);
  private readonly table = viewChild.required<Table>('dt');

  protected readonly rowsPerPageOptions = [10, 20, 50];

  protected readonly dateRange = signal<DateRange>(
    lastNDays(DEFAULT_RANGE_DAYS, new Date()),
  );
  protected readonly sellerFilter = signal<string | null>(null);
  /**
   * Defaults to COMPLETED, as the spec advises: a route still in progress has
   * pending stops that are not yet a failure to visit, and counting them as
   * misses would report a problem that has not happened yet.
   */
  protected readonly statusFilter = signal<RouteStatus | null>('COMPLETED');

  protected readonly sellerFilterOptions = signal<SelectOption<string | null>[]>(
    [{ label: 'Todos los vendedores', value: null }],
  );

  protected readonly statusFilterOptions: SelectOption<RouteStatus | null>[] = [
    { label: 'Todos los estados', value: null },
    ...(Object.keys(ROUTE_STATUS_LABELS) as RouteStatus[]).map((value) => ({
      label: ROUTE_STATUS_LABELS[value],
      value: value as RouteStatus | null,
    })),
  ];

  private readonly range = computed(() => {
    const range = this.dateRange();
    return {
      dateFrom: range?.[0] ? formatDay(range[0]) : undefined,
      dateTo: range?.[1] ? formatDay(range[1]) : undefined,
    };
  });

  protected readonly list = new LazyList<RouteComplianceRow>(
    (page, pageSize) =>
      this.reports.compliance({ page, pageSize, ...this.query() }),
    'No se pudo cargar el cumplimiento de rutas.',
  );

  protected readonly exporting = signal(false);
  protected readonly exportError = signal<string | null>(null);
  /** Set when the export hit the row ceiling and the file is incomplete. */
  protected readonly exportTruncated = signal(false);

  ngOnInit(): void {
    void this.loadSellers();
  }

  private query() {
    return {
      sellerId: this.sellerFilter() ?? undefined,
      status: this.statusFilter() ?? undefined,
      ...this.range(),
    };
  }

  protected onDateRangeChange(range: DateRange): void {
    this.dateRange.set(range);
    // Refetch once the range is complete (both ends) or cleared.
    if (!range || range.length === 0 || (range[0] && range[1])) {
      this.table().reset();
    }
  }

  protected onSellerFilterChange(sellerId: string | null): void {
    this.sellerFilter.set(sellerId);
    this.table().reset();
  }

  protected onStatusFilterChange(status: RouteStatus | null): void {
    this.statusFilter.set(status);
    this.table().reset();
  }

  protected statusLabel(status: RouteStatus): string {
    return ROUTE_STATUS_LABELS[status];
  }

  protected statusSeverity(status: RouteStatus): RouteStatusSeverity {
    return ROUTE_STATUS_SEVERITY[status];
  }

  /**
   * A rate is just a number until something says which numbers are bad.
   * Amber below 80% of the plan, red below half.
   */
  protected rateClass(rate: number): string {
    if (rate >= 0.8) {
      return 'text-emerald-700';
    }
    return rate >= 0.5 ? 'text-amber-700' : 'text-red-700';
  }

  /** Exports every row matching the filters, not just the page on screen. */
  protected async exportReport(): Promise<void> {
    if (this.exporting()) {
      return;
    }
    this.exporting.set(true);
    this.exportError.set(null);
    this.exportTruncated.set(false);
    try {
      const result = await fetchAllPages(
        (page, pageSize) =>
          this.reports.compliance({ page, pageSize, ...this.query() }),
        { pageSize: EXPORT_PAGE_SIZE },
      );
      // Surfaced, never swallowed: a file that looks complete but is not gets
      // read as the whole picture.
      this.exportTruncated.set(result.truncated);
      await exportToExcel({
        fileName: `cumplimiento-rutas-${formatDay(new Date())}`,
        sheets: [buildTableSheet('Cumplimiento', COLUMNS, result.rows)],
      });
    } catch (error) {
      this.exportError.set(toMessage(error, 'No se pudo generar el reporte.'));
    } finally {
      this.exporting.set(false);
    }
  }

  private async loadSellers(): Promise<void> {
    try {
      const result = await firstValueFrom(
        this.users.list({ role: 'SELLER', pageSize: LOOKUP_SIZE }),
      );
      this.sellerFilterOptions.set([
        { label: 'Todos los vendedores', value: null },
        ...result.items.map((user) => ({
          label: user.fullName,
          value: user.id as string | null,
        })),
      ]);
    } catch {
      // The filter keeps only its "all sellers" option if the lookup fails.
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
