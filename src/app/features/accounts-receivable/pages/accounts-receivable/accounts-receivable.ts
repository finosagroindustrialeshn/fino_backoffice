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

import { LazyList } from '../../../../core/http/lazy-list';
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
