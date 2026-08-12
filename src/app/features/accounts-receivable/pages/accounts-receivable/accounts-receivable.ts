import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';

import { fetchAllPages } from '../../../../core/http/fetch-all-pages';
import { LazyList } from '../../../../core/http/lazy-list';
import { formatDay } from '../../../../shared/utils/date-range';
import {
  columnLetter,
  exportToExcel,
  type ExcelCellSpec,
  type ExcelSheetSpec,
} from '../../../../shared/utils/excel-export';
import {
  AGING_SEVERITY_LABELS,
  agingRangeLabel,
  agingSeverity,
  type AgingBucket,
  type AgingSeverity,
  type DebtorRow,
  type DebtorSortBy,
  type ReceivableSummary,
} from '../../models/accounts-receivable.model';
import { AccountsReceivableDataClient } from '../../services/accounts-receivable-data';

type SummaryState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly summary: ReceivableSummary }
  | { readonly status: 'error'; readonly message: string };

/** Maps a PrimeNG sort column to the sortBy the debtors endpoint accepts. */
const DEBTOR_SORT_FIELDS: Record<string, DebtorSortBy> = {
  totalOwed: 'totalOwed',
  oldestSaleDate: 'oldest',
};

/** Bar width is capped so a lone bucket never renders as a full-width block. */
const MAX_BAR_PERCENT = 100;
/** Max page size the API allows — used to page through export data in as few round-trips as possible. */
const EXPORT_PAGE_SIZE = 100;

