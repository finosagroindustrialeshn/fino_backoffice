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
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';
import { TextareaModule } from 'primeng/textarea';

import type { UserProfile } from '../../../../core/auth/user-profile.model';
import {
  ProductQuantityPicker,
  type ProductQuantities,
} from '../../../../shared/components/product-quantity-picker/product-quantity-picker';
import type { Product } from '../../../products/models/product.model';
import { ProductDataClient } from '../../../products/services/product-data';
import { ReportsInventoryDataClient } from '../../../reports/services/reports-inventory-data';
import { UserDataClient } from '../../../users/services/user-data';
import type {
  CreateDispatchPayload,
  DispatchItemInput,
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

  protected readonly form = this.fb.group({
    sellerId: this.fb.control('', [Validators.required]),
    date: this.fb.control<Date>(new Date(), [Validators.required]),
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

/** Formats a Date as YYYY-MM-DD using its local calendar day (no UTC shift). */
function formatDay(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
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
