import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { FormControl, FormGroup } from '@angular/forms';

import type {
  CreateSalePaymentPayload,
  PaymentMethod,
} from '../../models/sale.model';
import { SalePaymentDialog } from './sale-payment-dialog';

/**
 * Test-only view of the members the template binds to. They are `protected`
 * on the component (template-visible, not public API), so the spec reaches
 * them through one explicit structural cast instead of scattering `any`.
 */
interface DialogInternals {
  readonly form: FormGroup<{
    amount: FormControl<number>;
    method: FormControl<PaymentMethod>;
    referenceNumber: FormControl<string>;
  }>;
  amount(): number;
  exceedsBalance(): boolean;
  remaining(): number;
  settlesSale(): boolean;
  needsReference(): boolean;
  missingReference(): boolean;
  payInFull(): void;
  submit(): void;
}

const BALANCE = 750;

describe('SalePaymentDialog', () => {
  let fixture: ComponentFixture<SalePaymentDialog>;
  let cmp: DialogInternals;
  let emitted: CreateSalePaymentPayload[];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SalePaymentDialog],
    }).compileComponents();

    fixture = TestBed.createComponent(SalePaymentDialog);
    fixture.componentRef.setInput('balanceDue', BALANCE);
    fixture.detectChanges();

    cmp = fixture.componentInstance as unknown as DialogInternals;
    emitted = [];
    fixture.componentInstance.submitted.subscribe((payload) =>
      emitted.push(payload),
    );
  });

  function type(amount: number): void {
    cmp.form.controls.amount.setValue(amount);
  }

  it('reports what the client will still owe after a partial abono', () => {
    type(200);

    expect(cmp.remaining()).toBe(550);
    expect(cmp.settlesSale()).toBe(false);
    expect(cmp.exceedsBalance()).toBe(false);
  });

  it('recognises an abono that settles the sale', () => {
    type(BALANCE);

    expect(cmp.remaining()).toBe(0);
    expect(cmp.settlesSale()).toBe(true);
  });

  it('flags an abono larger than the outstanding balance', () => {
    type(BALANCE + 0.01);

    expect(cmp.exceedsBalance()).toBe(true);
    // Never negative: an overpayment is rejected, not credited back.
    expect(cmp.remaining()).toBe(0);
  });

  it('fills in the whole balance in one click', () => {
    cmp.payInFull();

    expect(cmp.form.controls.amount.value).toBe(BALANCE);
    expect(cmp.settlesSale()).toBe(true);
  });

  it('emits a cash abono without a reference', () => {
    type(250);
    cmp.submit();

    expect(emitted).toEqual([{ amount: 250, method: 'CASH' }]);
  });

  it('emits a transfer with its reference', () => {
    type(250);
    cmp.form.controls.method.setValue('TRANSFER');
    cmp.form.controls.referenceNumber.setValue('  8842  ');
    cmp.submit();

    expect(emitted).toEqual([
      { amount: 250, method: 'TRANSFER', referenceNumber: '8842' },
    ]);
  });

  // The API refuses an untraceable non-cash abono, so the form has to.
  it('refuses to emit a transfer with no reference', () => {
    type(250);
    cmp.form.controls.method.setValue('TRANSFER');

    expect(cmp.needsReference()).toBe(true);
    expect(cmp.missingReference()).toBe(true);

    cmp.submit();
    expect(emitted).toEqual([]);
  });

  // Switching back to cash after typing a reference must not send it: the
  // API rejects a reference on a CASH abono.
  it('drops a reference left over from a non-cash method', () => {
    type(250);
    cmp.form.controls.method.setValue('CARD');
    cmp.form.controls.referenceNumber.setValue('8842');
    cmp.form.controls.method.setValue('CASH');
    cmp.submit();

    expect(emitted).toEqual([{ amount: 250, method: 'CASH' }]);
  });

  it('refuses to emit an overpayment', () => {
    type(BALANCE + 100);
    cmp.submit();

    expect(emitted).toEqual([]);
  });

  it('refuses to emit a zero abono', () => {
    type(0);
    cmp.submit();

    expect(emitted).toEqual([]);
  });

  it('treats a cleared amount box as zero instead of NaN', () => {
    cmp.form.controls.amount.setValue(null as unknown as number);

    expect(cmp.amount()).toBe(0);
    expect(Number.isNaN(cmp.amount())).toBe(false);

    cmp.submit();
    expect(emitted).toEqual([]);
  });
});
