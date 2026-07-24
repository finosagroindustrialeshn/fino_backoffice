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
import { formatDay, type DateRange } from '../../utils/date-range';
import { parseBool, parseRange, parseUuid } from '../../utils/report-params';

interface Option {
  readonly label: string;
  readonly value: string | null;
}

/** Products and sellers are bounded lookups for the filter dropdowns. */
const LOOKUP_SIZE = 100;
/** Threshold used by the low-stock view. */
const LOW_STOCK_THRESHOLD = 10;

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
