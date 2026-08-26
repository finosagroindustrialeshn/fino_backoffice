import { describe, expect, it } from 'vitest';

import type { Role } from '../../../core/auth/user-profile.model';
import {
  canAssignOrder,
  canCancelOrder,
  canEditOrder,
  canPlaceOrder,
  canUnassignOrder,
  isCancelReasonRequired,
  isOrderClosed,
  isOverdue,
  toLineInputs,
  type SalesOrder,
  type SalesOrderItem,
  type SalesOrderStatus,
} from './sales-order.model';

const PRESELLER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';
const SELLER_ID = '88888888-8888-4888-8888-888888888888';

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
    id: '33333333-3333-4333-8333-333333333333',
    code: 'SO-0042',
    status: 'DRAFT',
    clientId: '44444444-4444-4444-8444-444444444444',
    client: {
      id: '44444444-4444-4444-8444-444444444444',
      code: 'CLI-0042',
      name: 'Pulpería La Esperanza',
      contactName: null,
      phone: null,
      address: null,
      imageUrl: null,
      latitude: 14.1,
      longitude: -87.2,
    },
    takenById: PRESELLER_ID,
    takenBy: { id: PRESELLER_ID, fullName: 'Juan Pérez' },
    assignedToId: null,
    assignedTo: null,
    assignedById: null,
    assignedAt: null,
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
    lineCount: 0,
    unitsOrdered: 0,
    unitsFulfilled: 0,
    unitsPending: 0,
    items: [],
    fulfillments: [],
    createdAt: '2026-08-20T15:00:00.000Z',
    updatedAt: '2026-08-20T15:00:00.000Z',
    ...overrides,
  };
}

/** An order actually held by a seller — the precondition for unassigning. */
function assignedTo(status: SalesOrderStatus): SalesOrder {
  return order({
    status,
    assignedToId: SELLER_ID,
    assignedTo: { id: SELLER_ID, fullName: 'María López' },
    assignedAt: '2026-08-20T16:00:00.000Z',
  });
}

const ALL_STATUSES: readonly SalesOrderStatus[] = [
  'DRAFT',
  'PLACED',
  'ASSIGNED',
  'PARTIALLY_CONVERTED',
  'CONVERTED',
  'CANCELLED',
];

describe('isOrderClosed', () => {
  it('closes only CONVERTED and CANCELLED', () => {
    const closed = ALL_STATUSES.filter((status) => isOrderClosed(status));
    expect(closed).toEqual(['CONVERTED', 'CANCELLED']);
  });
});

describe('canEditOrder', () => {
  const backOffice: readonly Role[] = ['ADMIN', 'SUPERVISOR'];

  it('lets the back office correct anything still open', () => {
    for (const role of backOffice) {
      const editable = ALL_STATUSES.filter((status) =>
        canEditOrder(order({ status }), role, OTHER_USER_ID),
      );
      expect(editable).toEqual([
        'DRAFT',
        'PLACED',
        'ASSIGNED',
        'PARTIALLY_CONVERTED',
      ]);
    }
  });

  it('lets a preventista fix only their own DRAFT', () => {
    const editable = ALL_STATUSES.filter((status) =>
      canEditOrder(order({ status }), 'PRESELLER', PRESELLER_ID),
    );
    expect(editable).toEqual(['DRAFT']);
  });

  it('refuses a preventista editing a draft somebody else took', () => {
    expect(canEditOrder(order(), 'PRESELLER', OTHER_USER_ID)).toBe(false);
  });

  it('refuses roles that never correct orders', () => {
    expect(canEditOrder(order(), 'SELLER', PRESELLER_ID)).toBe(false);
    expect(canEditOrder(order(), 'ACCOUNTANT', OTHER_USER_ID)).toBe(false);
  });

  it('refuses everyone once the order is closed', () => {
    for (const status of ['CONVERTED', 'CANCELLED'] as const) {
      expect(canEditOrder(order({ status }), 'ADMIN', OTHER_USER_ID)).toBe(false);
    }
  });
});

describe('canPlaceOrder', () => {
  it('only hands in a DRAFT that has lines', () => {
    expect(canPlaceOrder(order({ items: [line()] }))).toBe(true);
  });

  it('refuses an empty draft — the API answers SALES_ORDER_EMPTY', () => {
    expect(canPlaceOrder(order())).toBe(false);
  });

  it('refuses an order already handed in', () => {
    expect(canPlaceOrder(order({ status: 'PLACED', items: [line()] }))).toBe(
      false,
    );
  });
});

