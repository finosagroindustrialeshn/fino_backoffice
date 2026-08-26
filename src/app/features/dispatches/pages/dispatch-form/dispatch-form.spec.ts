import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { of, throwError, type Observable } from 'rxjs';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import type { UserProfile } from '../../../../core/auth/user-profile.model';
import type { Paginated } from '../../../../core/http/pagination.model';
import type { Product } from '../../../products/models/product.model';
import { ProductDataClient } from '../../../products/services/product-data';
import { ReportsInventoryDataClient } from '../../../reports/services/reports-inventory-data';
import { UserDataClient } from '../../../users/services/user-data';
import type {
  CreateDispatchPayload,
  Dispatch,
} from '../../models/dispatch.model';
import { DispatchDataClient } from '../../services/dispatch-data';
import { DispatchForm } from './dispatch-form';

const SELLER_ID = '11111111-1111-4111-8111-111111111111';

/**
 * Test-only view of the members the template binds to. They are `protected`
 * on the component, so the spec reaches them through one structural cast
 * instead of scattering `any`.
 */
interface FormInternals {
  submit(): Promise<void>;
  readonly form: {
    patchValue(value: Record<string, unknown>): void;
    readonly invalid: boolean;
  };
  readonly quantities: {
    set(value: Record<string, number>): void;
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

function product(id: string): Product {
  return {
    id,
    name: `Producto ${id}`,
    sku: `SKU-${id}`,
    description: null,
    imageUrl: null,
    technicalSheetUrl: null,
    composition: null,
    cost: 10,
    price: 20,
    categoryId: null,
    presentationId: null,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

const CREATED = { id: 'd1' } as Dispatch;

describe('DispatchForm', () => {
  let fixture: ComponentFixture<DispatchForm>;
  let cmp: FormInternals;
  let create: Mock<(...args: unknown[]) => Observable<Dispatch>>;

  /** A complete, valid form — each test then breaks exactly one thing. */
  function fillValidForm(): void {
    cmp.form.patchValue({
      sellerId: SELLER_ID,
      date: new Date(2026, 6, 15),
      deliveryOrderNumber: 4821,
    });
    cmp.quantities.set({ p1: 10 });
  }

  beforeEach(async () => {
    create = vi.fn(() => of(CREATED));

    await TestBed.configureTestingModule({
      imports: [DispatchForm],
      providers: [
        // The template links back to the list, so RouterLink needs both.
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
        { provide: DispatchDataClient, useValue: { create } },
        {
          provide: UserDataClient,
          useValue: {
            list: vi.fn(() =>
              of(
                paginated<UserProfile>([
                  { id: SELLER_ID, fullName: 'Juan Pérez' } as UserProfile,
                ]),
              ),
            ),
          },
        },
        {
          provide: ProductDataClient,
          useValue: { list: vi.fn(() => of(paginated([product('p1')]))) },
        },
        {
          provide: ReportsInventoryDataClient,
          useValue: {
            stock: vi.fn(() =>
              of(paginated([{ productId: 'p1', available: 100 }])),
            ),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DispatchForm);
    fixture.detectChanges();
    await fixture.whenStable();
    cmp = fixture.componentInstance as unknown as FormInternals;
  });

  it('sends the delivery order number the API requires', async () => {
    fillValidForm();
    await cmp.submit();

    expect(create).toHaveBeenCalledTimes(1);
    const [payload] = create.mock.calls[0] as [CreateDispatchPayload];
    expect(payload.deliveryOrderNumber).toBe(4821);
  });

  it('sends the dispatch day as a plain day, not a timestamp', async () => {
    fillValidForm();
    await cmp.submit();

    const [payload] = create.mock.calls[0] as [CreateDispatchPayload];
    expect(payload.date).toBe('2026-07-15');
  });

  /**
   * The whole point of the client-side rule: without it the request leaves
   * without the field and comes back 400 VALIDATION_FAILED, which is what
   * users were hitting.
   */
  it('refuses to submit without a delivery order number', async () => {
    fillValidForm();
    cmp.form.patchValue({ deliveryOrderNumber: null });

    await cmp.submit();

    expect(create).not.toHaveBeenCalled();
  });

  it('refuses a delivery order number below the API minimum of 1', async () => {
    fillValidForm();
    cmp.form.patchValue({ deliveryOrderNumber: 0 });

    await cmp.submit();

    expect(create).not.toHaveBeenCalled();
  });

  /**
   * The API types the field as an integer. A decimal would be rejected
   * server-side, so it must never leave the form.
   */
  it('refuses a non-integer delivery order number', async () => {
    fillValidForm();
    cmp.form.patchValue({ deliveryOrderNumber: 48.5 });

    await cmp.submit();

    expect(create).not.toHaveBeenCalled();
  });

  /**
   * A taken number cannot be fixed by retrying — the user has to read the
   * message and type a different one, so it must reach the screen.
   */
  it('surfaces a taken order number instead of failing silently', async () => {
    create.mockReturnValueOnce(
      throwError(() => ({
        status: 409,
        code: 'DISPATCH_ORDER_NUMBER_TAKEN',
        message: 'Ese número de orden ya fue usado en otro despacho.',
      })),
    );
    fillValidForm();

    await cmp.submit();

    expect(cmp.formError()).toBe(
      'Ese número de orden ya fue usado en otro despacho.',
    );
  });
});
