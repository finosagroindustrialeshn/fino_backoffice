import {
  ChangeDetectionStrategy,
  Component,
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
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';
import { TextareaModule } from 'primeng/textarea';

import type { UserProfile } from '../../../../core/auth/user-profile.model';
import type { Product } from '../../../products/models/product.model';
import { ProductDataClient } from '../../../products/services/product-data';
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
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);

  protected readonly sellerOptions = signal<UserProfile[]>([]);
  protected readonly productOptions = signal<Product[]>([]);

  protected readonly form = this.fb.group({
    sellerId: this.fb.control('', [Validators.required]),
    date: this.fb.control<Date>(new Date(), [Validators.required]),
    notes: this.fb.control(''),
    items: this.fb.array([this.newItem()]),
  });

  protected get items() {
    return this.form.controls.items;
  }

  ngOnInit(): void {
    void this.init();
  }

  private newItem() {
    return this.fb.group({
      productId: this.fb.control('', [Validators.required]),
      quantity: this.fb.control(1, [Validators.required, Validators.min(1)]),
    });
  }

  protected addItem(): void {
    this.items.push(this.newItem());
  }

  protected removeItem(index: number): void {
    if (this.items.length > 1) {
      this.items.removeAt(index);
    }
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
      this.productOptions.set([...products.items]);
    } catch (error) {
      this.loadError.set(
        toMessage(error, 'No se pudo cargar el formulario.'),
      );
    } finally {
      this.loading.set(false);
    }
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    this.formError.set(null);

    const raw = this.form.getRawValue();
    const items: DispatchItemInput[] = raw.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
    }));
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
