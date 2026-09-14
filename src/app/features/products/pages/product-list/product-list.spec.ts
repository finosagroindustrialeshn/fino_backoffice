import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError, type Observable } from 'rxjs';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { AuthSession } from '../../../../core/auth/auth-session';
import type { Paginated } from '../../../../core/http/pagination.model';
import { ProductCategoryDataClient } from '../../../catalogs/product-categories/services/product-category-data';
import { ProductPresentationDataClient } from '../../../catalogs/product-presentations/services/product-presentation-data';
import type { Product } from '../../models/product.model';
import { ProductDataClient } from '../../services/product-data';
import { ProductList } from './product-list';

const PRODUCT_ID = '11111111-1111-4111-8111-111111111111';

/** Test-only view of the protected members the template binds to. */
interface ListInternals {
  toggleActive(product: Product): Promise<void>;
  isPending(id: string): boolean;
  rowError(id: string): string | undefined;
}

function paginated<T>(items: readonly T[]): Paginated<T> {
  return {
    items,
    meta: {
      page: 1,
      pageSize: 10,
      total: items.length,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  };
}

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: PRODUCT_ID,
    name: 'Urea 50kg',
    sku: 'URE50',
    description: null,
    imageUrl: null,
    technicalSheetUrl: null,
    composition: null,
    cost: 60,
    price: 100,
    maxDiscountPercent: 20,
    minPrice: 80,
    allowedDiscountPercent: 20,
    categoryId: null,
    presentationId: null,
    isvExempt: false,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('ProductList — activate / deactivate', () => {
  let fixture: ComponentFixture<ProductList>;
  let cmp: ListInternals;
  let list: Mock<() => Observable<Paginated<Product>>>;
  let activate: Mock<(id: string) => Observable<Product>>;
  let deactivate: Mock<(id: string) => Observable<Product>>;

  async function mount(rows: readonly Product[]): Promise<void> {
    list.mockReturnValue(of(paginated(rows)));
    fixture = TestBed.createComponent(ProductList);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    cmp = fixture.componentInstance as unknown as ListInternals;
  }

  function buttonsLabelled(prefix: string): HTMLButtonElement[] {
    return Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ).filter((b) => b.getAttribute('aria-label')?.startsWith(prefix));
  }

  beforeEach(async () => {
    list = vi.fn();
    activate = vi.fn();
    deactivate = vi.fn();
    await TestBed.configureTestingModule({
      imports: [ProductList],
      providers: [
        provideRouter([]),
        { provide: ProductDataClient, useValue: { list, activate, deactivate } },
        {
          provide: ProductCategoryDataClient,
          useValue: { list: vi.fn(() => of(paginated([]))) },
        },
        {
          provide: ProductPresentationDataClient,
          useValue: { list: vi.fn(() => of(paginated([]))) },
        },
        { provide: AuthSession, useValue: { role: () => 'ADMIN' } },
      ],
    }).compileComponents();
  });

  it('deactivates an active product through the dedicated endpoint and reloads', async () => {
    const active = product({ isActive: true });
    await mount([active]);
    deactivate.mockReturnValue(of(product({ isActive: false })));
    const fetchesBefore = list.mock.calls.length;

    await cmp.toggleActive(active);

    expect(deactivate).toHaveBeenCalledWith(PRODUCT_ID);
    expect(activate).not.toHaveBeenCalled();
    expect(list.mock.calls.length).toBe(fetchesBefore + 1);
    expect(cmp.isPending(PRODUCT_ID)).toBe(false);
  });

  it('activates an inactive product through the dedicated endpoint and reloads', async () => {
    const inactive = product({ isActive: false });
    await mount([inactive]);
    activate.mockReturnValue(of(product({ isActive: true })));
    const fetchesBefore = list.mock.calls.length;

    await cmp.toggleActive(inactive);

    expect(activate).toHaveBeenCalledWith(PRODUCT_ID);
    expect(deactivate).not.toHaveBeenCalled();
    expect(list.mock.calls.length).toBe(fetchesBefore + 1);
  });

  it('surfaces the row error and clears the pending flag when the flip fails', async () => {
    const active = product({ isActive: true });
    await mount([active]);
    deactivate.mockReturnValue(
      throwError(() => ({ message: 'Producto con ventas abiertas' })),
    );
    const fetchesBefore = list.mock.calls.length;

    await cmp.toggleActive(active);
    fixture.detectChanges();

    expect(cmp.rowError(PRODUCT_ID)).toBe('Producto con ventas abiertas');
    expect(cmp.isPending(PRODUCT_ID)).toBe(false);
    expect(list.mock.calls.length).toBe(fetchesBefore);
    const alerts = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('[role="alert"]'),
    );
    expect(
      alerts.some((a) => a.textContent?.includes('Producto con ventas abiertas')),
    ).toBe(true);
  });

  it('tags an ISV-exempt product in both layouts and nothing otherwise', async () => {
    await mount([
      product({ id: 'exempt', sku: 'EXE', isvExempt: true }),
      product({ id: 'taxed', sku: 'TAX', isvExempt: false }),
    ]);

    const tags = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('p-tag'),
    ).filter((t) => t.textContent?.includes('Exento ISV'));
    // Desktop table + mobile card, for the one exempt row only.
    expect(tags).toHaveLength(2);
  });

  it('offers only the activate toggle to an ADMIN — no delete action anywhere', async () => {
    await mount([product({ isActive: true })]);

    // Both layouts (desktop table + mobile card) render the toggle.
    expect(buttonsLabelled('Desactivar producto')).toHaveLength(2);
    expect(buttonsLabelled('Eliminar producto')).toHaveLength(0);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('p-confirmdialog'),
    ).toBeNull();
  });
});
