import { CurrencyPipe, DecimalPipe, PercentPipe } from '@angular/common';
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
import { SkeletonModule } from 'primeng/skeleton';
import { Table, TableModule } from 'primeng/table';

import { LazyList } from '../../../../core/http/lazy-list';
import { DateRangePresets } from '../../../../shared/components/date-range-presets/date-range-presets';
import {
  formatDay,
  lastNDays,
  type DateRange,
} from '../../../../shared/utils/date-range';
import { parseRange, parseUuid } from '../../../../shared/utils/query-params';
import { UserDataClient } from '../../../users/services/user-data';
import type {
  PreventaSummary,
  PreventistaOrdersRow,
} from '../../models/preventa-report.model';
import { ReportsPreventaDataClient } from '../../services/reports-preventa-data';

type SummaryState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly summary: PreventaSummary }
  | { readonly status: 'error'; readonly message: string };

/** Preventistas are a bounded lookup used only to populate the filter. */
const LOOKUP_SIZE = 100;
/** Window used when the URL carries no range. */
const DEFAULT_RANGE_DAYS = 30;

@Component({
  selector: 'app-preventa-report',
  imports: [
    CurrencyPipe,
    DecimalPipe,
    PercentPipe,
    FormsModule,
    RouterLink,
    ButtonModule,
    DatePickerModule,
    DateRangePresets,
    SelectModule,
    SkeletonModule,
    TableModule,
  ],
  templateUrl: './preventa-report.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PreventaReport implements OnInit {
  private readonly reports = inject(ReportsPreventaDataClient);
  private readonly users = inject(UserDataClient);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly table = viewChild.required<Table>('preventistaTable');

  protected readonly rowsPerPageOptions = [5, 10, 20, 50];
  protected readonly skeletonRows = [0, 1, 2, 3];

  /**
   * The URL is the single source of truth for every filter: the controls only
   * navigate, and these computeds read the result back. Refresh, browser
   * back/forward and a shared link all behave identically.
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

  protected readonly preventistaFilter = computed(() =>
    parseUuid(this.params().get('takenById')),
  );

  /** Changes to these — and only these — trigger a refetch. */
  private readonly filterKey = computed(() =>
    JSON.stringify([this.range(), this.preventistaFilter()]),
  );

  private readonly preventistaNames = signal<ReadonlyMap<string, string>>(
    new Map(),
  );

  protected readonly preventistaFilterOptions = computed(() => [
    { label: 'Todos los preventistas', value: null as string | null },
    ...[...this.preventistaNames()].map(([id, name]) => ({
      label: name,
      value: id,
    })),
  ]);

  protected readonly summaryState = signal<SummaryState>({ status: 'loading' });

  protected readonly successSummary = computed(() => {
    const state = this.summaryState();
    return state.status === 'success' ? state.summary : null;
  });

  // Annotated explicitly: the fetcher reads back this.list.sortOrder(), which
  // would otherwise make the type circular.
  protected readonly list: LazyList<PreventistaOrdersRow> =
    new LazyList<PreventistaOrdersRow>(
      (page, pageSize) =>
        this.reports.byPreventista({
          page,
          pageSize,
          ...this.range(),
          takenById: this.preventistaFilter() ?? undefined,
          sortDir: this.list.sortOrder() ?? 'desc',
        }),
      'No se pudo cargar el detalle por preventista.',
    );

  constructor() {
    // Skips its own first run: the table fetches on its own init and the
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
      this.table().reset();
    });
  }

  ngOnInit(): void {
    void this.loadPreventistas();
    void this.loadSummary();
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

  protected onPreventistaFilterChange(takenById: string | null): void {
    this.patchParams({ takenById });
  }

  protected refreshAll(): void {
    void this.loadSummary();
    this.table().reset();
  }

  /**
   * Share of orders that settled the right way. Null while nothing has
   * settled — shown as a dash rather than as 0%, which would read as failure.
   */
  protected conversionOf(row: PreventistaOrdersRow): number | null {
    return row.conversionRate;
  }

  private range(): { dateFrom: string; dateTo: string } {
    const [from, to] = this.dateRange() ?? [];
    return {
      dateFrom: from ? formatDay(from) : '',
      dateTo: to ? formatDay(to) : '',
    };
  }

  private async loadSummary(): Promise<void> {
    this.summaryState.set({ status: 'loading' });
    try {
      const summary = await firstValueFrom(
        this.reports.summary({
          ...this.range(),
          takenById: this.preventistaFilter() ?? undefined,
        }),
      );
      this.summaryState.set({ status: 'success', summary });
    } catch (error) {
      this.summaryState.set({
        status: 'error',
        message: toMessage(error, 'No se pudo cargar el resumen de preventa.'),
      });
    }
  }

  private async loadPreventistas(): Promise<void> {
    try {
      const users = await firstValueFrom(
        this.users.list({ role: 'PREVENTISTA', pageSize: LOOKUP_SIZE }),
      );
      this.preventistaNames.set(
        new Map(users.items.map((user) => [user.id, user.fullName])),
      );
    } catch {
      // The filter degrades to "everyone" if the lookup fails.
    }
  }

  /** Merges into the existing query params, dropping the ones set to null. */
  private patchParams(patch: Params): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: patch,
      queryParamsHandling: 'merge',
    });
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
