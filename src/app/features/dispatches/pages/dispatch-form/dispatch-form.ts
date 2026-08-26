import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import {
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
  type AbstractControl,
  type ValidationErrors,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';
import { TextareaModule } from 'primeng/textarea';

import type { UserProfile } from '../../../../core/auth/user-profile.model';
import {
  ProductQuantityPicker,
  type ProductQuantities,
} from '../../../../shared/components/product-quantity-picker/product-quantity-picker';
import { formatDay } from '../../../../shared/utils/date-range';
import type { Product } from '../../../products/models/product.model';
import { ProductDataClient } from '../../../products/services/product-data';
import { ReportsInventoryDataClient } from '../../../reports/services/reports-inventory-data';
import { UserDataClient } from '../../../users/services/user-data';
import {
  MIN_DELIVERY_ORDER_NUMBER,
  type CreateDispatchPayload,
  type DispatchItemInput,
} from '../../models/dispatch.model';
import { DispatchDataClient } from '../../services/dispatch-data';

/** Sellers and products are bounded pickers for the dispatch form. */
const PICKER_SIZE = 100;

@Component({
  selector: 'app-dispatch-form',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    ProductQuantityPicker,
    ButtonModule,
    DatePickerModule,
    InputNumberModule,
    SelectModule,
    SkeletonModule,
    TextareaModule,
  ],
  templateUrl: './dispatch-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DispatchForm implements OnInit {
  private readonly router = inject(Router);
  private readonly dispatches = inject(DispatchDataClient);
  private readonly users = inject(UserDataClient);
  private readonly products = inject(ProductDataClient);
  private readonly inventory = inject(ReportsInventoryDataClient);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);

  protected readonly sellerOptions = signal<UserProfile[]>([]);
  protected readonly productOptions = signal<Product[]>([]);
  /** Available units per product id — drives the picker's stock column. */
  protected readonly stockByProduct = signal<ProductQuantities | null>(null);

  /** Selected products and their quantities, owned by the picker. */
  protected readonly quantities = signal<ProductQuantities>({});

  protected readonly selectedCount = computed(
    () => Object.keys(this.quantities()).length,
  );

  /** A dispatch needs at least one line — mirrors the API's own rule. */
  protected readonly hasItems = computed(() => this.selectedCount() > 0);

  /**
   * Blocks the submit when a line asks for more than the warehouse holds, so
   * the user is not told about it only later, when assigning 400s.
   */
  protected readonly hasStockIssue = computed(() => {
    const stock = this.stockByProduct();
    if (!stock) {
      return false;
    }
    return Object.entries(this.quantities()).some(([productId, quantity]) => {
      const available = stock[productId];
      return available !== undefined && quantity > available;
    });
  });

  protected readonly minOrderNumber = MIN_DELIVERY_ORDER_NUMBER;

  protected readonly form = this.fb.group({
    sellerId: this.fb.control('', [Validators.required]),
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
    notes: this.fb.control(''),
  });

  ngOnInit(): void {
    void this.init();
  }

  private async init(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const [sellers, products] = await Promise.all([
        firstValueFrom(
          this.users.list({ role: 'SELLER', pageSize: PICKER_SIZE }),
        ),
        firstValueFrom(this.products.list({ pageSize: PICKER_SIZE })),
      ]);
      this.sellerOptions.set([...sellers.items]);
      // Inactive products are not dispatchable, so they never reach the picker.
      this.productOptions.set(products.items.filter((p) => p.isActive));
      // Stock is loaded separately and best-effort: it only enriches the
      // picker, so losing it must not take the whole form down with it.
      void this.loadStock();
    } catch (error) {
      this.loadError.set(
        toMessage(error, 'No se pudo cargar el formulario.'),
      );
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * The stock column is an aid, not a requirement: an ACCOUNTANT-only report
   * endpoint or a transient failure leaves `stockByProduct` null, and the
   * picker simply hides the column instead of blocking the dispatch.
   */
  private async loadStock(): Promise<void> {
    try {
      const stock = await firstValueFrom(
        this.inventory.stock({ pageSize: PICKER_SIZE }),
      );
      this.stockByProduct.set(
        Object.fromEntries(
          stock.items.map((row) => [row.productId, row.available]),
        ),
      );
    } catch {
      this.stockByProduct.set(null);
    }
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid || !this.hasItems() || this.hasStockIssue()) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.formError.set(null);

    const raw = this.form.getRawValue();
    const items: DispatchItemInput[] = Object.entries(this.quantities()).map(
      ([productId, quantity]) => ({ productId, quantity }),
    );
    const notes = raw.notes.trim();
    const payload: CreateDispatchPayload = {
      sellerId: raw.sellerId,
      date: formatDay(raw.date),
      // Non-null: the control is `Validators.required` and the guard above
      // returns on an invalid form, so submit is unreachable without it.
      deliveryOrderNumber: raw.deliveryOrderNumber as number,
      items,
      ...(notes ? { notes } : {}),
    };

    try {
      await firstValueFrom(this.dispatches.create(payload));
      await this.router.navigate(['/despacho']);
    } catch (error) {
      this.formError.set(toMessage(error, 'No se pudo crear el despacho.'));
    } finally {
      this.saving.set(false);
    }
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

function toMessage(error: unknown, fallback: string): string {
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message;
  }
  return fallback;
}
