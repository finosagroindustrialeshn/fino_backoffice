import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import {
  FormsModule,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
  type FormControl,
  type FormGroup,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';
import { TextareaModule } from 'primeng/textarea';

import type { UserProfile } from '../../../../core/auth/user-profile.model';
import type { Product } from '../../../products/models/product.model';
import { ProductDataClient } from '../../../products/services/product-data';
import type { Shift } from '../../../shifts/models/shift.model';
import { ShiftDataClient } from '../../../shifts/services/shift-data';
import { UserDataClient } from '../../../users/services/user-data';
import type {
  CreateReturnPayload,
  ReturnFlagInput,
} from '../../models/return.model';
import { ReturnDataClient } from '../../services/return-data';

/** Sellers, products and shifts are bounded pickers for the return form. */
const PICKER_SIZE = 100;

/** One flagged product: which one, and what the seller said about it. */
type FlagGroup = FormGroup<{
  productId: FormControl<string>;
  note: FormControl<string>;
}>;

/**
 * Generates the return that settles a shift, for a seller who left without
 * handing anything in.
 *
 * There is no line editor: the API computes the lines from the seller's live
 * carried stock for every product the shift received. Nothing is typed, and
 * merma is not decided here — that happens when the return is confirmed.
 */
@Component({
  selector: 'app-return-form',
  imports: [
    DatePipe,
    FormsModule,
    ReactiveFormsModule,
    RouterLink,
    ButtonModule,
    InputTextModule,
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
  private readonly shifts = inject(ShiftDataClient);
  private readonly users = inject(UserDataClient);
  private readonly products = inject(ProductDataClient);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);

  protected readonly productOptions = signal<Product[]>([]);
  private readonly sellerNames = signal<ReadonlyMap<string, string>>(new Map());
  /**
   * Only OPEN shifts are offered: a return settles the day before it closes,
   * so a shift that is already CLOSED can no longer be reconciled.
   */
  protected readonly shiftOptions = signal<Shift[]>([]);
  protected readonly shiftsLoading = signal(false);

  /** Narrows the shift picker; not part of the payload. */
  protected readonly sellerFilter = signal<string | null>(null);

  protected readonly sellerFilterOptions = computed(() => [
    { label: 'Todos los vendedores', value: null as string | null },
    ...[...this.sellerNames()].map(([id, name]) => ({ label: name, value: id })),
  ]);

  protected readonly form = this.fb.group({
    shiftId: this.fb.control('', [Validators.required]),
    notes: this.fb.control(''),
    flags: this.fb.array<FlagGroup>([]),
  });

  protected get flags() {
    return this.form.controls.flags;
  }

  ngOnInit(): void {
    void this.init();
  }

  protected sellerName(sellerId: string): string {
    return this.sellerNames().get(sellerId) ?? sellerId;
  }

  private newFlag(): FlagGroup {
    return this.fb.group({
      productId: this.fb.control('', [Validators.required]),
      note: this.fb.control(''),
    });
  }

  protected addFlag(): void {
    this.flags.push(this.newFlag());
  }

  protected removeFlag(index: number): void {
    this.flags.removeAt(index);
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
      this.sellerNames.set(
        new Map(
          sellers.items.map((user: UserProfile) => [user.id, user.fullName]),
        ),
      );
      this.productOptions.set([...products.items]);
      await this.loadShifts();
    } catch (error) {
      this.loadError.set(toMessage(error, 'No se pudo cargar el formulario.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected onSellerFilterChange(sellerId: string | null): void {
    this.sellerFilter.set(sellerId);
    // The selected shift may not belong to the new seller — drop it.
    this.form.controls.shiftId.setValue('');
    void this.loadShifts();
  }

  private async loadShifts(): Promise<void> {
    this.shiftsLoading.set(true);
    try {
      const page = await firstValueFrom(
        this.shifts.list({
          status: 'OPEN',
          sellerId: this.sellerFilter() ?? undefined,
          pageSize: PICKER_SIZE,
        }),
      );
      this.shiftOptions.set([...page.items]);
    } catch (error) {
      this.shiftOptions.set([]);
      this.loadError.set(
        toMessage(error, 'No se pudieron cargar las jornadas abiertas.'),
      );
    } finally {
      this.shiftsLoading.set(false);
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
    // A flag carries no quantity and no reason — only which product came back
    // with a problem, and what was said about it.
    const flags: ReturnFlagInput[] = raw.flags.map((flag) => {
      const note = flag.note.trim();
      return {
        productId: flag.productId,
        ...(note ? { note } : {}),
      };
    });
    const notes = raw.notes.trim();
    const payload: CreateReturnPayload = {
      shiftId: raw.shiftId,
      ...(flags.length > 0 ? { flags } : {}),
      ...(notes ? { notes } : {}),
    };

    try {
      await firstValueFrom(this.returns.create(payload));
      await this.router.navigate(['/retorno']);
    } catch (error) {
      this.formError.set(toMessage(error, 'No se pudo generar el retorno.'));
    } finally {
      this.saving.set(false);
    }
  }
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
