import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
  type AbstractControl,
  type ValidationErrors,
} from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';

import {
  isApiError,
  validationFields,
  type ApiFieldError,
} from '../../../../core/http/api-error';
import { formatDay } from '../../../../shared/utils/date-range';
import {
  MIN_DELIVERY_ORDER_NUMBER,
  type CreateDispatchPayload,
  type Dispatch,
  type DispatchItemInput,
} from '../../../dispatches/models/dispatch.model';
import { DispatchDataClient } from '../../../dispatches/services/dispatch-data';
import {
  pendingDispatchLines,
  type SalesOrder,
} from '../../models/sales-order.model';

/** A line as the dialog lists it: one per product, named, summed. */
interface PendingLine extends DispatchItemInput {
  readonly productName: string;
  readonly productSku: string;
}

/**
 * Creates the dispatch that lets the assigned seller deliver an order.
 *
 * Everything the API needs is already on the order — the seller, the lines
 * still owed — except the two things only the office knows at loading time:
 * the day the load goes out and the number on the paper delivery order. So
 * the dialog asks for exactly those two and owns the call, so the detail
 * page only learns about the dispatch once it exists.
 *
 * There is no API link between a dispatch and an order: `notes` names the
 * order so a person reading the dispatch later can still trace it back.
 */
@Component({
  selector: 'app-create-dispatch-dialog',
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    DatePickerModule,
    DialogModule,
    InputNumberModule,
  ],
  templateUrl: './create-dispatch-dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateDispatchDialog {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly dispatches = inject(DispatchDataClient);

  readonly order = input.required<SalesOrder>();
  readonly visible = model(false);

  /** The dispatch as the API returned it, once created. */
  readonly created = output<Dispatch>();

  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly fieldErrors = signal<readonly ApiFieldError[]>([]);

  protected readonly sellerName = computed(
    () => this.order().assignedTo?.fullName ?? null,
  );

  /**
   * Lines shown to the user — exactly what goes out in the payload: pending
   * units only, one entry per product. Two order lines for the same product
   * collapse into one, so what is read on screen is what is sent.
   */
  protected readonly pendingItems = computed<readonly PendingLine[]>(() => {
    const order = this.order();
    return pendingDispatchLines(order).map((line) => {
      const source = order.items.find((i) => i.productId === line.productId);
      return {
        ...line,
        productName: source?.productName ?? line.productId,
        productSku: source?.productSku ?? '',
      };
    });
  });

  protected readonly minOrderNumber = MIN_DELIVERY_ORDER_NUMBER;

  protected readonly form = this.fb.group({
    date: this.fb.control<Date>(new Date(), [Validators.required]),
    /**
     * The number on the physical delivery order. Required by the API, an
     * integer >= 1, and unique across dispatches — a duplicate comes back as
     * DISPATCH_ORDER_NUMBER_TAKEN, which only a different number can fix.
     */
    deliveryOrderNumber: this.fb.control<number | null>(null, [
      Validators.required,
      Validators.min(MIN_DELIVERY_ORDER_NUMBER),
      integerValidator,
    ]),
  });

  /** Touched and validity changes, as a signal the template can react to. */
  private readonly formEvents = toSignal(this.form.events);

  /**
   * Whether to point the input at the error or at the hint: the id in
   * `aria-describedby` has to exist, and only one of the two is rendered.
   */
  protected readonly orderNumberInvalid = computed(() => {
    this.formEvents();
    const control = this.form.controls.deliveryOrderNumber;
    return control.touched && control.invalid;
  });

  constructor() {
    // Every open and every close starts from a blank form: a stale error or
    // number from the previous attempt must not greet the next one.
    effect(() => {
      this.visible();
      untracked(() => this.reset());
    });
  }

  protected async submit(): Promise<void> {
    if (this.saving()) {
      return;
    }
    const order = this.order();
    if (this.form.invalid || order.assignedToId === null) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.error.set(null);
    this.fieldErrors.set([]);

    const raw = this.form.getRawValue();
    const payload: CreateDispatchPayload = {
      sellerId: order.assignedToId,
      date: formatDay(raw.date),
      // Non-null: the control is `Validators.required` and the guard above
      // returns on an invalid form, so this line is unreachable without it.
      deliveryOrderNumber: raw.deliveryOrderNumber as number,
      items: pendingDispatchLines(order),
      notes: `Preventa ${order.code}`,
    };

    try {
      const dispatch = await firstValueFrom(this.dispatches.create(payload));
      // Closed before the parent hears about it, so a parent that reacts by
      // hiding the dialog never tears it down while it is still open.
      this.visible.set(false);
      this.reset();
      this.created.emit(dispatch);
    } catch (error) {
      this.error.set(toMessage(error));
      this.fieldErrors.set(validationFields(error));
    } finally {
      this.saving.set(false);
    }
  }

  protected cancel(): void {
    this.visible.set(false);
  }

  /** Clears the form and any error so the next attempt starts blank. */
  reset(): void {
    this.form.reset({ date: new Date(), deliveryOrderNumber: null });
    this.error.set(null);
    this.fieldErrors.set([]);
  }
}

/**
 * The API types the delivery order number as an integer. A decimal would be
 * rejected server-side, so it is caught here rather than after a round trip.
 */
function integerValidator(control: AbstractControl): ValidationErrors | null {
  const value: unknown = control.value;
  if (value === null || value === '') {
    return null;
  }
  return Number.isInteger(value) ? null : { integer: true };
}

/**
 * A taken number is the one failure the user can fix from this dialog, so it
 * gets a message that says what to change; everything else renders the
 * interceptor's localized message.
 */
function toMessage(error: unknown): string {
  if (isApiError(error)) {
    if (error.code === 'DISPATCH_ORDER_NUMBER_TAKEN') {
      return 'Ese número de orden de entrega ya está en uso. Escribí otro.';
    }
    return error.message;
  }
  return 'No se pudo crear el despacho.';
}
