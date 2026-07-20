import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom, type Observable } from 'rxjs';

import type { Paginated } from '../../../../core/http/pagination.model';
import { ConfirmationService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { Table, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

import { AuthSession } from '../../../../core/auth/auth-session';
import { LazyList } from '../../../../core/http/lazy-list';
import type { ProductCategory } from '../../../catalogs/product-categories/models/product-category.model';
import { ProductCategoryDataClient } from '../../../catalogs/product-categories/services/product-category-data';
import type { ProductPresentation } from '../../../catalogs/product-presentations/models/product-presentation.model';
import { ProductPresentationDataClient } from '../../../catalogs/product-presentations/services/product-presentation-data';
import type { Product } from '../../models/product.model';
import {
  ProductDataClient,
  type ProductSortBy,
} from '../../services/product-data';

/** Categories/presentations are bounded reference data — fetch enough for the lookups. */
const LOOKUP_SIZE = 100;
/** Delay before a keystroke turns into a search request. */
const SEARCH_DEBOUNCE_MS = 350;

interface SelectOption<T> {
  readonly label: string;
  readonly value: T;
}

@Component({
  selector: 'app-product-list',
  imports: [
    DecimalPipe,
    FormsModule,
    RouterLink,
    ButtonModule,
    ConfirmDialogModule,
    InputTextModule,
    SelectModule,
    TableModule,
    TagModule,
  ],
  templateUrl: './product-list.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ConfirmationService],
})
export class ProductList implements OnInit {
  private readonly products = inject(ProductDataClient);
  private readonly categories = inject(ProductCategoryDataClient);
  private readonly presentations = inject(ProductPresentationDataClient);
  private readonly auth = inject(AuthSession);
  private readonly confirmation = inject(ConfirmationService);
  private readonly table = viewChild.required<Table>('dt');

  protected readonly canManage = computed(() => {
    const role = this.auth.role();
    return role === 'ADMIN' || role === 'SUPERVISOR';
  });
  protected readonly canDelete = computed(() => this.auth.role() === 'ADMIN');

  // Filters — read inside the fetcher closure so reload() uses the latest values.
  /** Bound to the search box for instant feedback; debounced into `appliedSearch`. */
  protected readonly searchTerm = signal('');
  private readonly appliedSearch = signal('');
  protected readonly categoryFilter = signal<string | null>(null);
  protected readonly presentationFilter = signal<string | null>(null);
  protected readonly activeFilter = signal<boolean | null>(null);
  private searchDebounce: ReturnType<typeof setTimeout> | null = null;

  private readonly categoryList = signal<readonly ProductCategory[]>([]);
  private readonly presentationList = signal<readonly ProductPresentation[]>([]);

  protected readonly categoryNames = computed(
    () => new Map(this.categoryList().map((c) => [c.id, c.name])),
  );

  protected readonly categoryFilterOptions = computed<SelectOption<string | null>[]>(
    () => [
      { label: 'Todas las categorías', value: null },
      ...this.categoryList().map((c) => ({ label: c.name, value: c.id })),
    ],
  );
  protected readonly presentationFilterOptions = computed<
    SelectOption<string | null>[]
  >(() => [
    { label: 'Todas las presentaciones', value: null },
    ...this.presentationList().map((p) => ({ label: p.name, value: p.id })),
  ]);
  protected readonly activeFilterOptions: SelectOption<boolean | null>[] = [
    { label: 'Todos los estados', value: null },
    { label: 'Activos', value: true },
    { label: 'Inactivos', value: false },
  ];

  private readonly pendingIds = signal<ReadonlySet<string>>(new Set());
  private readonly rowErrors = signal<Readonly<Record<string, string>>>({});

  protected readonly list = new LazyList<Product>(
    (page, pageSize): Observable<Paginated<Product>> =>
      this.products.list({
        page,
        pageSize,
        search: this.appliedSearch() || undefined,
        categoryId: this.categoryFilter() ?? undefined,
        presentationId: this.presentationFilter() ?? undefined,
        isActive: this.activeFilter() ?? undefined,
        sortBy: (this.list.sortField() as ProductSortBy | null) ?? undefined,
        sortOrder: this.list.sortOrder() ?? undefined,
      }),
    'No se pudieron cargar los productos.',
  );

  ngOnInit(): void {
    void this.loadLookups();
  }

  protected onSearchInput(value: string): void {
    this.searchTerm.set(value);
    if (this.searchDebounce) {
      clearTimeout(this.searchDebounce);
    }
    this.searchDebounce = setTimeout(() => {
      this.appliedSearch.set(value.trim());
      this.table().reset();
    }, SEARCH_DEBOUNCE_MS);
  }

  protected onCategoryFilterChange(categoryId: string | null): void {
    this.categoryFilter.set(categoryId);
    this.table().reset();
  }

  protected onPresentationFilterChange(presentationId: string | null): void {
    this.presentationFilter.set(presentationId);
    this.table().reset();
  }

  protected onActiveFilterChange(isActive: boolean | null): void {
    this.activeFilter.set(isActive);
    this.table().reset();
  }

  protected isPending(id: string): boolean {
    return this.pendingIds().has(id);
  }

  protected rowError(id: string): string | undefined {
    return this.rowErrors()[id];
  }

  protected categoryName(id: string | null): string {
    if (!id) {
      return '—';
    }
    return this.categoryNames().get(id) ?? '—';
  }

  private async loadLookups(): Promise<void> {
    try {
      const [categories, presentations] = await Promise.all([
        firstValueFrom(
          this.categories.list({
            pageSize: LOOKUP_SIZE,
            includeInactive: true,
          }),
        ),
        firstValueFrom(
          this.presentations.list({
            pageSize: LOOKUP_SIZE,
            includeInactive: true,
          }),
        ),
      ]);
      this.categoryList.set(categories.items);
      this.presentationList.set(presentations.items);
    } catch {
      // Filters simply stay empty and names fall back to '—' if the lookup fails.
    }
  }

  protected async toggleActive(product: Product): Promise<void> {
    this.startPending(product.id);
    this.clearRowError(product.id);
    try {
      await firstValueFrom(
        this.products.setActive(product.id, !product.isActive),
      );
      this.list.reload();
    } catch (error) {
      this.setRowError(
        product.id,
        this.toMessage(error, 'No se pudo actualizar el estado.'),
      );
    } finally {
      this.stopPending(product.id);
    }
  }

  protected confirmDelete(product: Product): void {
    this.confirmation.confirm({
      header: 'Eliminar producto',
      message: `¿Eliminar este producto? "${product.name}" se borrará de forma permanente.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        void this.remove(product);
      },
    });
  }

  private async remove(product: Product): Promise<void> {
    this.startPending(product.id);
    this.clearRowError(product.id);
    try {
      await firstValueFrom(this.products.remove(product.id));
      this.list.reload();
    } catch (error) {
      this.setRowError(
        product.id,
        this.toMessage(error, 'No se pudo eliminar el producto.'),
      );
    } finally {
      this.stopPending(product.id);
    }
  }

  private startPending(id: string): void {
    this.pendingIds.update((ids) => new Set(ids).add(id));
  }

  private stopPending(id: string): void {
    this.pendingIds.update((ids) => {
      const next = new Set(ids);
      next.delete(id);
      return next;
    });
  }

  private setRowError(id: string, message: string): void {
    this.rowErrors.update((errors) => ({ ...errors, [id]: message }));
  }

  private clearRowError(id: string): void {
    this.rowErrors.update((errors) => {
      const { [id]: _removed, ...rest } = errors;
      return rest;
    });
  }

  private toMessage(error: unknown, fallback: string): string {
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
}