@Component({
  selector: 'app-accounts-receivable',
  imports: [
    CurrencyPipe,
    DatePipe,
    DecimalPipe,
    RouterLink,
    ButtonModule,
    SkeletonModule,
    TableModule,
  ],
  templateUrl: './accounts-receivable.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AccountsReceivable implements OnInit {
  private readonly receivables = inject(AccountsReceivableDataClient);

  protected readonly rowsPerPageOptions = [5, 10, 20, 50];
  protected readonly skeletonCards = [0, 1, 2, 3];
  protected readonly severityLabels = AGING_SEVERITY_LABELS;

  protected readonly summaryState = signal<SummaryState>({ status: 'loading' });
  protected readonly exporting = signal(false);
  protected readonly exportError = signal<string | null>(null);

  /**
   * The debtors endpoint takes no filters — only paging and sorting — so the
   * table owns the whole query and nothing needs to live in the URL here.
   * Sorting is server-side: the fetcher reads back the column PrimeNG has
   * active and translates it to the endpoint's `sortBy`.
   */
  protected readonly debtors: LazyList<DebtorRow> = new LazyList<DebtorRow>(
    (page, pageSize) =>
      this.receivables.debtors({
        page,
        pageSize,
        sortBy: this.debtorSortBy(),
        sortDir: this.debtors.sortOrder() ?? 'desc',
      }),
    'No se pudo cargar la lista de deudores.',
  );

  /** Aging bands of the whole portfolio, largest-first for the bar widths. */
  protected readonly buckets = computed<readonly AgingBucket[]>(() => {
    const state = this.summaryState();
    return state.status === 'success' ? state.summary.buckets : [];
  });

  /** The 90+ band, surfaced as its own KPI because it is what people act on. */
  protected readonly criticalTotal = computed(() =>
    this.buckets()
      .filter((bucket) => agingSeverity(bucket) === 'critical')
      .reduce((total, bucket) => total + bucket.total, 0),
  );

  ngOnInit(): void {
    void this.loadSummary();
  }

  protected async loadSummary(): Promise<void> {
    this.summaryState.set({ status: 'loading' });
    try {
      const summary = await firstValueFrom(this.receivables.summary());
      this.summaryState.set({ status: 'success', summary });
    } catch (error) {
      this.summaryState.set({
        status: 'error',
        message: toMessage(
          error,
          'No se pudo cargar el resumen de cuentas por cobrar.',
        ),
      });
    }
  }

  protected refreshAll(): void {
    void this.loadSummary();
    this.debtors.reload();
  }

  /**
   * Exports the full report — not just the current page of the debtors
   * table — as a 2-sheet workbook (Resumen, Deudores). The module that
   * writes the .xlsx has no calculation logic of its own, so every number
   * here is already final by the time it's handed off.
   */
  protected async exportReport(): Promise<void> {
    this.exporting.set(true);
    this.exportError.set(null);
    try {
      const { rows: debtors } = await fetchAllPages(
        (page, pageSize) =>
          this.receivables.debtors({
            page,
            pageSize,
            sortBy: this.debtorSortBy(),
            sortDir: this.debtors.sortOrder() ?? 'desc',
          }),
        { pageSize: EXPORT_PAGE_SIZE },
      );
      const summary = this.summaryState();

      await exportToExcel({
        fileName: `cuentas-por-cobrar-${formatDay(new Date())}`,
        sheets: [
          this.buildSummarySheet(summary.status === 'success' ? summary.summary : null),
          this.buildDebtorsSheet(debtors),
        ],
      });
    } catch (error) {
      this.exportError.set(toMessage(error, 'No se pudo generar el reporte.'));
    } finally {
      this.exporting.set(false);
    }
  }

  private buildSummarySheet(summary: ReceivableSummary | null): ExcelSheetSpec {
    const money = '"L "#,##0.00';
    const cells: ExcelCellSpec[] = [
      { ref: 'A1', value: 'Cuentas por cobrar', bold: true },
    ];

    if (!summary) {
      cells.push({ ref: 'A2', value: 'Sin datos disponibles.' });
      return { name: 'Resumen', cells, columnWidths: { A: 22, B: 14, C: 12 } };
    }

    const kpis: readonly [string, number][] = [
      ['Total por cobrar', summary.totalOutstanding],
      ['Clientes deudores', summary.debtorClients],
      ['Ventas abiertas', summary.openSalesCount],
    ];
    kpis.forEach(([label, value], index) => {
      const r = index + 2;
      cells.push(
        { ref: `A${r}`, value: label, bold: true },
        {
          ref: `B${r}`,
          value,
          numberFormat: label === 'Total por cobrar' ? money : undefined,
          align: 'right',
        },
      );
    });

    const bucketHeaderRow = kpis.length + 3;
    cells.push(
      { ref: `A${bucketHeaderRow}`, value: 'Antigüedad', bold: true },
      { ref: `B${bucketHeaderRow}`, value: 'Ventas', bold: true },
      { ref: `C${bucketHeaderRow}`, value: 'Total', bold: true },
    );
    summary.buckets.forEach((bucket, index) => {
      const r = bucketHeaderRow + index + 1;
      cells.push(
        { ref: `A${r}`, value: this.rangeLabelOf(bucket) },
        { ref: `B${r}`, value: bucket.salesCount, align: 'right' },
        { ref: `C${r}`, value: bucket.total, numberFormat: money, align: 'right' },
      );
    });

    return { name: 'Resumen', cells, columnWidths: { A: 22, B: 14, C: 16 } };
  }

  private buildDebtorsSheet(debtors: readonly DebtorRow[]): ExcelSheetSpec {
    const money = '"L "#,##0.00';
    const headers = ['Cliente', 'Ventas abiertas', 'Deuda más antigua', 'Total adeudado'];
    const cells: ExcelCellSpec[] = headers.map((label, index) => ({
      ref: `${columnLetter(index)}1`,
      value: label,
      bold: true,
    }));
    debtors.forEach((debtor, index) => {
      const r = index + 2;
      cells.push(
        { ref: `A${r}`, value: debtor.clientName },
        { ref: `B${r}`, value: debtor.openSalesCount, align: 'right' },
        { ref: `C${r}`, value: new Date(debtor.oldestSaleDate), numberFormat: 'dd/mm/yyyy' },
        { ref: `D${r}`, value: debtor.totalOwed, numberFormat: money, align: 'right' },
      );
    });
    return {
      name: 'Deudores',
      cells,
      columnWidths: { A: 28, B: 16, C: 18, D: 18 },
    };
  }

  protected severityOf(bucket: AgingBucket): AgingSeverity {
    return agingSeverity(bucket);
  }

  protected rangeLabelOf(bucket: AgingBucket): string {
    return agingRangeLabel(bucket);
  }

  /** Share of the portfolio this band represents, as a 0-100 percentage. */
  protected share(amount: number, total: number): number {
    if (total <= 0) {
      return 0;
    }
    return Math.min((amount / total) * 100, MAX_BAR_PERCENT);
  }

  private debtorSortBy(): DebtorSortBy {
    const field = this.debtors.sortField();
    const sortBy = field ? DEBTOR_SORT_FIELDS[field] : undefined;
    return sortBy ?? 'totalOwed';
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
