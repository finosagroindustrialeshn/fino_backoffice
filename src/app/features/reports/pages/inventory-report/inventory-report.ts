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
import { DatePipe, DecimalPipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Params, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { Table, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToggleSwitchModule } from 'primeng/toggleswitch';

import { fetchAllPages } from '../../../../core/http/fetch-all-pages';
import { LazyList } from '../../../../core/http/lazy-list';
import type { MovementType } from '../../../inventory/models/inventory.model';
import { ProductDataClient } from '../../../products/services/product-data';
import { UserDataClient } from '../../../users/services/user-data';
import type {
  KardexEntry,
  SellerStockRow,
  StockReportRow,
} from '../../models/inventory-report.model';
import { ReportsInventoryDataClient } from '../../services/reports-inventory-data';
import { formatDay, type DateRange } from '../../../../shared/utils/date-range';
import {
  columnLetter,
  exportToExcel,
  type ExcelCellSpec,
  type ExcelSheetSpec,
} from '../../../../shared/utils/excel-export';
import { parseBool, parseRange, parseUuid } from '../../../../shared/utils/query-params';

interface Option {
  readonly label: string;
  readonly value: string | null;
}

/** Products and sellers are bounded lookups for the filter dropdowns. */
const LOOKUP_SIZE = 100;
/** Threshold used by the low-stock view. */
const LOW_STOCK_THRESHOLD = 10;
/** Max page size the API allows — used to page through export data in as few round-trips as possible. */
const EXPORT_PAGE_SIZE = 100;

const MOVEMENT_LABELS: Record<MovementType, string> = {
  PURCHASE: 'Compra',
  RETURN_IN: 'Retorno',
  DISPATCH_OUT: 'Despacho',
  ADJUSTMENT: 'Ajuste',
};

@Component({
  selector: 'app-inventory-report',
  imports: [
    DatePipe,
    DecimalPipe,
    FormsModule,
    ButtonModule,
    DatePickerModule,
    SelectModule,
    TableModule,
    TagModule,
    ToggleSwitchModule,
  ],
  templateUrl: './inventory-report.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InventoryReport implements OnInit {
  private readonly reports = inject(ReportsInventoryDataClient);
  private readonly products = inject(ProductDataClient);
  private readonly users = inject(UserDataClient);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly stockTable = viewChild.required<Table>('stockTable');
  private readonly kardexTable = viewChild<Table>('kardexTable');
  private readonly sellerStockTable =
    viewChild.required<Table>('sellerStockTable');

  protected readonly rowsPerPageOptions = [5, 10, 20, 50];
  protected readonly lowStockThreshold = LOW_STOCK_THRESHOLD;

  /** The URL is the single source of truth for every filter on this screen. */
  private readonly params = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  // Warehouse stock
  protected readonly lowStockOnly = computed(() =>
    parseBool(this.params().get('lowStock')),
  );

  // Kardex — the endpoint requires a product, so nothing loads without one.
  protected readonly kardexProduct = computed(() =>
    parseUuid(this.params().get('productId')),
  );
  protected readonly kardexRange = computed<DateRange>(() =>
    parseRange(this.params().get('dateFrom'), this.params().get('dateTo')),
  );

  // Seller stock
  protected readonly sellerFilter = computed(() =>
    parseUuid(this.params().get('sellerId')),
  );

  protected readonly exporting = signal(false);
  protected readonly exportError = signal<string | null>(null);

  private readonly productOptions = signal<Option[]>([]);
  private readonly sellerNames = signal<ReadonlyMap<string, string>>(new Map());

  protected readonly productFilterOptions = computed(() =>
    this.productOptions(),
  );

  protected readonly sellerFilterOptions = computed<Option[]>(() => [
    { label: 'Todos los vendedores', value: null },
    ...[...this.sellerNames()].map(([id, name]) => ({ label: name, value: id })),
  ]);

  protected readonly stockList = new LazyList<StockReportRow>(
    (page, pageSize) =>
      this.reports.stock({
        page,
        pageSize,
        lowStockThreshold: this.lowStockOnly() ? LOW_STOCK_THRESHOLD : undefined,
      }),
    'No se pudo cargar el stock de bodega.',
  );

  protected readonly kardexList = new LazyList<KardexEntry>((page, pageSize) => {
    const productId = this.kardexProduct();
    if (!productId) {
      throw new Error('Elegí un producto para ver su kardex.');
    }
    const range = this.kardexRange();
    return this.reports.kardex({
      page,
      pageSize,
      productId,
      dateFrom: range?.[0] ? formatDay(range[0]) : undefined,
      dateTo: range?.[1] ? formatDay(range[1]) : undefined,
    });
  }, 'No se pudo cargar el kardex.');

  protected readonly sellerStockList = new LazyList<SellerStockRow>(
    (page, pageSize) =>
      this.reports.sellerStock({
        page,
        pageSize,
        sellerId: this.sellerFilter() ?? undefined,
      }),
    'No se pudo cargar el stock de vendedores.',
  );

  constructor() {
    // One watcher per table, so changing the kardex product does not refetch
    // warehouse stock, and vice versa.
    this.refetchOn(
      () => this.lowStockOnly(),
      () => this.stockTable().reset(),
    );
    // The kardex table is absent until a product is picked, and mounting it
    // already fetches. Only reset when it was mounted before too, otherwise
    // picking the first product would fire two requests for the same page.
    let hadProduct = this.kardexProduct() !== null;
    this.refetchOn(
      () => JSON.stringify([this.kardexProduct(), this.kardexRange()]),
      () => {
        const hasProduct = this.kardexProduct() !== null;
        if (hasProduct && hadProduct) {
          this.kardexTable()?.reset();
        }
        hadProduct = hasProduct;
      },
    );
    this.refetchOn(
      () => this.sellerFilter(),
      () => this.sellerStockTable().reset(),
    );
  }

  ngOnInit(): void {
    void this.loadLookups();
  }

  /**
   * Runs `action` whenever `source` changes, skipping the initial run — the
   * tables already fetch once on their own init.
   */
  private refetchOn(source: () => unknown, action: () => void): void {
    let isFirstRun = true;
    effect(() => {
      source();
      if (isFirstRun) {
        isFirstRun = false;
        return;
      }
      action();
    });
  }

  protected onLowStockChange(lowStockOnly: boolean): void {
    this.patchParams({ lowStock: lowStockOnly ? 'true' : null });
  }

  protected onKardexProductChange(productId: string | null): void {
    this.patchParams({ productId });
  }

  protected onKardexRangeChange(range: Date[] | null): void {
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

  /**
   * Exports the full report — not just the current page of any table — as a
   * multi-sheet workbook: warehouse stock and seller stock always, plus a
   * Kardex sheet only when a product is actually selected (the endpoint
   * requires one and the on-screen table stays empty without it too). The
   * module that writes the .xlsx has no calculation logic of its own, so
   * every number here is already final by the time it's handed off.
   */
  protected async exportReport(): Promise<void> {
    this.exporting.set(true);
    this.exportError.set(null);
    try {
      const productId = this.kardexProduct();
      const [stock, sellerStock, kardex] = await Promise.all([
        fetchAllPages(
          (page, pageSize) =>
            this.reports.stock({
              page,
              pageSize,
              lowStockThreshold: this.lowStockOnly() ? LOW_STOCK_THRESHOLD : undefined,
            }),
          EXPORT_PAGE_SIZE,
        ),
        fetchAllPages(
          (page, pageSize) =>
            this.reports.sellerStock({
              page,
              pageSize,
              sellerId: this.sellerFilter() ?? undefined,
            }),
          EXPORT_PAGE_SIZE,
        ),
        productId ? this.fetchAllKardex(productId) : Promise.resolve(null),
      ]);

      const sheets: ExcelSheetSpec[] = [
        this.buildStockSheet(stock),
        this.buildSellerStockSheet(sellerStock),
      ];
      if (kardex) {
        sheets.splice(1, 0, this.buildKardexSheet(kardex, productId!));
      }

      await exportToExcel({
        fileName: `reporte-inventario-${formatDay(new Date())}`,
        sheets,
      });
    } catch (error) {
      this.exportError.set(toMessage(error, 'No se pudo generar el reporte.'));
    } finally {
      this.exporting.set(false);
    }
  }

  private fetchAllKardex(productId: string): Promise<readonly KardexEntry[]> {
    const range = this.kardexRange();
    return fetchAllPages(
      (page, pageSize) =>
        this.reports.kardex({
          page,
          pageSize,
          productId,
          dateFrom: range?.[0] ? formatDay(range[0]) : undefined,
          dateTo: range?.[1] ? formatDay(range[1]) : undefined,
        }),
      EXPORT_PAGE_SIZE,
    );
  }

  private buildStockSheet(rows: readonly StockReportRow[]): ExcelSheetSpec {
    const headers = ['SKU', 'Producto', 'Disponible', 'Comprometido', 'Total'];
    const cells: ExcelCellSpec[] = headers.map((label, index) => ({
      ref: `${columnLetter(index)}1`,
      value: label,
      bold: true,
    }));
    rows.forEach((row, index) => {
      const r = index + 2;
      cells.push(
        { ref: `A${r}`, value: row.sku },
        { ref: `B${r}`, value: row.name },
        { ref: `C${r}`, value: row.available, align: 'right' },
        { ref: `D${r}`, value: row.committed, align: 'right' },
        { ref: `E${r}`, value: row.total, align: 'right' },
      );
    });
    return {
      name: 'Stock de bodega',
      cells,
      columnWidths: { A: 16, B: 32, C: 14, D: 14, E: 12 },
    };
  }

  private buildKardexSheet(
    rows: readonly KardexEntry[],
    productId: string,
  ): ExcelSheetSpec {
    const productLabel =
      this.productOptions().find((option) => option.value === productId)?.label ??
      productId;
    const headers = ['Fecha', 'Tipo', 'Cantidad', 'Saldo', 'Nota'];
    const cells: ExcelCellSpec[] = [
      { ref: 'A1', value: `Kardex — ${productLabel}`, bold: true },
      ...headers.map((label, index) => ({
        ref: `${columnLetter(index)}2`,
        value: label,
        bold: true,
      })),
    ];
    rows.forEach((row, index) => {
      const r = index + 3;
      cells.push(
        { ref: `A${r}`, value: new Date(row.createdAt), numberFormat: 'dd/mm/yyyy hh:mm' },
        { ref: `B${r}`, value: this.movementLabel(row.type) },
        { ref: `C${r}`, value: row.quantity, align: 'right' },
        { ref: `D${r}`, value: row.balance, align: 'right' },
        { ref: `E${r}`, value: row.note },
      );
    });
    return {
      name: 'Kardex',
      cells,
      columnWidths: { A: 18, B: 12, C: 12, D: 12, E: 28 },
    };
  }

  private buildSellerStockSheet(rows: readonly SellerStockRow[]): ExcelSheetSpec {
    const headers = ['Vendedor', 'SKU', 'Producto', 'Cantidad'];
    const cells: ExcelCellSpec[] = headers.map((label, index) => ({
      ref: `${columnLetter(index)}1`,
      value: label,
      bold: true,
    }));
    rows.forEach((row, index) => {
      const r = index + 2;
      cells.push(
        { ref: `A${r}`, value: row.sellerName },
        { ref: `B${r}`, value: row.sku },
        { ref: `C${r}`, value: row.name },
        { ref: `D${r}`, value: row.quantity, align: 'right' },
      );
    });
    return {
      name: 'Stock de vendedores',
      cells,
      columnWidths: { A: 24, B: 16, C: 30, D: 12 },
    };
  }

  protected movementLabel(type: MovementType): string {
    return MOVEMENT_LABELS[type];
  }

  protected stockSeverity(available: number): 'danger' | 'warn' | 'success' {
    if (available <= 0) {
      return 'danger';
    }
    return available <= LOW_STOCK_THRESHOLD ? 'warn' : 'success';
  }

  protected stockLabel(available: number): string {
    if (available <= 0) {
      return 'Sin stock';
    }
    return available <= LOW_STOCK_THRESHOLD ? 'Bajo' : 'OK';
  }

  /** Merges into the current query params; a null value drops the param. */
  private patchParams(patch: Params): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: patch,
      queryParamsHandling: 'merge',
    });
  }

  private async loadLookups(): Promise<void> {
    try {
      const [products, sellers] = await Promise.all([
        firstValueFrom(this.products.list({ pageSize: LOOKUP_SIZE })),
        firstValueFrom(
          this.users.list({ role: 'SELLER', pageSize: LOOKUP_SIZE }),
        ),
      ]);
      this.productOptions.set(
        products.items.map((product) => ({
          label: `${product.sku} — ${product.name}`,
          value: product.id,
        })),
      );
      this.sellerNames.set(
        new Map(sellers.items.map((user) => [user.id, user.fullName])),
      );
    } catch {
      // The dropdowns just stay empty if the lookups fail.
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
