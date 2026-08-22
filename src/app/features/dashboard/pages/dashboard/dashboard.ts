import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { CurrencyPipe, DecimalPipe, PercentPipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Params, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { ChartModule } from 'primeng/chart';
import { DatePickerModule } from 'primeng/datepicker';
import { SkeletonModule } from 'primeng/skeleton';
import { TagModule } from 'primeng/tag';

import { DateRangePresets } from '../../../../shared/components/date-range-presets/date-range-presets';
import { formatDay, lastNDays, type DateRange } from '../../../../shared/utils/date-range';
import { parseRange } from '../../../../shared/utils/query-params';
import {
  agingRangeLabel,
  agingSeverity,
  type AgingSeverity,
  type DashboardSummary,
} from '../../models/dashboard.model';
import { DashboardDataClient } from '../../services/dashboard-data';

/** Matches the bg-{color}-600/500 Tailwind classes accounts-receivable already uses for the same severities. */
const AGING_SEVERITY_COLORS: Record<AgingSeverity, string> = {
  current: '#16a34a',
  due: '#f59e0b',
  overdue: '#ea580c',
  critical: '#dc2626',
};

interface StatTile {
  readonly label: string;
  readonly value: number;
  readonly caption: string;
  readonly format: 'money' | 'count' | 'percent' | 'hours';
}

type SummaryState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly summary: DashboardSummary }
  | { readonly status: 'error'; readonly message: string };

/** Window used when the URL carries no range — matches the endpoint's own default of "today". */
const DEFAULT_RANGE_DAYS = 1;

