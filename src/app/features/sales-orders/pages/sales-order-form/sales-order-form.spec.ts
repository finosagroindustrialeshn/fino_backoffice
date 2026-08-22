import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { of, type Observable } from 'rxjs';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import type { Paginated } from '../../../../core/http/pagination.model';
import type { Client, ClientDetail } from '../../../clients/models/client.model';
import { ClientDataClient } from '../../../clients/services/client-data';
import type { Product } from '../../../products/models/product.model';
import { ProductDataClient } from '../../../products/services/product-data';
import type {
  SalesOrder,
  UpdateSalesOrderPayload,
} from '../../models/sales-order.model';
import { SalesOrderDataClient } from '../../services/sales-order-data';
import { SalesOrderForm } from './sales-order-form';

const ORDER_ID = '55555555-5555-4555-8555-555555555555';
const CLIENT_ID = '66666666-6666-4666-8666-666666666666';

/**
 * Test-only view of the members the template binds to. They are `protected`
 * on the component (template-visible, not public API), so the spec reaches
 * them through one explicit structural cast instead of scattering `any`.
 */
interface FormInternals {
  save(): Promise<void>;
  readonly lines: {
    (): readonly { productId: string; quantity: number; unitPriceRef?: number }[];
    set(value: readonly { productId: string; quantity: number; unitPriceRef?: number }[]): void;
  };
  readonly form: {
    patchValue(value: Record<string, unknown>): void;
  };
  formError(): string | null;
}

