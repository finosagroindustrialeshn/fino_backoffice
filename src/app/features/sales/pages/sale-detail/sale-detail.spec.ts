import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of, throwError, type Observable } from 'rxjs';
import { vi, type Mock } from 'vitest';

import type { CreateSalePaymentPayload, Sale } from '../../models/sale.model';
import { SaleDataClient } from '../../services/sale-data';
import { SaleDetail } from './sale-detail';

const SALE_ID = '11111111-1111-4111-8111-111111111111';

/**
 * Test-only view of the members the template binds to. They are `protected`
 * on the component (template-visible, not public API), so the spec reaches
 * them through one explicit structural cast instead of scattering `any`.
 */
interface DetailInternals {
  collect(payload: CreateSalePaymentPayload): Promise<void>;
  canCollect(): boolean;
  paymentError(): string | null;
  displayClient(): string;
  displaySeller(): string;
}

/**
 * A sale as GET /sales/{id} returns it: seller and client embedded, so the
 * page needs no lookup of its own to name them.
 */
function sale(overrides: Partial<Sale> = {}): Sale {
  return {
    id: SALE_ID,
    channel: 'FIELD',
    shiftId: null,
    cashSessionId: null,
    sellerId: 'seller-1',
    seller: { id: 'seller-1', fullName: 'Ana Castillo' },
    clientId: 'client-1',
    client: {
      id: 'client-1',
      code: 'CLI-001',
      name: 'Doña Marta',
      contactName: null,
      phone: null,
      address: null,
      imageUrl: null,
      latitude: 14.1,
      longitude: -87.2,
    },
    routeStopId: null,
    settledOrder: null,
    latitude: null,
    longitude: null,
    paymentType: 'CREDIT',
    status: 'PENDING',
    total: 1000,
    amountPaid: 0,
    balanceDue: 1000,
    notes: null,
    createdById: null,
    items: [],
    payments: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('SaleDetail', () => {
  let fixture: ComponentFixture<SaleDetail>;
  let cmp: DetailInternals;
  let addPayment: Mock<(...args: unknown[]) => Observable<Sale>>;

  /** Builds the page around one sale; a test may rebuild it around another. */
  async function setup(loaded: Sale = sale()): Promise<void> {
    TestBed.resetTestingModule();
    addPayment = vi.fn();
    const sales = { get: vi.fn(() => of(loaded)), addPayment };

    await TestBed.configureTestingModule({
      imports: [SaleDetail],
      providers: [
        { provide: SaleDataClient, useValue: sales },
        {
          provide: ActivatedRoute,
          useValue: {
            paramMap: of(convertToParamMap({ id: SALE_ID })),
            snapshot: { paramMap: convertToParamMap({ id: SALE_ID }) },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SaleDetail);
    fixture.detectChanges();
    await fixture.whenStable();

    cmp = fixture.componentInstance as unknown as DetailInternals;
  }

  beforeEach(() => setup());

  /** The `Idempotency-Key` handed to the service, per call. */
  function keysUsed(): string[] {
    return addPayment.mock.calls.map((args) => args[2] as string);
  }

  it('offers to collect on a credit sale with an outstanding balance', () => {
    expect(cmp.canCollect()).toBe(true);
  });

  /** The sale names its own parties, so nothing else is fetched to do it. */
  it('names the parties from the sale itself', () => {
    expect(cmp.displayClient()).toBe('Doña Marta');
    expect(cmp.displaySeller()).toBe('Ana Castillo');
  });

  it('shows a STORE walk-in as the anonymous consumer', async () => {
    await setup(sale({ channel: 'STORE', clientId: null, client: null }));

    expect(cmp.displayClient()).toBe('Consumidor final');
  });

  it('sends an idempotency key with every abono', async () => {
    addPayment.mockReturnValue(
      of(sale({ amountPaid: 400, balanceDue: 600, status: 'PARTIAL' })),
    );

    await cmp.collect({ amount: 400, method: 'CASH' });

    expect(addPayment).toHaveBeenCalledTimes(1);
    expect(keysUsed()[0]).toBeTruthy();
  });

  /**
   * The whole point of the key: the first attempt may have reached the server
   * before the response was lost, so the retry must replay it rather than
   * collect the same money a second time.
   */
  it('reuses the same key when retrying an abono that failed', async () => {
    addPayment.mockReturnValue(throwError(() => ({ message: 'Network down' })));
    await cmp.collect({ amount: 400, method: 'CASH' });
    expect(cmp.paymentError()).toBe('Network down');

    addPayment.mockReturnValue(
      of(sale({ amountPaid: 400, balanceDue: 600, status: 'PARTIAL' })),
    );
    await cmp.collect({ amount: 400, method: 'CASH' });

    const [first, second] = keysUsed();
    expect(addPayment).toHaveBeenCalledTimes(2);
    expect(second).toBe(first);
  });

  /**
   * A different amount is a different operation. Replaying the old key would
   * be rejected as IDEMPOTENCY_KEY_REUSED, so the edit must mint a new one.
   */
  it('mints a new key when the amount is edited after a failure', async () => {
    addPayment.mockReturnValue(throwError(() => ({ message: 'Boom' })));
    await cmp.collect({ amount: 400, method: 'CASH' });

    addPayment.mockReturnValue(
      of(sale({ amountPaid: 500, balanceDue: 500, status: 'PARTIAL' })),
    );
    await cmp.collect({ amount: 500, method: 'CASH' });

    const [first, second] = keysUsed();
    expect(second).not.toBe(first);
  });

  it('mints a new key for the next abono once one succeeds', async () => {
    addPayment.mockReturnValue(
      of(sale({ amountPaid: 400, balanceDue: 600, status: 'PARTIAL' })),
    );
    await cmp.collect({ amount: 400, method: 'CASH' });
    await cmp.collect({ amount: 400, method: 'CASH' });

    const [first, second] = keysUsed();
    expect(second).not.toBe(first);
  });

  it('does not offer to collect once the sale is settled', async () => {
    addPayment.mockReturnValue(
      of(sale({ amountPaid: 1000, balanceDue: 0, status: 'PAID' })),
    );
    await cmp.collect({ amount: 1000, method: 'CASH' });

    expect(cmp.canCollect()).toBe(false);
  });
});