@Component({
  selector: 'app-dashboard',
  imports: [
    CurrencyPipe,
    DecimalPipe,
    PercentPipe,
    FormsModule,
    RouterLink,
    ButtonModule,
    ChartModule,
    DatePickerModule,
    DateRangePresets,
    SkeletonModule,
    TagModule,
  ],
  templateUrl: './dashboard.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dashboard implements OnInit {
  private readonly dashboard = inject(DashboardDataClient);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly skeletonCards = [0, 1, 2, 3];

  /** The URL is the single source of truth for the range, same pattern as the report pages. */
  private readonly params = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  protected readonly dateRange = computed<DateRange>(() => {
    const params = this.params();
    return (
      parseRange(params.get('dateFrom'), params.get('dateTo')) ??
      lastNDays(DEFAULT_RANGE_DAYS, new Date())
    );
  });

  protected readonly summaryState = signal<SummaryState>({ status: 'loading' });

  protected readonly salesTiles = computed<readonly StatTile[]>(() => {
    const sales = this.successSummary()?.sales;
    if (!sales) {
      return [];
    }
    return [
      {
        label: 'Total vendido',
        value: sales.totalAmount,
        caption: `${sales.saleCount} ventas`,
        format: 'money',
      },
      {
        label: 'Ticket promedio',
        value: sales.averageTicket,
        caption: 'Por venta en el rango',
        format: 'money',
      },
      {
        label: 'Cobrado',
        value: sales.totalCollected,
        caption: `${this.share(sales.totalCollected, sales.totalAmount)}% del total`,
        format: 'money',
      },
      {
        label: 'Por cobrar',
        value: sales.totalOutstanding,
        caption: 'Saldo pendiente de crédito',
        format: 'money',
      },
    ];
  });

  protected readonly cashTiles = computed<readonly StatTile[]>(() => {
    const cash = this.successSummary()?.cash;
    if (!cash) {
      return [];
    }
    return [
      {
        label: 'Cobrado',
        value: cash.cashCollected,
        caption: `${cash.shiftsCount + cash.sessionsCount} jornadas/cajas`,
        format: 'money',
      },
      {
        label: 'Esperado',
        value: cash.expectedCash,
        caption: 'Fondo + cobrado − gastos',
        format: 'money',
      },
      { label: 'Contado', value: cash.closingCounted, caption: 'Al cierre', format: 'money' },
    ];
  });

  protected readonly receivablesTiles = computed<readonly StatTile[]>(() => {
    const receivables = this.successSummary()?.receivables;
    if (!receivables) {
      return [];
    }
    return [
      {
        label: 'Total por cobrar',
        value: receivables.totalOutstanding,
        caption: 'Saldo abierto de toda la cartera',
        format: 'money',
      },
      {
        label: 'Clientes deudores',
        value: receivables.debtorClients,
        caption: 'Con saldo pendiente',
        format: 'count',
      },
      {
        label: 'Ventas abiertas',
        value: receivables.openSalesCount,
        caption: 'Créditos que aún cargan saldo',
        format: 'count',
      },
    ];
  });

  /**
   * Preventa over the range. `unassigned` and `overdue` are NOT here: they
   * are a live queue rather than a measurement of the period, so they get
   * their own actionable block instead of sitting next to range-scoped stats.
   */
  protected readonly preventaTiles = computed<readonly StatTile[]>(() => {
    const preventa = this.successSummary()?.preventa;
    if (!preventa) {
      return [];
    }
    return [
      {
        label: 'Pedidos tomados',
        value: preventa.ordersTaken,
        caption: 'En el rango elegido',
        format: 'count',
      },
      {
        label: 'Entregados',
        value: preventa.converted,
        caption: `${preventa.cancelled} cancelados`,
        format: 'count',
      },
      {
        // Divides by SETTLED orders, so an order taken this morning and still
        // open is not counted as a failure.
        label: 'Conversión',
        value: preventa.conversionRate ?? 0,
        caption:
          preventa.conversionRate === null
            ? 'Todavía no se resolvió ningún pedido'
            : 'Entregados sobre pedidos resueltos',
        format: 'percent',
      },
      {
        label: 'Valor en cola',
        value: preventa.estimatedValueOpen,
        caption: `${preventa.open} pedidos abiertos`,
        format: 'money',
      },
      {
        label: 'Tiempo a entrega',
        value: preventa.avgHoursToConvert ?? 0,
        caption:
          preventa.avgHoursToConvert === null
            ? 'Sin entregas en el rango'
            : 'Promedio desde que se tomó el pedido',
        format: 'hours',
      },
    ];
  });

  /** The live queue: promises nobody is working right now. */
  protected readonly preventaQueue = computed(
    () => this.successSummary()?.preventa ?? null,
  );

  /** Contado vs. crédito split of the range's sales, in brand colors. */
  protected readonly channelChartData = computed(() => {
    const sales = this.successSummary()?.sales;
    if (!sales || sales.totalAmount <= 0) {
      return null;
    }
    return {
      labels: ['Contado', 'Crédito'],
      datasets: [
        {
          data: [sales.cash.amount, sales.credit.amount],
          backgroundColor: ['#2d5e3a', '#d9a441'],
          hoverBackgroundColor: ['#22462d', '#c2903a'],
        },
      ],
    };
  });

  protected readonly channelChartOptions = {
    cutout: '65%',
    plugins: { legend: { position: 'bottom' } },
  };

  /** Outstanding balance by aging band, colored by the same severity scale as the stat tiles. */
  protected readonly agingChartData = computed(() => {
    const buckets = this.successSummary()?.receivables.buckets;
    if (!buckets || buckets.length === 0) {
      return null;
    }
    return {
      labels: buckets.map((bucket) => agingRangeLabel(bucket)),
      datasets: [
        {
          label: 'Saldo',
          data: buckets.map((bucket) => bucket.total),
          backgroundColor: buckets.map(
            (bucket) => AGING_SEVERITY_COLORS[agingSeverity(bucket)],
          ),
        },
      ],
    };
  });

  protected readonly agingChartOptions = {
    indexAxis: 'y' as const,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
  };

  constructor() {
    // Skips its own first run — ngOnInit already fetches once. From then on
    // every URL change (a control, a paste, browser back) refetches.
    let isFirstRun = true;
    effect(() => {
      this.dateRange();
      if (isFirstRun) {
        isFirstRun = false;
        return;
      }
      void this.loadSummary();
    });
  }

  ngOnInit(): void {
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

  protected refreshAll(): void {
    void this.loadSummary();
  }

  protected async loadSummary(): Promise<void> {
    this.summaryState.set({ status: 'loading' });
    try {
      const [from, to] = this.dateRange() ?? [];
      const summary = await firstValueFrom(
        this.dashboard.summary({
          dateFrom: from ? formatDay(from) : undefined,
          dateTo: to ? formatDay(to) : undefined,
        }),
      );
      this.summaryState.set({ status: 'success', summary });
    } catch (error) {
      this.summaryState.set({
        status: 'error',
        message: toMessage(error, 'No se pudo cargar el resumen ejecutivo.'),
      });
    }
  }

  /** Green when the day's arqueo squares, red on any shortfall/surplus, gray while anything is still open. */
  protected differenceSeverity(
    difference: number | null,
  ): 'success' | 'danger' | 'secondary' {
    if (difference === null) {
      return 'secondary';
    }
    return difference === 0 ? 'success' : 'danger';
  }

  /** Share of the total, as a 0-100 percentage. Guards the zero-amount case. */
  protected share(amount: number, total: number): number {
    return total > 0 ? Math.round((amount / total) * 100) : 0;
  }

  private successSummary(): DashboardSummary | null {
    const state = this.summaryState();
    return state.status === 'success' ? state.summary : null;
  }

  /** Merges into the current query params; a null value drops the param. */
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
