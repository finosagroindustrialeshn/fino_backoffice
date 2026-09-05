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
import { ExpenseCategoryDataClient } from '../../../catalogs/expense-categories/services/expense-category-data';
import { UserDataClient } from '../../../users/services/user-data';
import type { Expense } from '../../models/expense.model';
import { ExpenseDataClient } from '../../services/expense-data';

/** Users and expense categories are bounded lookups joined to the page. */
const LOOKUP_SIZE = 100;

@Component({
  selector: 'app-expense-list',
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
  ],
  templateUrl: './expense-list.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExpenseList implements OnInit {
  private readonly expenses = inject(ExpenseDataClient);
  private readonly users = inject(UserDataClient);
  private readonly categories = inject(ExpenseCategoryDataClient);
  private readonly auth = inject(AuthSession);
  private readonly table = viewChild.required<Table>('dt');

  protected readonly rowsPerPageOptions = [5, 10, 20, 50];

  /** A SELLER only ever sees their own expenses, so the seller filter is noise. */
  protected readonly canFilterBySeller = computed(() => {
    const role = this.auth.role();
    return role === 'ADMIN' || role === 'SUPERVISOR' || role === 'ACCOUNTANT';
  });

  protected readonly sellerFilter = signal<string | null>(null);
  protected readonly categoryFilter = signal<string | null>(null);
  /** [start, end] from the range datepicker; either end may be null mid-select. */
  protected readonly dateRange = signal<Date[] | null>(null);

  /**
   * Lookups feed the filter dropdowns ONLY — every row names its own seller
   * and category, so nothing on screen depends on these resolving.
   */
  private readonly userNames = signal<ReadonlyMap<string, string>>(new Map());
  private readonly categoryNames = signal<ReadonlyMap<string, string>>(
    new Map(),
  );

  protected readonly sellerFilterOptions = computed(() => [
    { label: 'Todos los vendedores', value: null as string | null },
    ...[...this.userNames()].map(([id, name]) => ({ label: name, value: id })),
  ]);

  protected readonly categoryFilterOptions = computed(() => [
    { label: 'Todas las categorías', value: null as string | null },
    ...[...this.categoryNames()].map(([id, name]) => ({
      label: name,
      value: id,
    })),
  ]);

  protected readonly list = new LazyList<Expense>((page, pageSize) => {
    const range = this.dateRange();
    return this.expenses.list({
      page,
      pageSize,
      sellerId: this.sellerFilter() ?? undefined,
      categoryId: this.categoryFilter() ?? undefined,
      dateFrom: range?.[0] ? formatDay(range[0]) : undefined,
      dateTo: range?.[1] ? formatDay(range[1]) : undefined,
    });
  }, 'No se pudieron cargar los gastos.');

  /**
   * Total for the rows on screen, NOT for the whole filtered set — the list
   * endpoint paginates and reports no aggregate. The template labels it as
   * such so it is never mistaken for the period's total spend.
   */
  protected readonly pageTotal = computed(() =>
    this.list.items().reduce((sum, expense) => sum + Number(expense.amount), 0),
  );

  protected readonly exporting = signal(false);
  protected readonly exportError = signal<string | null>(null);
  /** Set when the export hit the row ceiling, so the user knows it is partial. */
  protected readonly exportNotice = signal<string | null>(null);

  ngOnInit(): void {
    void this.loadLookups();
  }

  /** Exports every expense matching the current filters, not the page on screen. */
  protected async exportExpenses(): Promise<void> {
    this.exporting.set(true);
    this.exportError.set(null);
    this.exportNotice.set(null);
    try {
      const range = this.dateRange();
      const expenses = await fetchAllPages((page, pageSize) =>
        this.expenses.list({
          page,
          pageSize,
          sellerId: this.sellerFilter() ?? undefined,
          categoryId: this.categoryFilter() ?? undefined,
          dateFrom: range?.[0] ? formatDay(range[0]) : undefined,
          dateTo: range?.[1] ? formatDay(range[1]) : undefined,
        }),
      );

      const columns: readonly ExcelColumn<Expense>[] = [
        {
          header: 'Fecha',
          value: (expense) => new Date(expense.createdAt),
          numberFormat: EXCEL_DATETIME_FORMAT,
          width: 18,
        },
        { header: 'Vendedor', value: (expense) => expense.sellerName, width: 24 },
        { header: 'Categoría', value: (expense) => expense.categoryName, width: 24 },
        { header: 'Descripción', value: (expense) => expense.description, width: 36 },
        {
          header: 'Monto',
          value: (expense) => Number(expense.amount),
          numberFormat: EXCEL_MONEY_FORMAT,
          align: 'right',
          width: 16,
        },
        // Carried so a spreadsheet can be cross-referenced against Jornadas.
        { header: 'Jornada', value: (expense) => expense.shiftId, width: 38 },
      ];

      await exportToExcel({
        fileName: `gastos-${formatDay(new Date())}`,
        sheets: [buildTableSheet('Gastos', columns, expenses.rows)],
      });

      if (expenses.truncated) {
        this.exportNotice.set(
          `El archivo incluye los primeros ${expenses.rows.length} de ${expenses.total} gastos. Acotá el rango de fechas para exportarlos todos.`,
        );
      }
    } catch (error) {
      this.exportError.set(toMessage(error, 'No se pudo generar el archivo.'));
    } finally {
      this.exporting.set(false);
    }
  }

  protected onSellerFilterChange(sellerId: string | null): void {
    this.sellerFilter.set(sellerId);
    // reset() jumps to page 1 and re-fires onLazyLoad with the new filter.
    this.table().reset();
  }

  protected onCategoryFilterChange(categoryId: string | null): void {
    this.categoryFilter.set(categoryId);
    this.table().reset();
  }

  protected onDateRangeChange(range: Date[] | null): void {
    this.dateRange.set(range);
    // Refetch once the range is complete (both ends) or cleared.
    if (!range || range.length === 0 || (range[0] && range[1])) {
      this.table().reset();
    }
  }

  private async loadLookups(): Promise<void> {
    try {
      // Inactive categories are included: an old expense still points at the
      // category it was filed under, even after it was retired.
      const [users, categories] = await Promise.all([
        firstValueFrom(this.users.list({ pageSize: LOOKUP_SIZE })),
        firstValueFrom(
          this.categories.list({
            pageSize: LOOKUP_SIZE,
            includeInactive: true,
          }),
        ),
      ]);
      this.userNames.set(
        new Map(users.items.map((user) => [user.id, user.fullName])),
      );
      this.categoryNames.set(
        new Map(categories.items.map((category) => [category.id, category.name])),
      );
    } catch {
      // Only the filter dropdowns degrade — the rows name themselves.
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
