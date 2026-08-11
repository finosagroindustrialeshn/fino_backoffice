import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { FormControl, FormGroup } from '@angular/forms';

import type { CreateSalePaymentPayload } from '../../models/sale.model';
import { SalePaymentDialog } from './sale-payment-dialog';

/**
 * Test-only view of the members the template binds to. They are `protected`
 * on the component (template-visible, not public API), so the spec reaches
 * them through one explicit structural cast instead of scattering `any`.
 */
interface DialogInternals {
  readonly form: FormGroup<{
    amount: FormControl<number>;
    method: FormControl<string>;
  }>;
  amount(): number;
  exceedsBalance(): boolean;
  remaining(): number;
  settlesSale(): boolean;
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

  it('emits the abono with the selected method', () => {
    type(250);
    cmp.form.controls.method.setValue('transfer');
    cmp.submit();

    expect(emitted).toEqual([{ amount: 250, method: 'transfer' }]);
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
