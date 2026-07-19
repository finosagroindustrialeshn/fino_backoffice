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
import type { ReturnReason } from '../../../catalogs/return-reasons/models/return-reason.model';
import { ReturnReasonDataClient } from '../../../catalogs/return-reasons/services/return-reason-data';
import type { Product } from '../../../products/models/product.model';
import { ProductDataClient } from '../../../products/services/product-data';
import { UserDataClient } from '../../../users/services/user-data';
import type {
  CreateReturnPayload,
  ReturnItemInput,
} from '../../models/return.model';
import { ReturnDataClient } from '../../services/return-data';

/** Sellers, products and reasons are bounded pickers for the return form. */
const PICKER_SIZE = 100;

@Component({
  selector: 'app-return-form',
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
  templateUrl: './return-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReturnForm implements OnInit {
  private readonly router = inject(Router);
  private readonly returns = inject(ReturnDataClient);
  private readonly users = inject(UserDataClient);
  private readonly products = inject(ProductDataClient);
  private readonly reasons = inject(ReturnReasonDataClient);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);

  protected readonly sellerOptions = signal<UserProfile[]>([]);
  protected readonly productOptions = signal<Product[]>([]);
  protected readonly reasonOptions = signal<ReturnReason[]>([]);

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
    return this.fb.group(
      {
        productId: this.fb.control('', [Validators.required]),
        quantityReturned: this.fb.control(0, [
          Validators.required,
          Validators.min(0),
        ]),
        quantityMerma: this.fb.control(0, [
          Validators.required,
          Validators.min(0),
        ]),
        reasonId: this.fb.control(''),
      },
      { validators: [lineValidator] },
    );
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
      const [sellers, products, reasons] = await Promise.all([
        firstValueFrom(
          this.users.list({ role: 'SELLER', pageSize: PICKER_SIZE }),
        ),
        firstValueFrom(this.products.list({ pageSize: PICKER_SIZE })),
        firstValueFrom(this.reasons.list({ pageSize: PICKER_SIZE })),
      ]);
      this.sellerOptions.set([...sellers.items]);
      this.productOptions.set([...products.items]);
      this.reasonOptions.set([...reasons.items]);
    } catch (error) {
      this.loadError.set(toMessage(error, 'No se pudo cargar el formulario.'));
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
    const items: ReturnItemInput[] = raw.items.map((item) => ({
      productId: item.productId,
      quantityReturned: item.quantityReturned,
      quantityMerma: item.quantityMerma,
      // reasonId only travels when there is merma to explain.
      ...(item.quantityMerma > 0 && item.reasonId
        ? { reasonId: item.reasonId }
        : {}),
    }));
    const notes = raw.notes.trim();
    const payload: CreateReturnPayload = {
      sellerId: raw.sellerId,
      date: formatDay(raw.date),
      items,
      ...(notes ? { notes } : {}),
    };

    try {
      await firstValueFrom(this.returns.create(payload));
      await this.router.navigate(['/retorno']);
    } catch (error) {
      this.formError.set(toMessage(error, 'No se pudo crear el retorno.'));
    } finally {
      this.saving.set(false);
    }
  }
}

/**
 * Line-level rules: a line must move at least one unit, and any merma must
 * carry a reason. Returns keyed errors so the template can target each.
 */
function lineValidator(control: AbstractControl): ValidationErrors | null {
  const returned = Number(control.get('quantityReturned')?.value ?? 0);
  const merma = Number(control.get('quantityMerma')?.value ?? 0);
  const reasonId = control.get('reasonId')?.value as string;

  const errors: ValidationErrors = {};
  if (returned + merma <= 0) {
    errors['emptyLine'] = true;
  }
  if (merma > 0 && !reasonId) {
    errors['reasonRequired'] = true;
  }
  return Object.keys(errors).length > 0 ? errors : null;
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
