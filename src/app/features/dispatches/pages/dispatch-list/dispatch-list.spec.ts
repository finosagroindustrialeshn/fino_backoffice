import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { of, type Observable } from 'rxjs';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import { AuthSession } from '../../../../core/auth/auth-session';
import type { Paginated } from '../../../../core/http/pagination.model';
import { ProductDataClient } from '../../../products/services/product-data';
import { UserDataClient } from '../../../users/services/user-data';
import type { Dispatch, DispatchStatus } from '../../models/dispatch.model';
import { DispatchDataClient } from '../../services/dispatch-data';
import { DispatchList } from './dispatch-list';

const DISPATCH_ID = '22222222-2222-4222-8222-222222222222';

/** Test-only view of the protected members the template binds to. */
interface ListInternals {
  openDetail(dispatch: { id: string }): void;
  confirmCancel(): Promise<void>;
  readonly cancelReason: { set(value: string): void };
  readonly detail: { set(value: Dispatch): void };
  canConfirmCancel(): boolean;
  isCancelReasonRequired(): boolean;
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

function dispatch(status: DispatchStatus): Dispatch {
  return {
    id: DISPATCH_ID,
    sellerId: 'seller-1',
    date: '2026-07-15T00:00:00.000Z',
    status,
    deliveryOrderNumber: 4821,
    notes: null,
    createdById: null,
    cancelReason: null,
    cancelledById: null,
    cancelledAt: null,
    createdAt: '2026-07-15T00:00:00.000Z',
    updatedAt: '2026-07-15T00:00:00.000Z',
    items: [{ id: 'i1', productId: 'p1', quantity: 10 }],
  };
}

describe('DispatchList cancellation', () => {
  let fixture: ComponentFixture<DispatchList>;
  let cmp: ListInternals;
  let cancel: Mock<(...args: unknown[]) => Observable<Dispatch>>;

  beforeEach(async () => {
    cancel = vi.fn(() => of(dispatch('CANCELLED')));

    await TestBed.configureTestingModule({
      imports: [DispatchList],
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: convertToParamMap({}) } },
        },
        {
          provide: Router,
          useValue: {
            navigate: vi.fn(() => Promise.resolve(true)),
            createUrlTree: vi.fn(() => ({})),
            serializeUrl: vi.fn(() => '/despacho'),
            events: of(),
          },
        },
        {
          provide: DispatchDataClient,
          useValue: {
            list: vi.fn(() => of(paginated([dispatch('ASSIGNED')]))),
            get: vi.fn(() => of(dispatch('ASSIGNED'))),
            cancel,
            assign: vi.fn(() => of(dispatch('ASSIGNED'))),
            receive: vi.fn(() => of(dispatch('RECEIVED'))),
          },
        },
        { provide: UserDataClient, useValue: { list: vi.fn(() => of(paginated([]))) } },
        { provide: ProductDataClient, useValue: { list: vi.fn(() => of(paginated([]))) } },
        { provide: AuthSession, useValue: { role: () => 'ADMIN' } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DispatchList);
    fixture.detectChanges();
    await fixture.whenStable();
    cmp = fixture.componentInstance as unknown as ListInternals;
  });

  /**
   * The API rejects a reasonless cancellation of an ASSIGNED dispatch with
   * CANCEL_REASON_REQUIRED. Sending one anyway just burns a round trip.
   */
  it('will not cancel an assigned dispatch without a reason', async () => {
    cmp.detail.set(dispatch('ASSIGNED'));
    cmp.cancelReason.set('');

    expect(cmp.canConfirmCancel()).toBe(false);
    await cmp.confirmCancel();
    expect(cancel).not.toHaveBeenCalled();
  });

  it('will not accept a reason shorter than the API minimum', async () => {
    cmp.detail.set(dispatch('ASSIGNED'));
    cmp.cancelReason.set('no');

    expect(cmp.canConfirmCancel()).toBe(false);
    await cmp.confirmCancel();
    expect(cancel).not.toHaveBeenCalled();
  });

  it('sends the reason when cancelling an assigned dispatch', async () => {
    cmp.detail.set(dispatch('ASSIGNED'));
    cmp.cancelReason.set('El papel dice 20 sacos, me entregaron 18');

    expect(cmp.canConfirmCancel()).toBe(true);
    await cmp.confirmCancel();

    expect(cancel).toHaveBeenCalledWith(DISPATCH_ID, {
      reason: 'El papel dice 20 sacos, me entregaron 18',
    });
  });

  /**
   * A DRAFT is the back office discarding its own unassigned work — nobody is
   * refusing anybody, so the API leaves the reason optional.
   */
  it('cancels a draft without demanding a reason', async () => {
    cmp.detail.set(dispatch('DRAFT'));
    cmp.cancelReason.set('');

    expect(cmp.isCancelReasonRequired()).toBe(false);
    expect(cmp.canConfirmCancel()).toBe(true);
    await cmp.confirmCancel();

    expect(cancel).toHaveBeenCalledWith(DISPATCH_ID, {});
  });

  it('sends an optional reason on a draft when one was typed', async () => {
    cmp.detail.set(dispatch('DRAFT'));
    cmp.cancelReason.set('Se armó por error');

    await cmp.confirmCancel();

    expect(cancel).toHaveBeenCalledWith(DISPATCH_ID, {
      reason: 'Se armó por error',
    });
  });
});
