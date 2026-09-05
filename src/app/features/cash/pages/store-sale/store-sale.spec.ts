import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { FormArray, FormControl, FormGroup } from '@angular/forms';
import { of, throwError, type Observable } from 'rxjs';
import { vi, type Mock } from 'vitest';

import { ClientDataClient } from '../../../clients/services/client-data';
import { InventoryDataClient } from '../../../inventory/services/inventory-data';
import type { Product } from '../../../products/models/product.model';
import { ProductDataClient } from '../../../products/services/product-data';
import type { CreateSalePayload } from '../../../sales/models/sale.model';
import { SaleDataClient } from '../../../sales/services/sale-data';
import { CashSessionDataClient } from '../../services/cash-session-data';
import { StoreSale } from './store-sale';

type ItemRow = FormGroup<{
  productId: FormControl<string>;
  quantity: FormControl<number>;
  unitPrice: FormControl<number>;
}>;

/**
 * Test-only view of the members the template binds to. They are `protected`
 * on the component (template-visible, not public API), so the spec reaches
 * them through one explicit structural cast instead of scattering `any`.
 */
interface PageInternals {
  readonly form: FormGroup<{
    clientId: FormControl<string>;
    paymentType: FormControl<'CASH' | 'CREDIT'>;
    paymentMethod: FormControl<'CASH' | 'TRANSFER' | 'CARD'>;
    referenceNumber: FormControl<string>;
    amountPaid: FormControl<number>;
    cashReceived: FormControl<number>;
    notes: FormControl<string>;
    items: FormArray<ItemRow>;
  }>;
  readonly items: FormArray<ItemRow>;
  lines(): readonly {
    name: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    exceedsStock: boolean;
  }[];
  results(): readonly { id: string; name: string; inCart: boolean }[];
  query(): string;
  activeIndex(): number;
  onQueryInput(value: string): void;
  moveActive(delta: number): void;
  addActive(): void;
  clearQuery(): void;
  removeItem(index: number): void;
  clearCart(): void;
  bump(index: number, delta: number): void;
  submit(): Promise<void>;
  isEmpty(): boolean;
  itemCount(): number;
  total(): number;
  taxableBase(): number;
  tax(): number;
  hasStockIssue(): boolean;
  balanceDue(): number;
  overpaid(): boolean;
  changeDue(): number;
  isCashMethod(): boolean;
  collectedNow(): number;
  needsReference(): boolean;
  missingReference(): boolean;
  needsClient(): boolean;
  canSubmit(): boolean;
  hasOpenSession(): boolean;
  saleError(): string | null;
}

