import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { FormArray, FormControl, FormGroup } from '@angular/forms';

import type { Product } from '../../../products/models/product.model';
import { StoreSaleDialog } from './store-sale-dialog';

type ItemRow = FormGroup<{
  productId: FormControl<string>;
  quantity: FormControl<number>;
  unitPrice: FormControl<number | null>;
}>;

/**
 * Test-only view of the members the template binds to. They are `protected`
 * on the component (template-visible, not public API), so the spec reaches
 * them through one explicit structural cast instead of scattering `any`.
 */
interface DialogInternals {
  readonly form: FormGroup<{
    paymentType: FormControl<'CASH' | 'CREDIT'>;
    amountPaid: FormControl<number>;
    cashReceived: FormControl<number>;
    items: FormArray<ItemRow>;
  }>;
  readonly items: FormArray<ItemRow>;
  lines(): readonly {
    subtotal: number;
    unitPrice: number;
    exceedsStock: boolean;
  }[];
  itemCount(): number;
  total(): number;
  taxableBase(): number;
  tax(): number;
  hasStockIssue(): boolean;
  balanceDue(): number;
  overpaid(): boolean;
  changeDue(): number;
  addItem(): void;
}

function product(id: string, name: string, price: number): Product {
  return {
    id,
    name,
    sku: name.toUpperCase(),
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

const PRODUCTS = [product('p1', 'Urea', 1150), product('p2', 'Sal', 430)];

describe('StoreSaleDialog', () => {
  let fixture: ComponentFixture<StoreSaleDialog>;
  let cmp: DialogInternals;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StoreSaleDialog],
    }).compileComponents();

    fixture = TestBed.createComponent(StoreSaleDialog);
    fixture.componentRef.setInput('products', PRODUCTS);
    fixture.componentRef.setInput('clients', []);
    fixture.componentRef.setInput('stock', { p1: 10, p2: 3 });
    fixture.detectChanges();

    cmp = fixture.componentInstance as unknown as DialogInternals;
  });

  function pick(row: number, productId: string): void {
    cmp.items.at(row).controls.productId.setValue(productId);
  }

  function setQuantity(row: number, quantity: number): void {
    cmp.items.at(row).controls.quantity.setValue(quantity);
  }

  it('fills in the catalog price when a product is picked', () => {
    pick(0, 'p1');

    expect(cmp.items.at(0).controls.unitPrice.value).toBe(1150);
    expect(cmp.lines()[0]?.unitPrice).toBe(1150);
  });

  it('recomputes the line subtotal and the total when quantity changes', () => {
    pick(0, 'p1');
    setQuantity(0, 3);

    expect(cmp.lines()[0]?.subtotal).toBe(3450);
    expect(cmp.total()).toBe(3450);
    expect(cmp.itemCount()).toBe(3);
  });

  it('adds up several lines', () => {
    pick(0, 'p1');
    cmp.addItem();
    pick(1, 'p2');
    setQuantity(1, 2);

    expect(cmp.total()).toBe(1150 + 860);
    expect(cmp.itemCount()).toBe(3);
  });

  it('honours a manual price override instead of the catalog price', () => {
    pick(0, 'p1');
    cmp.items.at(0).controls.unitPrice.setValue(1000);

    expect(cmp.total()).toBe(1000);
  });

  it('splits ISV out of a tax-inclusive total without changing it', () => {
    pick(0, 'p1'); // 1150 = 1000 + 15%

    expect(cmp.total()).toBe(1150);
    expect(cmp.taxableBase()).toBeCloseTo(1000, 6);
    expect(cmp.tax()).toBeCloseTo(150, 6);
    expect(cmp.taxableBase() + cmp.tax()).toBeCloseTo(cmp.total(), 6);
  });

  it('flags a line that outruns warehouse stock', () => {
    pick(0, 'p2'); // only 3 on hand
    setQuantity(0, 3);
    expect(cmp.hasStockIssue()).toBe(false);

    setQuantity(0, 4);
    expect(cmp.hasStockIssue()).toBe(true);
    expect(cmp.lines()[0]?.exceedsStock).toBe(true);
  });

  it('computes the change due once cash is tendered', () => {
    pick(0, 'p1');
    cmp.form.controls.cashReceived.setValue(2000);

    expect(cmp.changeDue()).toBe(850);
  });

  it('reports a shortfall as negative change', () => {
    pick(0, 'p1');
    cmp.form.controls.cashReceived.setValue(1000);

    expect(cmp.changeDue()).toBe(-150);
  });

  it('tracks the outstanding balance on a credit sale', () => {
    pick(0, 'p1');
    cmp.form.controls.paymentType.setValue('CREDIT');
    cmp.form.controls.amountPaid.setValue(400);

    expect(cmp.balanceDue()).toBe(750);
    expect(cmp.overpaid()).toBe(false);

    cmp.form.controls.amountPaid.setValue(1500);
    expect(cmp.overpaid()).toBe(true);
  });

  /**
   * The arithmetic specs above pass even when the template renders stale
   * numbers, which is exactly how a live "L 0.00" subtotal slipped through.
   * These assert what actually reaches the screen.
   */
  describe('rendering', () => {
    function render(): string {
      fixture.componentInstance.visible.set(true);
      fixture.detectChanges();
      return document.body.textContent ?? '';
    }

    function occurrences(haystack: string, needle: string): number {
      return haystack.split(needle).length - 1;
    }

    it('shows the line subtotal and the total once quantity changes', () => {
      render();
      pick(0, 'p1');
      setQuantity(0, 3);
      const text = render();

      // Once as the line subtotal, once as the order total.
      expect(occurrences(text, 'L 3,450.00')).toBeGreaterThanOrEqual(2);
    });

    it('keeps the control value after a re-render', () => {
      render();
      pick(0, 'p1');
      setQuantity(0, 4);
      render();

      expect(cmp.items.at(0).controls.quantity.value).toBe(4);
      expect(cmp.items.at(0).controls.unitPrice.value).toBe(1150);
    });

    it('offers a visible control to add another product', () => {
      const text = render();
      expect(text).toContain('Agregar producto');
    });

    /**
     * The specs above drive the FormControls directly, which is NOT what a
     * cashier does: they type into PrimeNG's inputs, so the value travels
     * through the ControlValueAccessor first. This reproduces that path.
     */
    it('updates the subtotal when the quantity input is typed into', () => {
      render();
      pick(0, 'p1');
      fixture.detectChanges();

      const input = document.querySelector<HTMLInputElement>(
        'input[aria-label="Cantidad de la línea 1"]',
      );
      expect(input).not.toBeNull();

      input!.value = '3';
      input!.dispatchEvent(new Event('input', { bubbles: true }));
      fixture.detectChanges();

      expect(cmp.items.at(0).controls.quantity.value).toBe(3);
      expect(cmp.total()).toBe(3450);
      expect(occurrences(document.body.textContent ?? '', 'L 3,450.00'))
        .toBeGreaterThanOrEqual(2);
    });

    it('treats a cleared quantity box as zero instead of NaN', () => {
      render();
      pick(0, 'p1');

      const input = document.querySelector<HTMLInputElement>(
        'input[aria-label="Cantidad de la línea 1"]',
      );
      input!.value = '';
      input!.dispatchEvent(new Event('input', { bubbles: true }));
      fixture.detectChanges();

      expect(cmp.total()).toBe(0);
      expect(Number.isNaN(cmp.total())).toBe(false);
    });

    it('steps the quantity with the +/- buttons', () => {
      render();
      pick(0, 'p1');

      const plus = document.querySelector<HTMLButtonElement>(
        'button[aria-label="Agregar una unidad a la línea 1"]',
      );
      plus!.click();
      plus!.click();
      fixture.detectChanges();

      expect(cmp.items.at(0).controls.quantity.value).toBe(3);
      expect(cmp.total()).toBe(3450);
    });

    it('renders the ISV breakdown', () => {
      render();
      pick(0, 'p1');
      const text = render();

      expect(text).toContain('ISV');
      expect(text).toContain('L 1,000.00'); // taxable base
      expect(text).toContain('L 150.00'); // tax
    });
  });

  it('emits a STORE payload with the resolved lines', () => {
    const emitted: unknown[] = [];
    fixture.componentInstance.submitted.subscribe((payload) =>
      emitted.push(payload),
    );

    pick(0, 'p1');
    setQuantity(0, 2);
    fixture.componentInstance['submit']();

    expect(emitted).toEqual([
      {
        channel: 'STORE',
        paymentType: 'CASH',
        items: [{ productId: 'p1', quantity: 2, unitPrice: 1150 }],
      },
    ]);
  });
});
