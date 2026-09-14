import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError, type Observable } from 'rxjs';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import {
  MIN_DELIVERY_ORDER_NUMBER,
  type CreateDispatchPayload,
  type Dispatch,
} from '../../../dispatches/models/dispatch.model';
import { DispatchDataClient } from '../../../dispatches/services/dispatch-data';
import type { SalesOrder, SalesOrderItem } from '../../models/sales-order.model';
import { CreateDispatchDialog } from './create-dispatch-dialog';

const ORDER_ID = '33333333-3333-4333-8333-333333333333';
const SELLER_ID = '88888888-8888-4888-8888-888888888888';

/** Test-only view of the protected members the template binds to. */
interface DialogInternals {
  submit(): Promise<void>;
  readonly form: {
    patchValue(value: Record<string, unknown>): void;
    getRawValue(): { date: Date; deliveryOrderNumber: number | null };
    readonly invalid: boolean;
  };
  error(): string | null;
  fieldErrors(): readonly { field: string; messages: readonly string[] }[];
  pendingItems(): readonly { productId: string; quantity: number }[];
  sellerName(): string | null;
}

function line(overrides: Partial<SalesOrderItem> = {}): SalesOrderItem {
  return {
    productId: 'p1',
    productName: 'Concentrado Engorde',
    productSku: 'CONC-ENG',
    productImageUrl: null,
    quantity: 5,
    quantityFulfilled: 0,
    quantityPending: 5,
    unitPriceRef: 90,
    lineTotal: 450,
    ...overrides,
  };
}

function order(overrides: Partial<SalesOrder> = {}): SalesOrder {
  return {
    id: ORDER_ID,
    code: 'SO-0042',
    status: 'PARTIALLY_CONVERTED',
    clientId: 'c1',
    client: {
      id: 'c1',
      code: 'CLI-0042',
      name: 'Pulpería La Esperanza',
      contactName: null,
      phone: null,
      address: null,
      imageUrl: null,
      latitude: 14.1,
      longitude: -87.2,
    },
    takenById: 'u1',
    takenBy: { id: 'u1', fullName: 'Juan Pérez' },
    assignedToId: SELLER_ID,
    assignedTo: { id: SELLER_ID, fullName: 'María López' },
    assignedById: null,
    assignedAt: '2026-08-20T16:00:00.000Z',
    unassignReason: null,
    unassignedById: null,
    unassignedAt: null,
    shiftId: null,
    estimatedTotal: 450,
    expectedDeliveryDate: null,
    notes: null,
    cancelReason: null,
    cancelledById: null,
    cancelledAt: null,
    lineCount: 3,
    unitsOrdered: 13,
    unitsFulfilled: 6,
    unitsPending: 7,
    items: [
      line({ productId: 'p1', quantity: 5, quantityFulfilled: 2, quantityPending: 3 }),
      // Same product on a second line: one dispatch line, summed.
      line({ productId: 'p1', quantity: 4, quantityFulfilled: 0, quantityPending: 4 }),
      // Fully delivered: must not be loaded again.
      line({
        productId: 'p2',
        productName: 'Sal Mineral',
        productSku: 'SAL-MIN',
        quantity: 4,
        quantityFulfilled: 4,
        quantityPending: 0,
      }),
    ],
    fulfillments: [],
    createdAt: '2026-08-20T15:00:00.000Z',
    updatedAt: '2026-08-20T15:00:00.000Z',
    ...overrides,
  };
}

const CREATED = { id: 'd1', deliveryOrderNumber: 4821 } as Dispatch;

const TAKEN = {
  status: 409,
  code: 'DISPATCH_ORDER_NUMBER_TAKEN',
  message: 'Ese número de orden ya fue usado en otro despacho.',
};