function product(id: string, name: string, sku: string, price: number): Product {
  return {
    id,
    name,
    sku,
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
  product('p1', 'Urea 50kg', 'URE50', 1150),
  product('p2', 'Sal 25kg', 'SAL25', 430),
];

const SALE_ID = '11111111-1111-4111-8111-111111111111';

describe('StoreSale', () => {
  let fixture: ComponentFixture<StoreSale>;
  let cmp: PageInternals;
  let create: Mock<(...args: unknown[]) => Observable<{ id: string }>>;
  let navigate: Mock<(...args: unknown[]) => Promise<boolean>>;

  async function setup(
    session: unknown = { id: 'session-1', status: 'OPEN' },
  ): Promise<void> {
    create = vi.fn(() => of({ id: SALE_ID }));

    await TestBed.configureTestingModule({
      imports: [StoreSale],
      providers: [
        // The real router: RouterLink in the template needs ActivatedRoute,
        // which a hand-rolled Router stub does not provide.
        provideRouter([]),
        { provide: CashSessionDataClient, useValue: { current: () => of(session) } },
        { provide: SaleDataClient, useValue: { create } },
        {
          provide: ProductDataClient,
          useValue: { list: () => of({ items: PRODUCTS, meta: { total: 2 } }) },
        },
        {
          provide: ClientDataClient,
          useValue: { list: () => of({ items: [], meta: { total: 0 } }) },
        },
        {
          provide: InventoryDataClient,
          useValue: {
            listStock: () =>
              of({
                items: [
                  { productId: 'p1', quantity: 10, updatedAt: '' },
                  { productId: 'p2', quantity: 3, updatedAt: '' },
                ],
                meta: { total: 2 },
              }),
          },
        },
      ],
    }).compileComponents();

    navigate = vi
      .spyOn(TestBed.inject(Router), 'navigate')
      .mockResolvedValue(true) as unknown as Mock<
      (...args: unknown[]) => Promise<boolean>
    >;

    fixture = TestBed.createComponent(StoreSale);
    fixture.detectChanges();
    // ngOnInit's load() resolves on the microtask queue.
    await fixture.whenStable();
    fixture.detectChanges();

    cmp = fixture.componentInstance as unknown as PageInternals;
  }

  beforeEach(async () => {
    await setup();
  });

  /** Types a term and adds whatever Enter would add. */
  function search(term: string): void {
    cmp.onQueryInput(term);
  }

  function addFirst(term: string): void {
    search(term);
    cmp.addActive();
  }

  function setQuantity(row: number, quantity: number): void {
    cmp.items.at(row).controls.quantity.setValue(quantity);
  }

  describe('search', () => {
    it('matches on name and on sku', () => {
      search('urea');
      expect(cmp.results().map((r) => r.id)).toEqual(['p1']);

      search('SAL25');
      expect(cmp.results().map((r) => r.id)).toEqual(['p2']);
    });

    it('shows nothing until something is typed', () => {
      expect(cmp.results()).toEqual([]);
    });

    it('adds the highlighted result on Enter and clears the box', () => {
      addFirst('urea');

      expect(cmp.items.length).toBe(1);
      expect(cmp.items.at(0).controls.productId.value).toBe('p1');
      expect(cmp.query()).toBe('');
    });

    it('takes the catalog price when a product is added', () => {
      addFirst('urea');

      expect(cmp.items.at(0).controls.unitPrice.value).toBe(1150);
      expect(cmp.lines()[0]?.unitPrice).toBe(1150);
    });

    // Scanning the same item twice means two units, not a duplicate row.
    it('bumps the quantity instead of duplicating a line', () => {
      addFirst('urea');
      addFirst('urea');

      expect(cmp.items.length).toBe(1);
      expect(cmp.items.at(0).controls.quantity.value).toBe(2);
      expect(cmp.itemCount()).toBe(2);
    });

    it('flags a product already in the cart', () => {
      addFirst('urea');
      search('urea');

      expect(cmp.results()[0]?.inCart).toBe(true);
    });

    // Wraps so a held arrow key never dead-ends at either edge.
    it('wraps the active result with the arrow keys', () => {
      search('5'); // matches both skus (URE50, SAL25)
      expect(cmp.results().length).toBe(2);

      expect(cmp.activeIndex()).toBe(0);
      cmp.moveActive(1);
      expect(cmp.activeIndex()).toBe(1);
      cmp.moveActive(1);
      expect(cmp.activeIndex()).toBe(0);
      cmp.moveActive(-1);
      expect(cmp.activeIndex()).toBe(1);
    });

    it('does nothing on Enter with no matches', () => {
      search('no existe');
      cmp.addActive();

      expect(cmp.items.length).toBe(0);
    });
  });

  describe('cart arithmetic', () => {
    it('recomputes the line subtotal and the total when quantity changes', () => {
      addFirst('urea');
      setQuantity(0, 3);

      expect(cmp.lines()[0]?.subtotal).toBe(3450);
      expect(cmp.total()).toBe(3450);
      expect(cmp.itemCount()).toBe(3);
    });

    it('adds up several lines', () => {
      addFirst('urea');
      addFirst('sal');
      setQuantity(1, 2);

      expect(cmp.total()).toBe(1150 + 860);
      expect(cmp.itemCount()).toBe(3);
    });

    it('honours a manual price override instead of the catalog price', () => {
      addFirst('urea');
      cmp.items.at(0).controls.unitPrice.setValue(1000);

      expect(cmp.total()).toBe(1000);
    });

    it('splits ISV out of a tax-inclusive total without changing it', () => {
      addFirst('urea'); // 1150 = 1000 + 15%

      expect(cmp.total()).toBe(1150);
      expect(cmp.taxableBase()).toBeCloseTo(1000, 6);
      expect(cmp.tax()).toBeCloseTo(150, 6);
      expect(cmp.taxableBase() + cmp.tax()).toBeCloseTo(cmp.total(), 6);
    });

    it('flags a line that outruns warehouse stock', () => {
      addFirst('sal'); // only 3 on hand
      setQuantity(0, 3);
      expect(cmp.hasStockIssue()).toBe(false);

      setQuantity(0, 4);
      expect(cmp.hasStockIssue()).toBe(true);
      expect(cmp.lines()[0]?.exceedsStock).toBe(true);
    });

    it('removes and clears lines', () => {
      addFirst('urea');
      addFirst('sal');
      expect(cmp.items.length).toBe(2);

      cmp.removeItem(0);
      expect(cmp.items.length).toBe(1);

      cmp.clearCart();
      expect(cmp.isEmpty()).toBe(true);
    });

    it('never steps a quantity below one', () => {
      addFirst('urea');
      cmp.bump(0, -5);

      expect(cmp.items.at(0).controls.quantity.value).toBe(1);
    });
  });

  describe('collection', () => {
    it('computes the change due once cash is tendered', () => {
      addFirst('urea');
      cmp.form.controls.cashReceived.setValue(2000);

      expect(cmp.changeDue()).toBe(850);
    });

    it('reports a shortfall as negative change', () => {
      addFirst('urea');
      cmp.form.controls.cashReceived.setValue(1000);

      expect(cmp.changeDue()).toBe(-150);
    });

    it('tracks the outstanding balance on a credit sale', () => {
      addFirst('urea');
      cmp.form.controls.paymentType.setValue('CREDIT');
      cmp.form.controls.amountPaid.setValue(400);

      expect(cmp.balanceDue()).toBe(750);
      expect(cmp.overpaid()).toBe(false);

      cmp.form.controls.amountPaid.setValue(1500);
      expect(cmp.overpaid()).toBe(true);
    });

    // Change is only owed on banknotes; a transfer hands none back.
    it('stops treating the sale as cash once the method is not cash', () => {
      addFirst('urea');
      expect(cmp.isCashMethod()).toBe(true);

      cmp.form.controls.paymentMethod.setValue('TRANSFER');
      expect(cmp.isCashMethod()).toBe(false);
    });

    // Credit is extended to a registered client, never to a walk-in.
    it('demands a client on a credit sale', () => {
      addFirst('urea');
      cmp.form.controls.paymentType.setValue('CREDIT');

      expect(cmp.needsClient()).toBe(true);
      expect(cmp.canSubmit()).toBe(false);

      cmp.form.controls.clientId.setValue('client-1');
      expect(cmp.needsClient()).toBe(false);
    });
  });

  describe('submit', () => {
    it('refuses to submit an empty cart', async () => {
      expect(cmp.canSubmit()).toBe(false);

      await cmp.submit();
      expect(create).not.toHaveBeenCalled();
    });

    it('sends a STORE payload with the resolved lines', async () => {
      addFirst('urea');
      setQuantity(0, 2);

      await cmp.submit();

      expect(create).toHaveBeenCalledWith({
        channel: 'STORE',
        paymentType: 'CASH',
        paymentMethod: 'CASH',
        items: [{ productId: 'p1', quantity: 2, unitPrice: 1150 }],
      } satisfies CreateSalePayload);
    });

    it('sends a transfer with its reference', async () => {
      addFirst('urea');
      cmp.form.controls.paymentMethod.setValue('TRANSFER');
      cmp.form.controls.referenceNumber.setValue('  8842  ');

      await cmp.submit();

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentMethod: 'TRANSFER',
          referenceNumber: '8842',
        }),
      );
    });

    // The API refuses an untraceable non-cash collection outright.
    it('refuses to submit a transfer with no reference', async () => {
      addFirst('urea');
      cmp.form.controls.paymentMethod.setValue('TRANSFER');

      expect(cmp.needsReference()).toBe(true);
      expect(cmp.missingReference()).toBe(true);

      await cmp.submit();
      expect(create).not.toHaveBeenCalled();
    });

    // Nothing changes hands, so nothing is claimed about how it arrived.
    it('omits the method on a credit sale with no down payment', async () => {
      addFirst('urea');
      cmp.form.controls.paymentType.setValue('CREDIT');
      cmp.form.controls.clientId.setValue('client-1');
      cmp.form.controls.paymentMethod.setValue('TRANSFER');

      expect(cmp.collectedNow()).toBe(0);
      expect(cmp.needsReference()).toBe(false);

      await cmp.submit();

      const payload = create.mock.calls[0]?.[0] as CreateSalePayload;
      expect(payload.paymentMethod).toBeUndefined();
      expect(payload.referenceNumber).toBeUndefined();
      expect(payload.amountPaid).toBe(0);
    });

    it('goes to the registered sale on success', async () => {
      addFirst('urea');
      await cmp.submit();

      expect(navigate).toHaveBeenCalledWith(['/ventas', SALE_ID]);
    });

    it('keeps the cart and surfaces the error when the API refuses', async () => {
      create.mockReturnValueOnce(
        throwError(() => ({ message: 'Stock insuficiente.' })),
      );
      addFirst('urea');

      await cmp.submit();

      expect(cmp.saleError()).toBe('Stock insuficiente.');
      expect(navigate).not.toHaveBeenCalled();
      expect(cmp.items.length).toBe(1);
    });
  });

  describe('leaving the page', () => {
    it('has nothing to lose while the cart is empty', () => {
      expect(fixture.componentInstance.hasUnsavedChanges()).toBe(false);
    });

    it('guards a cart with lines in it', () => {
      addFirst('urea');
      expect(fixture.componentInstance.hasUnsavedChanges()).toBe(true);
    });

    // The sale is registered by then: there is nothing left to discard.
    it('stops guarding once the sale is submitted', async () => {
      addFirst('urea');
      await cmp.submit();

      expect(fixture.componentInstance.hasUnsavedChanges()).toBe(false);
    });
  });

  describe('without an open till', () => {
    it('refuses to sell', async () => {
      TestBed.resetTestingModule();
      await setup(null);

      expect(cmp.hasOpenSession()).toBe(false);
    });
  });
});
