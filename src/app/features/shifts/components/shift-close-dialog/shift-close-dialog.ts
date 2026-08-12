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
import { TextareaModule } from 'primeng/textarea';

import { toNumber } from '../../../../shared/forms/to-number';
import {
  CASH_DIFFERENCE_LABELS,
  CASH_DIFFERENCE_SEVERITY,
  cashDifferenceKind,
  type CashDifferenceKind,
  type CloseShiftPayload,
  type ShiftTagSeverity,
} from '../../models/shift.model';

/**
 * Liquidates a shift: the supervisor enters the cash actually counted and the
 * dialog shows the resulting over/short against what the shift expected.
 *
 * Presentational — it validates and emits the payload; the parent owns the
 * HTTP call, the idempotency key, the saving flag and the error.
 *
 * Unlike collecting an abono, a mismatch does NOT block submission. A shortage
 * is a real event that has to be recordable — refusing to close until the cash
 * balances would only push the seller to invent a number that does. What the
 * dialog does instead is refuse to let a mismatch pass *silently*: any
 * difference beyond rounding requires a note explaining it.
 */
@Component({
  selector: 'app-shift-close-dialog',
  imports: [
    CurrencyPipe,
    ReactiveFormsModule,
    ButtonModule,
    DialogModule,
    InputNumberModule,
    TextareaModule,
  ],
  templateUrl: './shift-close-dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShiftCloseDialog {
  private readonly fb = inject(NonNullableFormBuilder);

  readonly visible = model(false);
  /** openingCash + cashCollected - expenses: what should be in the bag. */
  readonly expectedCash = input.required<number>();
  readonly saving = input(false);
  readonly error = input<string | null>(null);

  readonly submitted = output<CloseShiftPayload>();

  protected readonly form = this.fb.group({
    closingCash: this.fb.control(0, [Validators.required, Validators.min(0)]),
    notes: this.fb.control(''),
  });

  private readonly changes = toSignal(this.form.valueChanges);

  protected readonly countedCash = computed(() => {
    this.changes();
    return toNumber(this.form.getRawValue().closingCash);
  });

  protected readonly notes = computed(() => {
    this.changes();
    return this.form.getRawValue().notes.trim();
  });

  protected readonly difference = computed(
    () => this.countedCash() - this.expectedCash(),
  );

  protected readonly differenceKind = computed<CashDifferenceKind>(() =>
    cashDifferenceKind(this.difference()),
  );

  protected readonly differenceLabel = computed(
    () => CASH_DIFFERENCE_LABELS[this.differenceKind()],
  );

  protected readonly differenceSeverity = computed<ShiftTagSeverity>(
    () => CASH_DIFFERENCE_SEVERITY[this.differenceKind()],
  );

  /** Shown as an absolute value — the label already carries the direction. */
  protected readonly differenceAmount = computed(() =>
    Math.abs(this.difference()),
  );

  protected readonly balances = computed(
    () => this.differenceKind() === 'exact',
  );

  /** An unexplained over/short is what the note requirement exists to prevent. */
  protected readonly needsNote = computed(
    () => !this.balances() && this.notes().length === 0,
  );

  protected readonly canSubmit = computed(
    () => this.countedCash() >= 0 && !this.needsNote(),
  );

  /** One click to report exactly what the shift expected — the common case. */
  protected matchExpected(): void {
    this.form.controls.closingCash.setValue(this.expectedCash());
  }

  protected submit(): void {
    if (this.form.invalid || !this.canSubmit()) {
      this.form.markAllAsTouched();
      return;
    }

    const notes = this.notes();
    this.submitted.emit({
      closingCash: this.countedCash(),
      ...(notes ? { notes } : {}),
    });
  }

  /** Clears the form so a retry after an error starts from a known state. */
  reset(): void {
    this.form.reset({ closingCash: 0, notes: '' });
  }

  protected cancel(): void {
    this.visible.set(false);
  }
}
