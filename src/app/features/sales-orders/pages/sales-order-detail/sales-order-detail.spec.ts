import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { of, type Observable } from 'rxjs';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { AuthSession } from '../../../../core/auth/auth-session';
import type { Paginated } from '../../../../core/http/pagination.model';
import type { Dispatch } from '../../../dispatches/models/dispatch.model';
import { DispatchDataClient } from '../../../dispatches/services/dispatch-data';
import { UserDataClient } from '../../../users/services/user-data';
import type {
  SalesOrder,
  SalesOrderItem,
} from '../../models/sales-order.model';
import { SalesOrderDataClient } from '../../services/sales-order-data';
import { SalesOrderDetail } from './sales-order-detail';

const ORDER_ID = '33333333-3333-4333-8333-333333333333';
const SELLER_ID = '88888888-8888-4888-8888-888888888888';

/** Test-only view of the protected members the template binds to. */
interface DetailInternals {
  openDispatchDialog(): void;
  onDispatchCreated(dispatch: Dispatch): void;
  canDispatch(): boolean;
  dispatchDialogOpen(): boolean;
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
    status: 'ASSIGNED',
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
    expectedDeliveryDate: '2026-08-25',
    notes: null,
    cancelReason: null,
    cancelledById: null,
    cancelledAt: null,
    lineCount: 1,
    unitsOrdered: 5,
    unitsFulfilled: 0,
    unitsPending: 5,
    items: [line()],
    fulfillments: [],
    createdAt: '2026-08-20T15:00:00.000Z',
    updatedAt: '2026-08-20T15:00:00.000Z',
    ...overrides,
  };
}

describe('SalesOrderDetail — create dispatch', () => {
  let fixture: ComponentFixture<SalesOrderDetail>;
  let cmp: DetailInternals;
  let navigate: Mock<(...args: unknown[]) => Promise<boolean>>;
  let get: Mock<(id: string) => Observable<SalesOrder>>;

  async function mount(loaded: SalesOrder): Promise<void> {
    get.mockReturnValue(of(loaded));
    fixture = TestBed.createComponent(SalesOrderDetail);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    cmp = fixture.componentInstance as unknown as DetailInternals;
  }

  function dispatchButton(): HTMLButtonElement | null {
    const buttons = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    );
    return (
      buttons.find((b) => b.textContent?.includes('Crear despacho')) ?? null
    );
  }

  async function configure(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [SalesOrderDetail],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: convertToParamMap({ id: ORDER_ID }) },
          },
        },
        {
          provide: Router,
          useValue: {
            navigate,
            // RouterLink hrefs echo their commands, so a link can be asserted.
            createUrlTree: vi.fn((commands: unknown[]) => commands),
            serializeUrl: vi.fn((tree: unknown) =>
              Array.isArray(tree) ? tree.join('/') : String(tree),
            ),
            events: of(),
          },
        },
        { provide: SalesOrderDataClient, useValue: { get } },
        { provide: DispatchDataClient, useValue: { create: vi.fn() } },
        {
          provide: UserDataClient,
          useValue: { list: vi.fn(() => of(paginated([]))) },
        },
        {
          provide: AuthSession,
          useValue: { role: () => 'ADMIN', user: () => ({ id: 'admin-1' }) },
        },
      ],
    }).compileComponents();
  }

  beforeEach(async () => {
    navigate = vi.fn(() => Promise.resolve(true));
    get = vi.fn();
    await configure();
  });

  it('offers a dispatch while a seller holds the order and units are owed', async () => {
    await mount(order({ status: 'ASSIGNED', unitsPending: 5 }));

    expect(cmp.canDispatch()).toBe(true);
    expect(dispatchButton()).not.toBeNull();
  });

  it('hides the shortcut once every unit was delivered', async () => {
    await mount(
      order({ status: 'PARTIALLY_CONVERTED', unitsFulfilled: 5, unitsPending: 0 }),
    );

    expect(cmp.canDispatch()).toBe(false);
    expect(dispatchButton()).toBeNull();
  });

  /** A PLACED order has nobody to load the dispatch for. */
  it('hides the shortcut while nobody holds the order', async () => {
    await mount(
      order({ status: 'PLACED', assignedToId: null, assignedTo: null, unitsPending: 5 }),
    );

    expect(cmp.canDispatch()).toBe(false);
    expect(dispatchButton()).toBeNull();
  });

  it('hides the shortcut on a closed order and on a draft', async () => {
    for (const status of ['DRAFT', 'CONVERTED', 'CANCELLED'] as const) {
      // One component per status: the order is read once, on init.
      TestBed.resetTestingModule();
      await configure();

      await mount(order({ status, unitsPending: 5 }));
      expect(dispatchButton(), status).toBeNull();
    }
  });

  /**
   * The dispatch is created right here, in a dialog — the API has no link
   * between a dispatch and an order, so nothing is gained by leaving the page.
   */
  it('opens the create-dispatch dialog instead of navigating away', async () => {
    await mount(order({ status: 'ASSIGNED', unitsPending: 5 }));

    dispatchButton()?.click();
    fixture.detectChanges();

    expect(cmp.dispatchDialogOpen()).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });

  /**
   * The API keeps no link between a dispatch and an order, so the pending
   * units do not move when a load goes out. Hiding the button for the rest
   * of the visit is what stops the same units from being loaded twice.
   */
  it('retires the button and shows the dispatch once one was created', async () => {
    await mount(order({ status: 'ASSIGNED', unitsPending: 5 }));
    expect(dispatchButton()).not.toBeNull();

    cmp.onDispatchCreated({ id: 'd1', deliveryOrderNumber: 4821 } as Dispatch);
    fixture.detectChanges();

    expect(cmp.canDispatch()).toBe(false);
    expect(dispatchButton()).toBeNull();

    const host = fixture.nativeElement as HTMLElement;
    const banner = host.querySelector('[role="status"]');
    expect(banner?.textContent?.replace(/\s+/g, ' ')).toContain(
      'Despacho creado con la orden de entrega N.° 4821',
    );
    const link = banner?.querySelector('a');
    expect(link?.textContent).toContain('Ver despachos');
    expect(link?.getAttribute('href')).toBe('/despacho');
  });
});
