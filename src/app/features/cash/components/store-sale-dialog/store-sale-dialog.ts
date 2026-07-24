import { CurrencyPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  input,
  model,
  output,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  type FormControl,
  type FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';

import { toNumber } from '../../../../shared/forms/to-number';
import type { Client } from '../../../clients/models/client.model';
import type { Product } from '../../../products/models/product.model';
import type {
  CreateSalePayload,
  PaymentType,
  SaleItemInput,
} from '../../../sales/models/sale.model';

type ItemRow = FormGroup<{
  productId: FormControl<string>;
  quantity: FormControl<number>;
  unitPrice: FormControl<number | null>;
}>;

/**
 * ISV rate used to break the total down. Catalog prices are treated as
 * TAX-INCLUSIVE (the Honduran retail convention), so this only splits the
 * amount for display — it never changes what the customer pays, which must
 * keep matching the `total` the API computes from the line items.
 */
const ISV_RATE = 0.15;

/** Mutable on purpose: PrimeNG's `[options]` input rejects readonly arrays. */
const PAYMENT_OPTIONS: { value: PaymentType; label: string }[] = [
  { value: 'CASH', label: 'Contado' },
  { value: 'CREDIT', label: 'Crédito' },
];

/** A line as rendered: form values already resolved against the catalog. */
interface SaleLine {
  readonly index: number;
  readonly productId: string;
  readonly name: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly subtotal: number;
  readonly available: number;
  /** Selling more units than the warehouse holds. */
  readonly exceedsStock: boolean;
}

/**
 * Counter-sale form. Presentational: it builds the payload and emits it —
 * the parent owns the HTTP call, the saving flag and the error message.
 *
 * Every figure on screen derives from a single `lines()` computed rather than
 * from the controls directly, so totals cannot drift out of sync with edits.
 */
@Component({
  selector: 'app-store-sale-dialog',
  imports: [
    CurrencyPipe,
    ReactiveFormsModule,
    ButtonModule,
    DialogModule,
    SelectModule,
    TextareaModule,
  ],
  templateUrl: './store-sale-dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StoreSaleDialog {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly visible = model(false);
  readonly products = input.required<Product[]>();
  readonly clients = input.required<Client[]>();
  /** Warehouse units on hand, keyed by product id. */
  readonly stock = input<Record<string, number>>({});
  readonly saving = input(false);
  readonly error = input<string | null>(null);

  readonly submitted = output<CreateSalePayload>();

  protected readonly paymentOptions = PAYMENT_OPTIONS;
  protected readonly isvRate = ISV_RATE;

  protected readonly form = this.fb.group({
    clientId: this.fb.control(''),
    paymentType: this.fb.control<PaymentType>('CASH'),
    amountPaid: this.fb.control(0),
    /** Cash handed over. Never sent — it only drives the change due. */
    cashReceived: this.fb.control(0),
    notes: this.fb.control(''),
    items: this.fb.array<ItemRow>([this.newItem()]),
  });

  protected get items() {
    return this.form.controls.items;
  }

  /**
   * Subscribed purely so every derived figure recomputes on each edit; the
   * values themselves are read with getRawValue(), since valueChanges emits a
   * partial shape.
   */
  private readonly changes = toSignal(this.form.valueChanges);

  /** Products annotated with availability, for the picker. */
  protected readonly options = computed(() =>
    this.products().map((product) => {
      const available = this.stock()[product.id] ?? 0;
      return {
        ...product,
        available,
        soldOut: available <= 0,
        label: product.name,
      };
    }),
  );

  protected readonly lines = computed<SaleLine[]>(() => {
    this.changes();
    const stock = this.stock();
    return this.form.getRawValue().items.map((item, index) => {
      const product = this.products().find((p) => p.id === item.productId);
      // A cleared number input hands back null, so every figure is coerced
      // before it can poison a subtotal.
      const quantity = toNumber(item.quantity);
      const unitPrice =
        item.unitPrice === null
          ? this.priceOf(item.productId)
          : toNumber(item.unitPrice);
      const available = stock[item.productId] ?? 0;
      return {
        index,
        productId: item.productId,
        name: product?.name ?? '',
        quantity,
        unitPrice,
        subtotal: unitPrice * quantity,
        available,
        exceedsStock: Boolean(item.productId) && quantity > available,
      };
    });
  });

  protected readonly itemCount = computed(() =>
    this.lines().reduce((sum, line) => sum + line.quantity, 0),
  );

  /** What the customer pays — matches the API's computed `total`. */
  protected readonly total = computed(() =>
    this.lines().reduce((sum, line) => sum + line.subtotal, 0),
  );

  /** Total net of the tax already baked into the prices. */
  protected readonly taxableBase = computed(
    () => this.total() / (1 + ISV_RATE),
  );

  protected readonly tax = computed(() => this.total() - this.taxableBase());

  protected readonly hasStockIssue = computed(() =>
    this.lines().some((line) => line.exceedsStock),
  );

  protected readonly isCredit = computed(
    () => this.changes()?.paymentType === 'CREDIT',
  );

  protected readonly amountPaid = computed(() => {
    this.changes();
    return toNumber(this.form.getRawValue().amountPaid);
  });

  /** What the customer still owes after the down payment on a credit sale. */
  protected readonly balanceDue = computed(() =>
    this.isCredit() ? Math.max(0, this.total() - this.amountPaid()) : 0,
  );

  protected readonly overpaid = computed(
    () => this.isCredit() && this.amountPaid() > this.total(),
  );

  private readonly cashReceived = computed(() => {
    this.changes();
    return toNumber(this.form.getRawValue().cashReceived);
  });

  /** Change owed back to the customer; negative means they are still short. */
  protected readonly changeDue = computed(
    () => this.cashReceived() - this.total(),
  );

  protected readonly showsChange = computed(
    () => !this.isCredit() && this.cashReceived() > 0,
  );

  /** Catalog price, coerced because the API serializes decimals loosely. */
  protected priceOf(productId: string): number {
    const price = this.products().find((p) => p.id === productId)?.price;
    return Number(price ?? 0);
  }

  protected addItem(): void {
    this.items.push(this.newItem());
  }

  /** Steps a line's quantity, never below one unit. */
  protected bump(index: number, delta: number): void {
    const quantity = this.items.at(index).controls.quantity;
    quantity.setValue(Math.max(1, toNumber(quantity.value) + delta));
  }

  protected removeItem(index: number): void {
    if (this.items.length > 1) {
      this.items.removeAt(index);
    }
  }

  protected submit(): void {
    if (this.form.invalid || this.overpaid() || this.hasStockIssue()) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const items: SaleItemInput[] = raw.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      // Omit the override entirely so the API falls back to the catalog price.
      ...(item.unitPrice === null ? {} : { unitPrice: item.unitPrice }),
    }));

    const notes = raw.notes.trim();
    this.submitted.emit({
      channel: 'STORE',
      paymentType: raw.paymentType,
      items,
      ...(raw.clientId ? { clientId: raw.clientId } : {}),
      ...(raw.paymentType === 'CREDIT' ? { amountPaid: raw.amountPaid } : {}),
      ...(notes ? { notes } : {}),
    });
  }

  /** Clears the form so the next sale starts blank. */
  reset(): void {
    this.form.reset({
      clientId: '',
      paymentType: 'CASH',
      amountPaid: 0,
      cashReceived: 0,
      notes: '',
    });
    this.items.clear();
    this.items.push(this.newItem());
  }

  protected cancel(): void {
    this.visible.set(false);
  }

  private newItem(): ItemRow {
    const row: ItemRow = this.fb.group({
      productId: this.fb.control('', [Validators.required]),
      quantity: this.fb.control(1, [Validators.required, Validators.min(1)]),
      unitPrice: this.fb.control<number | null>(null),
    });

    // Picking a product drops its catalog price into the line, so the cashier
    // sees the real number instead of an empty box — still overridable.
    row.controls.productId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((productId) => {
        row.controls.unitPrice.setValue(this.priceOf(productId));
      });

    return row;
  }
}
