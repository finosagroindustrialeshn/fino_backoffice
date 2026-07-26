import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Params, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { Table, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

import { fetchAllPages } from '../../../../core/http/fetch-all-pages';
import { LazyList } from '../../../../core/http/lazy-list';
import { DateRangePresets } from '../../../../shared/components/date-range-presets/date-range-presets';
import { formatDay, lastNDays, type DateRange } from '../../../../shared/utils/date-range';
import {
  columnLetter,
  exportToExcel,
  type ExcelCellSpec,
  type ExcelSheetSpec,
} from '../../../../shared/utils/excel-export';
import { UserDataClient } from '../../../users/services/user-data';
import {
  CASH_LINE_KIND_LABELS,
  CASH_LINE_STATUS_LABELS,
  type CashLineKind,
  type CashLineStatus,
  type CashSessionRow,
  type DailyCashRow,
} from '../../models/cash-report.model';
import { ReportsCashDataClient } from '../../services/reports-cash-data';
import { validateCashRange } from '../../utils/date-range';
import { parseRange } from '../../../../shared/utils/query-params';

/** Owners are a bounded lookup used to name the arqueo lines. */
const LOOKUP_SIZE = 100;
/** Window used when the URL carries no range — well inside the 92-day cap. */
const DEFAULT_RANGE_DAYS = 30;
/** Max page size the API allows — used to page through export data in as few round-trips as possible. */
const EXPORT_PAGE_SIZE = 100;

@Component({
  selector: 'app-cash-report',
  imports: [
    CurrencyPipe,
    DatePipe,
    DecimalPipe,
    FormsModule,
    ButtonModule,
    DatePickerModule,
    DateRangePresets,
    TableModule,
    TagModule,
  ],
  templateUrl: './cash-report.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CashReport {
  private readonly reports = inject(ReportsCashDataClient);
  private readonly users = inject(UserDataClient);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly dailyTable = viewChild<Table>('dailyTable');
  private readonly sessionsTable = viewChild<Table>('sessionsTable');

  protected readonly rowsPerPageOptions = [5, 10, 20, 50];

  /** The URL is the single source of truth for the range. */
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

  /**
   * Both cash endpoints require both bounds and reject spans over 92 days.
   * Validating here turns a 400 round-trip into an inline message, and the
   * tables stay unrendered (so they never fire a request) while it is set.
   */
  protected readonly rangeError = computed(() =>
    validateCashRange(this.dateRange()),
  );

  private readonly ownerNames = signal<ReadonlyMap<string, string>>(new Map());
  protected readonly exporting = signal(false);
  protected readonly exportError = signal<string | null>(null);

  protected readonly dailyList = new LazyList<DailyCashRow>(
    (page, pageSize) => this.reports.daily({ page, pageSize, ...this.range() }),
    'No se pudo cargar el cierre diario.',
  );

  protected readonly sessionsList = new LazyList<CashSessionRow>(
    (page, pageSize) =>
      this.reports.sessions({ page, pageSize, ...this.range() }),
    'No se pudieron cargar los arqueos.',
  );

  constructor() {
    void this.loadOwners();

    // Skips its own first run — the tables fetch on their own init. After
    // that, every URL change refetches through this one path.
    //
    // `wasValid` guards the remount case: when the range goes invalid the
    // tables unmount, and when it becomes valid again they mount and fetch
    // on their own. Resetting them there would fire a second request for the
    // same page, so only a valid → valid transition resets.
    let isFirstRun = true;
    let wasValid = !this.rangeError();
    effect(() => {
      const isValid = !validateCashRange(this.dateRange());
      if (isFirstRun) {
        isFirstRun = false;
        return;
      }
      if (isValid && wasValid) {
        this.dailyTable()?.reset();
        this.sessionsTable()?.reset();
      }
      wasValid = isValid;
    });
  }

  /**
   * The tables only render while `rangeError()` is null, so both bounds are
   * set by the time a fetch runs. The throw is the backstop: LazyList catches
   * it and surfaces the message instead of calling the API without a range.
   */
  private range(): { dateFrom: string; dateTo: string } {
    const [from, to] = this.dateRange() ?? [];
    if (!from || !to) {
      throw new Error(
        this.rangeError() ?? 'Seleccioná un rango de fechas válido.',
      );
    }
    return { dateFrom: formatDay(from), dateTo: formatDay(to) };
  }

  protected onDateRangeChange(range: Date[] | null): void {
    this.patchParams({
      dateFrom: range?.[0] ? formatDay(range[0]) : null,
      dateTo: range?.[1] ? formatDay(range[1]) : null,
    });
  }

  /**
   * Exports the full report — not just the current page of either table —
   * as a 2-sheet workbook (Cierre diario, Arqueo). The module that writes
   * the .xlsx has no calculation logic of its own, so every number here is
   * already final by the time it's handed off.
   */
  protected async exportReport(): Promise<void> {
    this.exporting.set(true);
    this.exportError.set(null);
    try {
      const [daily, sessions] = await Promise.all([
        fetchAllPages(
          (page, pageSize) => this.reports.daily({ page, pageSize, ...this.range() }),
          EXPORT_PAGE_SIZE,
        ),
        fetchAllPages(
          (page, pageSize) => this.reports.sessions({ page, pageSize, ...this.range() }),
          EXPORT_PAGE_SIZE,
        ),
      ]);

      await exportToExcel({
        fileName: `reporte-caja-${formatDay(new Date())}`,
        sheets: [this.buildDailySheet(daily), this.buildSessionsSheet(sessions)],
      });
    } catch (error) {
      this.exportError.set(toMessage(error, 'No se pudo generar el reporte.'));
    } finally {
      this.exporting.set(false);
    }
  }

  private buildDailySheet(rows: readonly DailyCashRow[]): ExcelSheetSpec {
    const money = '"L "#,##0.00';
    const headers = [
      'Día',
      'Jornadas',
      'Cajas',
      'Fondo inicial',
      'Cobrado',
      'Gastos',
      'Esperado',
      'Contado',
      'Diferencia',
    ];
    const cells: ExcelCellSpec[] = headers.map((label, index) => ({
      ref: `${columnLetter(index)}1`,
      value: label,
      bold: true,
    }));

    rows.forEach((row, index) => {
      const r = index + 2;
      cells.push(
        { ref: `A${r}`, value: row.date },
        { ref: `B${r}`, value: row.shiftsCount, align: 'right' },
        { ref: `C${r}`, value: row.sessionsCount, align: 'right' },
        { ref: `D${r}`, value: row.openingFloat, numberFormat: money, align: 'right' },
        { ref: `E${r}`, value: row.cashCollected, numberFormat: money, align: 'right' },
        { ref: `F${r}`, value: row.expenses, numberFormat: money, align: 'right' },
        { ref: `G${r}`, value: row.expectedCash, numberFormat: money, align: 'right' },
        { ref: `H${r}`, value: row.closingCounted, numberFormat: money, align: 'right' },
        {
          ref: `I${r}`,
          value: row.difference,
          numberFormat: row.difference === null ? undefined : money,
          align: 'right',
        },
      );
    });

    return {
      name: 'Cierre diario',
      cells,
      columnWidths: { A: 14, B: 10, C: 10, D: 14, E: 14, F: 14, G: 14, H: 14, I: 14 },
    };
  }

  private buildSessionsSheet(rows: readonly CashSessionRow[]): ExcelSheetSpec {
    const money = '"L "#,##0.00';
    const dateTime = 'dd/mm/yyyy hh:mm';
    const headers = [
      'Tipo',
      'Responsable',
      'Estado',
      'Apertura',
      'Cierre',
      'Fondo',
      'Cobrado',
      'Gastos',
      'Esperado',
      'Contado',
      'Diferencia',
    ];
    const cells: ExcelCellSpec[] = headers.map((label, index) => ({
      ref: `${columnLetter(index)}1`,
      value: label,
      bold: true,
    }));

    rows.forEach((row, index) => {
      const r = index + 2;
      cells.push(
        { ref: `A${r}`, value: this.kindLabel(row.kind) },
        { ref: `B${r}`, value: this.ownerName(row.ownerId) },
        { ref: `C${r}`, value: this.statusLabel(row.status) },
        { ref: `D${r}`, value: new Date(row.openedAt), numberFormat: dateTime },
        {
          ref: `E${r}`,
          value: row.closedAt ? new Date(row.closedAt) : null,
          numberFormat: row.closedAt ? dateTime : undefined,
        },
        { ref: `F${r}`, value: row.openingCash, numberFormat: money, align: 'right' },
        { ref: `G${r}`, value: row.cashCollected, numberFormat: money, align: 'right' },
        { ref: `H${r}`, value: row.expenses, numberFormat: money, align: 'right' },
        { ref: `I${r}`, value: row.expectedCash, numberFormat: money, align: 'right' },
        {
          ref: `J${r}`,
          value: row.closingCash,
          numberFormat: row.closingCash === null ? undefined : money,
          align: 'right',
        },
        {
          ref: `K${r}`,
          value: row.difference,
          numberFormat: row.difference === null ? undefined : money,
          align: 'right',
        },
      );
    });

    return {
      name: 'Arqueo',
      cells,
      columnWidths: {
        A: 10,
        B: 20,
        C: 10,
        D: 16,
        E: 16,
        F: 12,
        G: 12,
        H: 12,
        I: 12,
        J: 12,
        K: 12,
      },
    };
  }

  protected kindLabel(kind: CashLineKind): string {
    return CASH_LINE_KIND_LABELS[kind];
  }

  protected statusLabel(status: CashLineStatus): string {
    return CASH_LINE_STATUS_LABELS[status];
  }

  protected statusSeverity(status: CashLineStatus): 'success' | 'warn' {
    return status === 'CLOSED' ? 'success' : 'warn';
  }

  /** Green when the arqueo squares, red on any shortfall or surplus. */
  protected differenceSeverity(
    difference: number | null,
  ): 'success' | 'danger' | 'secondary' {
    if (difference === null) {
      return 'secondary';
    }
    return difference === 0 ? 'success' : 'danger';
  }

  protected ownerName(ownerId: string): string {
    return this.ownerNames().get(ownerId) ?? ownerId;
  }

  /** Merges into the current query params; a null value drops the param. */
  private patchParams(patch: Params): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: patch,
      queryParamsHandling: 'merge',
    });
  }

  private async loadOwners(): Promise<void> {
    try {
      const users = await firstValueFrom(
        this.users.list({ pageSize: LOOKUP_SIZE }),
      );
      this.ownerNames.set(
        new Map(users.items.map((user) => [user.id, user.fullName])),
      );
    } catch {
      // Lines fall back to the raw owner id if the lookup fails.
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
