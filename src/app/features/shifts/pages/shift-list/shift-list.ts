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
import { fetchAllPages } from '../../../../core/http/fetch-all-pages';
import { LazyList } from '../../../../core/http/lazy-list';
import { DateRangePresets } from '../../../../shared/components/date-range-presets/date-range-presets';
import { formatDay } from '../../../../shared/utils/date-range';
import {
  buildTableSheet,
  exportToExcel,
  EXCEL_DATETIME_FORMAT,
  EXCEL_MONEY_FORMAT,
  type ExcelColumn,
} from '../../../../shared/utils/excel-export';
import { UserDataClient } from '../../../users/services/user-data';
import {
  routeLabel,
  SHIFT_STATUS_LABELS,
  SHIFT_STATUS_SEVERITY,
  type Shift,
  type ShiftStatus,
  type ShiftTagSeverity,
} from '../../models/shift.model';
import { ShiftDataClient } from '../../services/shift-data';

interface FilterOption<T> {
  readonly label: string;
  readonly value: T | null;
}

/**
 * Users are a bounded lookup feeding the seller filter, and naming whoever
 * CLOSED a shift in the export — the only party the row does not name itself.
 */
const LOOKUP_SIZE = 100;

@Component({
  selector: 'app-shift-list',
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
  templateUrl: './shift-list.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShiftList implements OnInit {
  private readonly shifts = inject(ShiftDataClient);
  private readonly users = inject(UserDataClient);
  private readonly auth = inject(AuthSession);
  private readonly table = viewChild.required<Table>('dt');

  protected readonly rowsPerPageOptions = [5, 10, 20, 50];

  /** A SELLER only ever sees their own shifts, so the seller filter is noise. */
  protected readonly canFilterBySeller = computed(() => {
    const role = this.auth.role();
    return role === 'ADMIN' || role === 'SUPERVISOR' || role === 'ACCOUNTANT';
  });

  protected readonly statusOptions: FilterOption<ShiftStatus>[] = [
    { label: 'Todos los estados', value: null },
    ...(Object.keys(SHIFT_STATUS_LABELS) as ShiftStatus[]).map((value) => ({
      label: SHIFT_STATUS_LABELS[value],
      value,
    })),
  ];

  protected readonly statusFilter = signal<ShiftStatus | null>(null);
  protected readonly sellerFilter = signal<string | null>(null);
  /** [start, end] from the range datepicker; either end may be null mid-select. */
  protected readonly dateRange = signal<Date[] | null>(null);

  private readonly userNames = signal<ReadonlyMap<string, string>>(new Map());

  protected readonly routeLabel = routeLabel;

  protected readonly sellerFilterOptions = computed(() => [
    { label: 'Todos los vendedores', value: null as string | null },
    ...[...this.userNames()].map(([id, name]) => ({ label: name, value: id })),
  ]);

  protected readonly list = new LazyList<Shift>((page, pageSize) => {
    const range = this.dateRange();
    return this.shifts.list({
      page,
      pageSize,
      status: this.statusFilter() ?? undefined,
      sellerId: this.sellerFilter() ?? undefined,
      dateFrom: range?.[0] ? formatDay(range[0]) : undefined,
      dateTo: range?.[1] ? formatDay(range[1]) : undefined,
    });
  }, 'No se pudieron cargar las jornadas.');

  protected readonly exporting = signal(false);
  protected readonly exportError = signal<string | null>(null);
  /** Set when the export hit the row ceiling, so the user knows it is partial. */
  protected readonly exportNotice = signal<string | null>(null);

  ngOnInit(): void {
    void this.loadLookups();
  }

  /**
   * Exports every shift matching the current filters, not the page on screen.
   *
   * Carries what the list endpoint guarantees. The over/short figure lives in
   * the liquidation summary, which only `GET /shifts/{id}` documents — pulling
   * it here would mean one request per row, so it stays out until the API
   * exposes it on the list.
   */
  protected async exportShifts(): Promise<void> {
    this.exporting.set(true);
    this.exportError.set(null);
    this.exportNotice.set(null);
    try {
      const range = this.dateRange();
      const [shifts, users] = await Promise.all([
        fetchAllPages((page, pageSize) =>
          this.shifts.list({
            page,
            pageSize,
            status: this.statusFilter() ?? undefined,
            sellerId: this.sellerFilter() ?? undefined,
            dateFrom: range?.[0] ? formatDay(range[0]) : undefined,
            dateTo: range?.[1] ? formatDay(range[1]) : undefined,
          }),
        ),
        fetchAllPages((page, pageSize) => this.users.list({ page, pageSize })),
      ]);

      const userNames = new Map(users.rows.map((user) => [user.id, user.fullName]));
      // Only `closedById` still needs resolving — every row names its own
      // seller. Falls back to the id so an unresolved name stays traceable.
      const nameOf = (id: string): string => userNames.get(id) ?? id;

      const columns: readonly ExcelColumn<Shift>[] = [
        {
          header: 'Apertura',
          value: (shift) => new Date(shift.openedAt),
          numberFormat: EXCEL_DATETIME_FORMAT,
          width: 18,
        },
        {
          header: 'Cierre',
          value: (shift) => (shift.closedAt ? new Date(shift.closedAt) : null),
          numberFormat: EXCEL_DATETIME_FORMAT,
          width: 18,
        },
        { header: 'Vendedor', value: (shift) => shift.sellerName, width: 24 },
        { header: 'Ruta', value: (shift) => routeLabel(shift), width: 26 },
        {
          header: 'Estado',
          value: (shift) => SHIFT_STATUS_LABELS[shift.status],
          width: 12,
        },
        {
          header: 'Fondo inicial',
          value: (shift) => Number(shift.openingCash),
          numberFormat: EXCEL_MONEY_FORMAT,
          align: 'right',
          width: 16,
        },
        {
          header: 'Efectivo entregado',
          // Left blank rather than zeroed while open: nothing was counted yet,
          // and a 0 would average into the analysis as if it had been.
          value: (shift) =>
            shift.closingCash === null ? null : Number(shift.closingCash),
          numberFormat: EXCEL_MONEY_FORMAT,
          align: 'right',
          width: 18,
        },
        {
          header: 'Cerrada por',
          value: (shift) => (shift.closedById ? nameOf(shift.closedById) : null),
          width: 24,
        },
        { header: 'Notas', value: (shift) => shift.notes, width: 36 },
      ];

      await exportToExcel({
        fileName: `jornadas-${formatDay(new Date())}`,
        sheets: [buildTableSheet('Jornadas', columns, shifts.rows)],
      });

      if (shifts.truncated) {
        this.exportNotice.set(
          `El archivo incluye las primeras ${shifts.rows.length} de ${shifts.total} jornadas. Acotá el rango de fechas para exportarlas todas.`,
        );
      }
    } catch (error) {
      this.exportError.set(toMessage(error, 'No se pudo generar el archivo.'));
    } finally {
      this.exporting.set(false);
    }
  }

  protected onStatusFilterChange(status: ShiftStatus | null): void {
    this.statusFilter.set(status);
    // reset() jumps to page 1 and re-fires onLazyLoad with the new filter.
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

  protected statusLabel(status: ShiftStatus): string {
    return SHIFT_STATUS_LABELS[status];
  }

  protected statusSeverity(status: ShiftStatus): ShiftTagSeverity {
    return SHIFT_STATUS_SEVERITY[status];
  }

  private async loadLookups(): Promise<void> {
    try {
      const users = await firstValueFrom(
        this.users.list({ pageSize: LOOKUP_SIZE }),
      );
      this.userNames.set(
        new Map(users.items.map((user) => [user.id, user.fullName])),
      );
    } catch {
      // Only the seller filter degrades — every row names its own seller.
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
