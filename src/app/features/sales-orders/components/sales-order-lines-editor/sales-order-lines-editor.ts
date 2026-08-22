import { CurrencyPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';

import type { Product } from '../../../products/models/product.model';
import type { SalesOrderLineInput } from '../../models/sales-order.model';

/** Units already delivered per product id — the floor a line cannot go under. */
export type FulfilledUnits = Record<string, number>;

/**
 * Edits the lines of a pre-sale order: which products, how many, and at what
 * price they were quoted.
 *
 * Price is a first-class field rather than an override hidden behind a
 * toggle, because a preventista negotiating at the door is the ordinary case,
 * not the exception — and the API defaults any line sent without a
 * `unitPriceRef` back to the catalog price, silently undoing that
 * negotiation.
 *
 * Presentational on purpose: products and delivered units come in as inputs
 * and it owns no HTTP, so the container decides where the data comes from.
 */
@Component({
  selector: 'app-sales-order-lines-editor',
  imports: [
    CurrencyPipe,
    FormsModule,
    ButtonModule,
    InputNumberModule,
    SelectModule,
  ],
  templateUrl: './sales-order-lines-editor.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SalesOrderLinesEditor {
  readonly products = input.required<readonly Product[]>();

  /**
   * Units already sold against each line. Empty for a new order; on an
   * existing one it is what keeps the form from proposing a change the API
   * would refuse with SALES_ORDER_LINE_BELOW_FULFILLED.
   */
  readonly fulfilled = input<FulfilledUnits>({});

  /** Two-way: the container reads this to build its payload. */
  readonly lines = model<readonly SalesOrderLineInput[]>([]);

  protected readonly productToAdd = signal<string | null>(null);

  private readonly productsById = computed(
    () => new Map(this.products().map((product) => [product.id, product])),
  );

  /**
   * A product already on the order is not offered again — one line each.
   *
   * Mutable array on purpose: PrimeNG's `[options]` input rejects readonly.
   */
  protected readonly addableProducts = computed<Product[]>(() => {
    const taken = new Set(this.lines().map((line) => line.productId));
    return this.products().filter((product) => !taken.has(product.id));
  });

  protected readonly estimatedTotal = computed(() =>
    this.lines().reduce((sum, line) => sum + this.subtotalOf(line), 0),
  );

  protected subtotalOf(line: SalesOrderLineInput): number {
    return line.quantity * (line.unitPriceRef ?? 0);
  }

  protected productName(productId: string): string {
    return this.productsById().get(productId)?.name ?? productId;
  }

  protected productSku(productId: string): string {
    return this.productsById().get(productId)?.sku ?? '';
  }

  /** Units already in the client's hands; zero when the line is untouched. */
  protected floorOf(productId: string): number {
    return this.fulfilled()[productId] ?? 0;
  }

  /** A line with deliveries cannot be removed: those units really shipped. */
  protected canRemove(productId: string): boolean {
    return this.floorOf(productId) === 0;
  }

  protected addLine(): void {
    const productId = this.productToAdd();
    if (!productId) {
      return;
    }
    const product = this.productsById().get(productId);
    if (!product) {
      return;
    }
    this.lines.update((current) => [
      ...current,
      // Seeded with the catalog price so the common case needs no typing;
      // the field stays editable for whatever was actually quoted.
      { productId, quantity: 1, unitPriceRef: product.price },
    ]);
    this.productToAdd.set(null);
  }

  protected removeLine(productId: string): void {
    if (!this.canRemove(productId)) {
      return;
    }
    this.lines.update((current) =>
      current.filter((line) => line.productId !== productId),
    );
  }

  /**
   * Clamped to what was already delivered — or to one unit when nothing was.
   * Refusing here beats a 400 on save: the number visibly stops instead of
   * the whole form failing after the user hit guardar.
   */
  protected setQuantity(productId: string, quantity: number): void {
    const floor = Math.max(1, this.floorOf(productId));
    const safe = Number.isFinite(quantity)
      ? Math.max(floor, Math.trunc(quantity))
      : floor;
    this.lines.update((current) =>
      current.map((line) =>
        line.productId === productId ? { ...line, quantity: safe } : line,
      ),
    );
  }

  /**
   * Clamped at zero and rounded to two decimals.
   *
   * The API validates `unitPriceRef` with `maxDecimalPlaces: 2` and answers
   * 400 VALIDATION_FAILED for anything longer — including plain floating
   * point noise like 0.1 + 0.2. Money has two decimals anyway, so rounding
   * here beats a rejected save the user has no way to explain.
   */
  protected setPrice(productId: string, price: number): void {
    const safe = Number.isFinite(price)
      ? Math.round(Math.max(0, price) * 100) / 100
      : 0;
    this.lines.update((current) =>
      current.map((line) =>
        line.productId === productId ? { ...line, unitPriceRef: safe } : line,
      ),
    );
  }
}
