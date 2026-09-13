import { CurrencyPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  model,
  output,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';

import { toNumber } from '../../../../shared/forms/to-number';
import {
  PAYMENT_METHOD_OPTIONS,
  requiresReference,
  type CreateSalePaymentPayload,
  type PaymentMethod,
} from '../../models/sale.model';

/**
 * Collects an abono against a credit sale. Presentational: it validates the
 * amount against the outstanding balance and emits the payload — the parent
 * owns the HTTP call, the idempotency key, the saving flag and the error.
 */
@Component({
  selector: 'app-sale-payment-dialog',
  imports: [
    CurrencyPipe,
    ReactiveFormsModule,
    ButtonModule,
    DialogModule,
    InputNumberModule,
    InputTextModule,
    SelectModule,
  ],
  templateUrl: './sale-payment-dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SalePaymentDialog {
  private readonly fb = inject(NonNullableFormBuilder);

  readonly visible = model(false);
  /** Outstanding balance; the abono can never exceed it. */
  readonly balanceDue = input.required<number>();
  readonly saving = input(false);
  readonly error = input<string | null>(null);

  readonly submitted = output<CreateSalePaymentPayload>();

  protected readonly methodOptions = PAYMENT_METHOD_OPTIONS;

  protected readonly form = this.fb.group({
    amount: this.fb.control(0, [Validators.required, Validators.min(0.01)]),
    method: this.fb.control<PaymentMethod>('CASH'),
    referenceNumber: this.fb.control(''),
  });

  private readonly changes = toSignal(this.form.valueChanges);

  protected readonly amount = computed(() => {
    this.changes();
    return toNumber(this.form.getRawValue().amount);
  });

  protected readonly method = computed(() => {
    this.changes();
    return this.form.getRawValue().method;
  });

  /**
   * A transfer or card collection has to be traceable to a statement, so the
   * API refuses one with no reference. Asking for it here turns that 400 into
   * an inline message instead of a lost round-trip.
   */
  protected readonly needsReference = computed(() =>
    requiresReference(this.method()),
  );

  protected readonly reference = computed(() => {
    this.changes();
    return this.form.getRawValue().referenceNumber.trim();
  });

  protected readonly missingReference = computed(
    () => this.needsReference() && this.reference().length === 0,
  );

  protected readonly exceedsBalance = computed(
    () => this.amount() > this.balanceDue(),
  );

  /** What the client still owes once this abono is applied. */
  protected readonly remaining = computed(() =>
    Math.max(0, this.balanceDue() - this.amount()),
  );

  protected readonly settlesSale = computed(
    () => this.amount() > 0 && !this.exceedsBalance() && this.remaining() === 0,
  );

  /** One click to collect the full outstanding balance — the common case. */
  protected payInFull(): void {
    this.form.controls.amount.setValue(this.balanceDue());
  }

  protected submit(): void {
    if (
      this.form.invalid ||
      this.exceedsBalance() ||
      this.amount() <= 0 ||
      this.missingReference()
    ) {
      this.form.markAllAsTouched();
      return;
    }

    // A reference on a CASH abono is rejected by the API, so it is dropped
    // rather than sent — switching method after typing one must not fail.
    this.submitted.emit({
      amount: this.amount(),
      method: this.method(),
      ...(this.needsReference() ? { referenceNumber: this.reference() } : {}),
    });
  }

  /** Clears the form so the next abono starts blank. */
  reset(): void {
    this.form.reset({ amount: 0, method: 'CASH', referenceNumber: '' });
  }

  protected cancel(): void {
    this.visible.set(false);
  }
}