describe('CreateDispatchDialog', () => {
  let fixture: ComponentFixture<CreateDispatchDialog>;
  let cmp: DialogInternals;
  let create: Mock<(payload: CreateDispatchPayload) => Observable<Dispatch>>;
  let created: Dispatch[];

  beforeEach(async () => {
    create = vi.fn(() => of(CREATED));

    await TestBed.configureTestingModule({
      imports: [CreateDispatchDialog],
      providers: [{ provide: DispatchDataClient, useValue: { create } }],
    }).compileComponents();

    fixture = TestBed.createComponent(CreateDispatchDialog);
    fixture.componentRef.setInput('order', order());
    fixture.componentRef.setInput('visible', true);
    fixture.detectChanges();
    await fixture.whenStable();

    cmp = fixture.componentInstance as unknown as DialogInternals;
    created = [];
    fixture.componentInstance.created.subscribe((d) => created.push(d));
  });

  /** The dialog renders into `document.body`, outside the fixture's element. */
  function text(): string {
    return (document.body.textContent ?? '').replace(/\s+/g, ' ');
  }

  function button(label: string): HTMLButtonElement {
    const match = Array.from(document.body.querySelectorAll('button')).find(
      (b) => b.textContent?.includes(label),
    );
    if (!match) {
      throw new Error(`No button labelled "${label}" is rendered`);
    }
    return match;
  }

  function alertText(): string | null {
    const alert = document.body.querySelector('form [role="alert"]');
    return alert?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
  }

  function fill(deliveryOrderNumber: number | null): void {
    cmp.form.patchValue({ date: new Date(2026, 6, 15), deliveryOrderNumber });
    fixture.detectChanges();
  }

  async function clickSubmit(): Promise<void> {
    button('Crear despacho').click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('shows the seller and the lines still owed, one per product', () => {
    expect(cmp.sellerName()).toBe('María López');
    // Two p1 lines collapse into the one line the dispatch will carry.
    expect(cmp.pendingItems()).toEqual([
      { productId: 'p1', quantity: 7, productName: 'Concentrado Engorde', productSku: 'CONC-ENG' },
    ]);

    const rendered = text();
    expect(rendered).toContain('María López');
    expect(rendered).toContain('7× Concentrado Engorde');
    expect(rendered).not.toContain('Sal Mineral');
  });

  it('warns that a load may already be on its way', () => {
    expect(text()).toContain(
      'Si esta preventa ya tiene un despacho en camino, no crees otro.',
    );
  });

  describe('delivery order number bounds', () => {
    it('refuses to submit without one', async () => {
      await cmp.submit();

      expect(create).not.toHaveBeenCalled();
      expect(created).toEqual([]);
    });

    it('refuses zero — below the API minimum', async () => {
      fill(0);
      await cmp.submit();

      expect(create).not.toHaveBeenCalled();
    });

    it('refuses a decimal — the API types it as an integer', async () => {
      fill(4821.5);
      await cmp.submit();

      expect(create).not.toHaveBeenCalled();
    });

    it('accepts the API minimum itself', async () => {
      fill(MIN_DELIVERY_ORDER_NUMBER);
      await cmp.submit();

      expect(create).toHaveBeenCalledTimes(1);
      const [payload] = create.mock.calls[0] as [CreateDispatchPayload];
      expect(payload.deliveryOrderNumber).toBe(MIN_DELIVERY_ORDER_NUMBER);
    });
  });

  /**
   * The whole point of the dialog: everything but the day and the paper's
   * number comes from the order, pending units only, duplicates summed.
   */
  it('creates the dispatch from the order and what the user typed', async () => {
    fill(4821);

    await clickSubmit();

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      sellerId: SELLER_ID,
      date: '2026-07-15',
      deliveryOrderNumber: 4821,
      items: [{ productId: 'p1', quantity: 7 }],
      notes: 'Preventa SO-0042',
    });
    expect(created).toEqual([CREATED]);
    expect(fixture.componentInstance.visible()).toBe(false);
  });

  /**
   * A taken number cannot be fixed by retrying — the user has to read the
   * message and type a different one, so the dialog stays open with it.
   */
  it('stays open and names the problem when the order number is taken', async () => {
    create.mockReturnValueOnce(throwError(() => TAKEN));
    fill(4821);

    await clickSubmit();

    expect(created).toEqual([]);
    expect(fixture.componentInstance.visible()).toBe(true);
    expect(alertText()).toBe(
      'Ese número de orden de entrega ya está en uso. Escribí otro.',
    );
    // The number is kept so the user can edit it, not retype it.
    expect(cmp.form.getRawValue().deliveryOrderNumber).toBe(4821);
  });

  it('surfaces the per-field detail of a validation failure', async () => {
    create.mockReturnValueOnce(
      throwError(() => ({
        status: 400,
        code: 'VALIDATION_FAILED',
        message: 'Revisá los datos ingresados.',
        details: {
          fields: [
            { field: 'items.0.quantity', messages: ['must be a positive number'] },
          ],
        },
      })),
    );
    fill(4821);

    await clickSubmit();

    expect(fixture.componentInstance.visible()).toBe(true);
    expect(alertText()).toContain('Revisá los datos ingresados.');
    expect(alertText()).toContain('items.0.quantity — must be a positive number');
    expect(cmp.fieldErrors()).toEqual([
      { field: 'items.0.quantity', messages: ['must be a positive number'] },
    ]);
  });

  /**
   * A stale error or number from the last attempt must not greet the next
   * one: closing — by any route — and reopening starts from a blank form.
   */
  it('starts blank again after cancelling out of a failed attempt', async () => {
    create.mockReturnValueOnce(throwError(() => TAKEN));
    fill(4821);
    await clickSubmit();
    expect(alertText()).not.toBeNull();

    button('Cancelar').click();
    fixture.detectChanges();
    expect(fixture.componentInstance.visible()).toBe(false);

    fixture.componentRef.setInput('visible', true);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(alertText()).toBeNull();
    expect(cmp.error()).toBeNull();
    const { date, deliveryOrderNumber } = cmp.form.getRawValue();
    expect(deliveryOrderNumber).toBeNull();
    const today = new Date();
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    ]);
  });
});