function paginated<T>(items: readonly T[]): Paginated<T> {
  return {
    items,
    meta: {
      page: 1,
      pageSize: 100,
      total: items.length,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  };
}

const TAKEN_BY_ID = '77777777-7777-4777-8777-777777777777';

/** A preventista negotiated 18.50 on a product whose catalog price is 25. */
const ORDER: SalesOrder = {
  id: ORDER_ID,
  code: 'SO-0042',
  status: 'PLACED',
  clientId: CLIENT_ID,
  client: {
    id: CLIENT_ID,
    code: 'CLI-0042',
    name: 'Pulpería La Esperanza',
    contactName: null,
    phone: null,
    address: null,
    imageUrl: null,
    latitude: 14.1,
    longitude: -87.2,
  },
  takenById: TAKEN_BY_ID,
  takenBy: { id: TAKEN_BY_ID, fullName: 'Juan Pérez' },
  assignedToId: null,
  assignedTo: null,
  assignedById: null,
  assignedAt: null,
  unassignReason: null,
  unassignedById: null,
  unassignedAt: null,
  shiftId: null,
  estimatedTotal: 370,
  expectedDeliveryDate: '2026-08-21',
  notes: 'Pasa el viernes',
  cancelReason: null,
  cancelledById: null,
  cancelledAt: null,
  lineCount: 1,
  unitsOrdered: 20,
  unitsFulfilled: 0,
  unitsPending: 20,
  items: [
    {
      productId: 'p1',
      productName: 'Producto p1',
      productSku: 'SKU-p1',
      productImageUrl: null,
      quantity: 20,
      quantityFulfilled: 0,
      quantityPending: 20,
      unitPriceRef: 18.5,
      lineTotal: 370,
    },
  ],
  fulfillments: [],
  createdAt: '2026-08-20T15:00:00.000Z',
  updatedAt: '2026-08-20T15:00:00.000Z',
};

function product(id: string, price: number): Product {
  return {
    id,
    name: `Producto ${id}`,
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

describe('SalesOrderForm (edit)', () => {
  let fixture: ComponentFixture<SalesOrderForm>;
  let cmp: FormInternals;
  let update: Mock<(...args: unknown[]) => Observable<SalesOrder>>;

  beforeEach(async () => {
    update = vi.fn(() => of(ORDER));

    await TestBed.configureTestingModule({
      imports: [SalesOrderForm],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: convertToParamMap({ id: ORDER_ID }) },
          },
        },
        { provide: Router, useValue: { navigate: vi.fn(() => Promise.resolve(true)) } },
        {
          provide: SalesOrderDataClient,
          useValue: {
            get: vi.fn(() => of(ORDER)),
            update,
            create: vi.fn(() => of(ORDER)),
          },
        },
        {
          provide: ClientDataClient,
          useValue: {
            list: vi.fn(() =>
              of(paginated<Client>([{ id: CLIENT_ID, code: 'CLI-0042', name: 'Pulpería La Esperanza' } as Client])),
            ),
            get: vi.fn(() => of({} as ClientDetail)),
          },
        },
        {
          provide: ProductDataClient,
          useValue: {
            // Catalog price is 25 — deliberately different from the 18.50
            // the order was taken at.
            list: vi.fn(() => of(paginated([product('p1', 25), product('p2', 40)]))),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SalesOrderForm);
    fixture.detectChanges();
    await fixture.whenStable();
    cmp = fixture.componentInstance as unknown as FormInternals;
  });

  it('loads the stored lines with the price they were quoted at', () => {
    expect(cmp.lines()).toEqual([
      { productId: 'p1', quantity: 20, unitPriceRef: 18.5 },
    ]);
  });

  it('sends every line with its unitPriceRef, never repricing from the catalog', async () => {
    await cmp.save();

    expect(update).toHaveBeenCalledTimes(1);
    const [, payload] = update.mock.calls[0] as [string, UpdateSalesOrderPayload];
    expect(payload.items).toEqual([
      { productId: 'p1', quantity: 20, unitPriceRef: 18.5 },
    ]);
  });

  it('never sends the client on an update — that would be a different order', async () => {
    await cmp.save();

    const [, payload] = update.mock.calls[0] as [string, UpdateSalesOrderPayload];
    expect(payload).not.toHaveProperty('clientId');
  });

  it('sends the delivery date as a plain day, not a timestamp', async () => {
    await cmp.save();

    const [, payload] = update.mock.calls[0] as [string, UpdateSalesOrderPayload];
    expect(payload.expectedDeliveryDate).toBe('2026-08-21');
  });

  it('clears the date with an explicit null when it is removed', async () => {
    cmp.form.patchValue({ expectedDeliveryDate: null });
    await cmp.save();

    const [, payload] = update.mock.calls[0] as [string, UpdateSalesOrderPayload];
    expect(payload.expectedDeliveryDate).toBeNull();
  });

  it('refuses to save an order with no products', async () => {
    cmp.lines.set([]);
    await cmp.save();

    expect(update).not.toHaveBeenCalled();
    expect(cmp.formError()).toContain('al menos un producto');
  });
});

describe('SalesOrderForm (create)', () => {
  let fixture: ComponentFixture<SalesOrderForm>;
  let cmp: FormInternals;
  let create: Mock<(...args: unknown[]) => Observable<SalesOrder>>;

  beforeEach(async () => {
    create = vi.fn(() => of(ORDER));

    await TestBed.configureTestingModule({
      imports: [SalesOrderForm],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({}) } },
        },
        { provide: Router, useValue: { navigate: vi.fn(() => Promise.resolve(true)) } },
        {
          provide: SalesOrderDataClient,
          useValue: { get: vi.fn(() => of(ORDER)), update: vi.fn(() => of(ORDER)), create },
        },
        {
          provide: ClientDataClient,
          useValue: {
            list: vi.fn(() =>
              of(paginated<Client>([{ id: CLIENT_ID, code: 'CLI-0042', name: 'Pulpería La Esperanza' } as Client])),
            ),
            get: vi.fn(() => of({} as ClientDetail)),
          },
        },
        {
          provide: ProductDataClient,
          useValue: { list: vi.fn(() => of(paginated([product('p1', 25)]))) },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SalesOrderForm);
    fixture.detectChanges();
    await fixture.whenStable();
    cmp = fixture.componentInstance as unknown as FormInternals;

    cmp.form.patchValue({ clientId: CLIENT_ID });
    cmp.lines.set([{ productId: 'p1', quantity: 3, unitPriceRef: 25 }]);
  });

  it('sends an Idempotency-Key so a lost request cannot promise the same thing twice', async () => {
    await cmp.save();

    expect(create).toHaveBeenCalledTimes(1);
    const [, key] = create.mock.calls[0] as [unknown, string];
    expect(key).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it('reuses the key when the same order is retried after a failure', async () => {
    // A dropped response is indistinguishable from a request that never
    // arrived: retrying with the SAME key lets the API replay the original
    // instead of taking the order a second time.
    create.mockImplementationOnce(() => {
      throw new Error('network');
    });

    await cmp.save();
    await cmp.save();

    expect(create).toHaveBeenCalledTimes(2);
    const [, firstKey] = create.mock.calls[0] as [unknown, string];
    const [, secondKey] = create.mock.calls[1] as [unknown, string];
    expect(secondKey).toBe(firstKey);
  });

  it('mints a new key once the order itself changed', async () => {
    create.mockImplementationOnce(() => {
      throw new Error('network');
    });

    await cmp.save();
    // The client asked for more: this is a different promise, not a retry.
    cmp.lines.set([{ productId: 'p1', quantity: 10, unitPriceRef: 25 }]);
    await cmp.save();

    const [, firstKey] = create.mock.calls[0] as [unknown, string];
    const [, secondKey] = create.mock.calls[1] as [unknown, string];
    expect(secondKey).not.toBe(firstKey);
  });
});
