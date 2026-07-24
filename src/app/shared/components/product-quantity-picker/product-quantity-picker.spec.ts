import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Product } from '../../../features/products/models/product.model';
import { ProductQuantityPicker } from './product-quantity-picker';

/**
 * Test-only view of the members the template binds to. They are `protected`
 * on the component (template-visible, not public API), so the spec reaches
 * them through one explicit structural cast instead of scattering `any`.
 */
interface PickerInternals {
  readonly quantities: {
    (): Record<string, number>;
    set(value: Record<string, number>): void;
  };
  search: { (): string; set(value: string): void };
  onlySelected: { (): boolean; set(value: boolean): void };
  visibleProducts(): readonly Product[];
  selectedCount(): number;
  totalUnits(): number;
  hasStockIssue(): boolean;
  quantityOf(productId: string): number;
  availableOf(productId: string): number | null;
  exceedsStock(productId: string): boolean;
  isOutOfStock(productId: string): boolean;
  setQuantity(productId: string, quantity: number): void;
  bump(productId: string, delta: number): void;
  clearAll(): void;
}

function product(id: string, name: string, sku: string): Product {
  return {
    id,
    name,
    sku,
    description: null,
    imageUrl: null,
    technicalSheetUrl: null,
    composition: null,
    cost: 100,
    price: 200,
    categoryId: null,
    presentationId: null,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

const PRODUCTS = [
  product('p1', 'Concentrado Engorde Bovino', 'CONC-ENG-QQ'),
  product('p2', 'Concentrado Aves de Postura', 'AVIC-POST-QQ'),
  product('p3', 'Sal Mineralizada', 'SAL-MIN-QQ'),
];

const STOCK: Record<string, number> = { p1: 50, p2: 100, p3: 0 };

describe('ProductQuantityPicker', () => {
  let fixture: ComponentFixture<ProductQuantityPicker>;
  let cmp: PickerInternals;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProductQuantityPicker],
    }).compileComponents();

    fixture = TestBed.createComponent(ProductQuantityPicker);
    fixture.componentRef.setInput('products', PRODUCTS);
    fixture.componentRef.setInput('stock', STOCK);
    fixture.detectChanges();

    cmp = fixture.componentInstance as unknown as PickerInternals;
  });

  describe('selection through quantity', () => {
    it('starts with nothing selected', () => {
      expect(cmp.selectedCount()).toBe(0);
      expect(cmp.totalUnits()).toBe(0);
    });

    it('counts a product as selected once its quantity is positive', () => {
      cmp.setQuantity('p1', 10);

      expect(cmp.quantityOf('p1')).toBe(10);
      expect(cmp.selectedCount()).toBe(1);
      expect(cmp.totalUnits()).toBe(10);
    });

    it('adds up several products', () => {
      cmp.setQuantity('p1', 10);
      cmp.setQuantity('p2', 5);

      expect(cmp.selectedCount()).toBe(2);
      expect(cmp.totalUnits()).toBe(15);
    });

    it('deselects when the quantity goes back to zero', () => {
      cmp.setQuantity('p1', 10);
      cmp.setQuantity('p1', 0);

      expect(cmp.selectedCount()).toBe(0);
      expect(cmp.totalUnits()).toBe(0);
    });

    it('drops zero-quantity entries from the emitted value', () => {
      cmp.setQuantity('p1', 10);
      cmp.setQuantity('p2', 0);

      expect(cmp.quantities()).toEqual({ p1: 10 });
    });

    it('never records a negative quantity', () => {
      cmp.setQuantity('p1', -5);

      expect(cmp.quantityOf('p1')).toBe(0);
      expect(cmp.selectedCount()).toBe(0);
    });

    it('clears every selection at once', () => {
      cmp.setQuantity('p1', 10);
      cmp.setQuantity('p2', 5);
      cmp.clearAll();

      expect(cmp.selectedCount()).toBe(0);
      expect(cmp.quantities()).toEqual({});
    });
  });

  describe('bump', () => {
    it('increments from zero', () => {
      cmp.bump('p1', 1);
      expect(cmp.quantityOf('p1')).toBe(1);
    });

    it('decrements but never below zero', () => {
      cmp.bump('p1', 1);
      cmp.bump('p1', -1);
      cmp.bump('p1', -1);

      expect(cmp.quantityOf('p1')).toBe(0);
    });
  });

  describe('stock awareness', () => {
    it('exposes the available units per product', () => {
      expect(cmp.availableOf('p1')).toBe(50);
      expect(cmp.availableOf('p3')).toBe(0);
    });

    it('flags a line that asks for more than the warehouse has', () => {
      cmp.setQuantity('p1', 51);

      expect(cmp.exceedsStock('p1')).toBe(true);
      expect(cmp.hasStockIssue()).toBe(true);
    });

    it('does not flag a line exactly at the available amount', () => {
      cmp.setQuantity('p1', 50);

      expect(cmp.exceedsStock('p1')).toBe(false);
      expect(cmp.hasStockIssue()).toBe(false);
    });

    it('marks a product with no stock as unavailable', () => {
      expect(cmp.isOutOfStock('p3')).toBe(true);
      expect(cmp.isOutOfStock('p1')).toBe(false);
    });

    it('treats an unknown product as having no stock information', () => {
      fixture.componentRef.setInput('stock', null);
      fixture.detectChanges();

      expect(cmp.availableOf('p1')).toBeNull();
      // With no stock data nothing can be judged as exceeding it.
      cmp.setQuantity('p1', 9999);
      expect(cmp.exceedsStock('p1')).toBe(false);
      expect(cmp.hasStockIssue()).toBe(false);
    });
  });

  describe('filtering', () => {
    it('shows every product by default', () => {
      expect(cmp.visibleProducts()).toHaveLength(3);
    });

    it('filters by name, case-insensitively', () => {
      cmp.search.set('aves');

      expect(cmp.visibleProducts().map((p) => p.id)).toEqual(['p2']);
    });

    it('filters by SKU too', () => {
      cmp.search.set('sal-min');

      expect(cmp.visibleProducts().map((p) => p.id)).toEqual(['p3']);
    });

    it('ignores surrounding whitespace in the search', () => {
      cmp.search.set('  bovino  ');

      expect(cmp.visibleProducts().map((p) => p.id)).toEqual(['p1']);
    });

    it('narrows to the selected products when asked', () => {
      cmp.setQuantity('p2', 3);
      cmp.onlySelected.set(true);

      expect(cmp.visibleProducts().map((p) => p.id)).toEqual(['p2']);
    });

    it('combines the search with the only-selected filter', () => {
      cmp.setQuantity('p1', 3);
      cmp.setQuantity('p2', 3);
      cmp.onlySelected.set(true);
      cmp.search.set('aves');

      expect(cmp.visibleProducts().map((p) => p.id)).toEqual(['p2']);
    });
  });
});
