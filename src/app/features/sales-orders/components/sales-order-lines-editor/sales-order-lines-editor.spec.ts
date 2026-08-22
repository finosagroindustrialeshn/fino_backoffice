import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Product } from '../../../products/models/product.model';
import type { SalesOrderLineInput } from '../../models/sales-order.model';
import { SalesOrderLinesEditor } from './sales-order-lines-editor';

/**
 * Test-only view of the members the template binds to. They are `protected`
 * on the component (template-visible, not public API), so the spec reaches
 * them through one explicit structural cast instead of scattering `any`.
 */
interface EditorInternals {
  readonly lines: {
    (): readonly SalesOrderLineInput[];
    set(value: readonly SalesOrderLineInput[]): void;
  };
  productToAdd: { (): string | null; set(value: string | null): void };
  addableProducts(): readonly Product[];
  estimatedTotal(): number;
  addLine(): void;
  removeLine(productId: string): void;
  canRemove(productId: string): boolean;
  floorOf(productId: string): number;
  setQuantity(productId: string, quantity: number): void;
  setPrice(productId: string, price: number): void;
  productName(productId: string): string;
  subtotalOf(line: SalesOrderLineInput): number;
}

function product(id: string, name: string, price: number): Product {
  return {
    id,
    name,
    sku: `SKU-${id}`,
    description: null,
    imageUrl: null,
    technicalSheetUrl: null,
    composition: null,
    cost: price / 2,
    price,
    categoryId: null,
    presentationId: null,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

const PRODUCTS = [
  product('p1', 'Concentrado Engorde', 100),
  product('p2', 'Sal Mineralizada', 50),
  product('p3', 'Melaza', 30),
];

describe('SalesOrderLinesEditor', () => {
  let fixture: ComponentFixture<SalesOrderLinesEditor>;
  let cmp: EditorInternals;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SalesOrderLinesEditor],
    }).compileComponents();

    fixture = TestBed.createComponent(SalesOrderLinesEditor);
    fixture.componentRef.setInput('products', PRODUCTS);
    fixture.componentRef.setInput('fulfilled', {});
    fixture.detectChanges();
    cmp = fixture.componentInstance as unknown as EditorInternals;
  });

  it('seeds a new line with the catalog price', () => {
    cmp.productToAdd.set('p1');
    cmp.addLine();

    expect(cmp.lines()).toEqual([
      { productId: 'p1', quantity: 1, unitPriceRef: 100 },
    ]);
  });

  it('never offers a product that is already on the order', () => {
    cmp.lines.set([{ productId: 'p1', quantity: 2, unitPriceRef: 100 }]);
    fixture.detectChanges();

    expect(cmp.addableProducts().map((p) => p.id)).toEqual(['p2', 'p3']);
  });

  it('keeps a negotiated price when the quantity changes', () => {
    cmp.lines.set([{ productId: 'p1', quantity: 2, unitPriceRef: 85 }]);
    cmp.setQuantity('p1', 7);

    expect(cmp.lines()).toEqual([
      { productId: 'p1', quantity: 7, unitPriceRef: 85 },
    ]);
  });

  it('totals quantity by quoted price, not by catalog price', () => {
    cmp.lines.set([
      { productId: 'p1', quantity: 2, unitPriceRef: 85 },
      { productId: 'p2', quantity: 3, unitPriceRef: 50 },
    ]);
    fixture.detectChanges();

    expect(cmp.estimatedTotal()).toBe(320);
  });

  describe('lines that were already delivered', () => {
    beforeEach(() => {
      // p1 has 12 units in the client's hands already.
      fixture.componentRef.setInput('fulfilled', { p1: 12 });
      cmp.lines.set([
        { productId: 'p1', quantity: 20, unitPriceRef: 100 },
        { productId: 'p2', quantity: 5, unitPriceRef: 50 },
      ]);
      fixture.detectChanges();
    });

    it('refuses to drop a line below what was delivered', () => {
      cmp.setQuantity('p1', 3);

      // Clamped to the floor rather than rejected outright: the API would
      // answer SALES_ORDER_LINE_BELOW_FULFILLED, and a silent 400 on save is
      // worse than a number that visibly refuses to go lower.
      expect(cmp.lines()[0]).toEqual({
        productId: 'p1',
        quantity: 12,
        unitPriceRef: 100,
      });
    });

    it('allows raising a delivered line', () => {
      cmp.setQuantity('p1', 25);
      expect(cmp.lines()[0]?.quantity).toBe(25);
    });

    it('refuses to remove a line with deliveries', () => {
      expect(cmp.canRemove('p1')).toBe(false);
      cmp.removeLine('p1');
      expect(cmp.lines()).toHaveLength(2);
    });

    it('removes an untouched line', () => {
      expect(cmp.canRemove('p2')).toBe(true);
      cmp.removeLine('p2');
      expect(cmp.lines().map((line) => line.productId)).toEqual(['p1']);
    });
  });

  it('floors a quantity at one when nothing was delivered', () => {
    cmp.lines.set([{ productId: 'p1', quantity: 4, unitPriceRef: 100 }]);
    cmp.setQuantity('p1', 0);

    expect(cmp.lines()[0]?.quantity).toBe(1);
  });

  it('refuses a negative price', () => {
    cmp.lines.set([{ productId: 'p1', quantity: 4, unitPriceRef: 100 }]);
    cmp.setPrice('p1', -5);

    expect(cmp.lines()[0]?.unitPriceRef).toBe(0);
  });

  it('rounds the price to two decimals', () => {
    // The API validates unitPriceRef with maxDecimalPlaces: 2 and answers
    // 400 VALIDATION_FAILED otherwise. Money has two decimals anyway, so
    // rounding here beats a rejected save the user cannot explain.
    cmp.lines.set([{ productId: 'p1', quantity: 4, unitPriceRef: 100 }]);
    cmp.setPrice('p1', 18.555);

    expect(cmp.lines()[0]?.unitPriceRef).toBe(18.56);
  });

  it('does not let floating point noise reach the API', () => {
    cmp.lines.set([{ productId: 'p1', quantity: 4, unitPriceRef: 100 }]);
    cmp.setPrice('p1', 0.1 + 0.2);

    expect(cmp.lines()[0]?.unitPriceRef).toBe(0.3);
  });
});