describe('canAssignOrder', () => {
  it('assigns from PLACED and REASSIGNS from ASSIGNED or PARTIALLY_CONVERTED', () => {
    // Reassigning is the same operation aimed at somebody else: a seller who
    // falls ill must not force cancelling a promise the client never withdrew.
    const assignable = ALL_STATUSES.filter((status) =>
      canAssignOrder(order({ status })),
    );
    expect(assignable).toEqual(['PLACED', 'ASSIGNED', 'PARTIALLY_CONVERTED']);
  });

  it('refuses a closed order', () => {
    expect(canAssignOrder(order({ status: 'CONVERTED' }))).toBe(false);
    expect(canAssignOrder(order({ status: 'CANCELLED' }))).toBe(false);
  });

  it('refuses a draft the office has not even received', () => {
    expect(canAssignOrder(order({ status: 'DRAFT' }))).toBe(false);
  });
});

describe('canUnassignOrder', () => {
  it('releases an order somebody is actually holding', () => {
    expect(canUnassignOrder(assignedTo('ASSIGNED'))).toBe(true);
    expect(canUnassignOrder(assignedTo('PARTIALLY_CONVERTED'))).toBe(true);
  });

  it('refuses when nobody holds it — there is nothing to hand back from', () => {
    expect(canUnassignOrder(order({ status: 'PLACED' }))).toBe(false);
  });

  it('refuses a draft and a closed order', () => {
    expect(canUnassignOrder(assignedTo('DRAFT'))).toBe(false);
    expect(canUnassignOrder(assignedTo('CONVERTED'))).toBe(false);
    expect(canUnassignOrder(assignedTo('CANCELLED'))).toBe(false);
  });
});

describe('canCancelOrder', () => {
  it('cancels anything still open, including a partially delivered order', () => {
    const cancellable = ALL_STATUSES.filter((status) =>
      canCancelOrder(order({ status })),
    );
    expect(cancellable).toEqual([
      'DRAFT',
      'PLACED',
      'ASSIGNED',
      'PARTIALLY_CONVERTED',
    ]);
  });
});

describe('isCancelReasonRequired', () => {
  it('does not ask for a reason on a draft nobody else has seen', () => {
    expect(isCancelReasonRequired('DRAFT')).toBe(false);
  });

  it('asks for a reason once the client was promised something', () => {
    for (const status of ['PLACED', 'ASSIGNED', 'PARTIALLY_CONVERTED'] as const) {
      expect(isCancelReasonRequired(status)).toBe(true);
    }
  });
});

describe('toLineInputs', () => {
  it('carries the quoted price forward', () => {
    // The PATCH body defaults a line with no unitPriceRef back to the catalog
    // price, so dropping it would silently overwrite a negotiated price the
    // preventista agreed with the client.
    const negotiated = order({
      items: [
        line({ productId: 'p1', quantity: 20, unitPriceRef: 18.5 }),
        line({ productId: 'p2', quantity: 4, quantityFulfilled: 1, unitPriceRef: 300 }),
      ],
    });

    expect(toLineInputs(negotiated)).toEqual([
      { productId: 'p1', quantity: 20, unitPriceRef: 18.5 },
      { productId: 'p2', quantity: 4, unitPriceRef: 300 },
    ]);
  });
});

describe('isOverdue', () => {
  const TODAY = '2026-08-21';

  it('flags a promise whose day has gone by', () => {
    const late = order({ status: 'ASSIGNED', expectedDeliveryDate: '2026-08-19' });
    expect(isOverdue(late, TODAY)).toBe(true);
  });

  it('does not flag today — the day is not over yet', () => {
    const dueToday = order({ status: 'ASSIGNED', expectedDeliveryDate: TODAY });
    expect(isOverdue(dueToday, TODAY)).toBe(false);
  });

  it('never flags an order that named no day: "cuando pasen" cannot be late', () => {
    const noDate = order({ status: 'ASSIGNED', expectedDeliveryDate: null });
    expect(isOverdue(noDate, TODAY)).toBe(false);
  });

  it('does not flag a closed order, however old the promise was', () => {
    for (const status of ['CONVERTED', 'CANCELLED'] as const) {
      const closed = order({ status, expectedDeliveryDate: '2026-01-01' });
      expect(isOverdue(closed, TODAY)).toBe(false);
    }
  });
});
