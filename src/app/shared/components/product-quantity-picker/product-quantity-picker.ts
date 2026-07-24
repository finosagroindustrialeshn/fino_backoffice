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
import { ToggleSwitchModule } from 'primeng/toggleswitch';

import type { Product } from '../../../features/products/models/product.model';

/** Quantities keyed by product id. Only positive entries are ever present. */
export type ProductQuantities = Record<string, number>;

/**
 * Picks several products and their quantities from one flat list.
 *
 * Selection IS the quantity: typing a number above zero includes the product,
 * dropping it back to zero removes it. That collapses "select" and "how many"
 * into a single control, and makes it structurally impossible to add the same
 * product twice — which a row-per-item form allows.
 *
 * Presentational on purpose: it takes products and stock as inputs and owns no
 * HTTP, so the container decides where the data comes from and it can be
 * reused wherever a load has to be assembled (dispatch, return).
 */
@Component({
  selector: 'app-product-quantity-picker',
  imports: [FormsModule, ButtonModule, ToggleSwitchModule],
  templateUrl: './product-quantity-picker.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductQuantityPicker {
  readonly products = input.required<readonly Product[]>();

  /**
   * Available units per product id. Pass null when stock is unknown — the
   * column is hidden and no line can be judged as exceeding it.
   */
  readonly stock = input<ProductQuantities | null>(null);

  /** Two-way: the container reads this to build its payload. */
  readonly quantities = model<ProductQuantities>({});

  protected readonly search = signal('');
  protected readonly onlySelected = signal(false);

  protected readonly visibleProducts = computed<readonly Product[]>(() => {
    const term = this.search().trim().toLowerCase();
    const onlySelected = this.onlySelected();
    const quantities = this.quantities();

    return this.products().filter((product) => {
      if (onlySelected && !quantities[product.id]) {
        return false;
      }
      if (!term) {
        return true;
      }
      return (
        product.name.toLowerCase().includes(term) ||
        product.sku.toLowerCase().includes(term)
      );
    });
  });

  protected readonly selectedCount = computed(
    () => Object.keys(this.quantities()).length,
  );

  protected readonly totalUnits = computed(() =>
    Object.values(this.quantities()).reduce((sum, qty) => sum + qty, 0),
  );

  /** True when any selected line asks for more than the warehouse holds. */
  protected readonly hasStockIssue = computed(() => {
    const stock = this.stock();
    if (!stock) {
      return false;
    }
    return Object.entries(this.quantities()).some(([productId, quantity]) => {
      const available = stock[productId];
      return available !== undefined && quantity > available;
    });
  });

  protected quantityOf(productId: string): number {
    return this.quantities()[productId] ?? 0;
  }

  /** Available units, or null when the container passed no stock data. */
  protected availableOf(productId: string): number | null {
    return this.stock()?.[productId] ?? null;
  }

  protected exceedsStock(productId: string): boolean {
    const available = this.availableOf(productId);
    return available !== null && this.quantityOf(productId) > available;
  }

  protected isOutOfStock(productId: string): boolean {
    return this.availableOf(productId) === 0;
  }

  /** Zero (or anything lower) removes the product from the selection. */
  protected setQuantity(productId: string, quantity: number): void {
    const safe = Number.isFinite(quantity) ? Math.max(0, Math.trunc(quantity)) : 0;
    this.quantities.update((current) => {
      const next = { ...current };
      if (safe > 0) {
        next[productId] = safe;
      } else {
        delete next[productId];
      }
      return next;
    });
  }

  protected bump(productId: string, delta: number): void {
    this.setQuantity(productId, this.quantityOf(productId) + delta);
  }

  protected clearAll(): void {
    this.quantities.set({});
  }

  /** Reads the number out of the native input event. */
  protected onQuantityInput(productId: string, event: Event): void {
    const value = (event.target as HTMLInputElement).valueAsNumber;
    this.setQuantity(productId, value);
  }
}
