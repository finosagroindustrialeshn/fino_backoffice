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
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';
import { TextareaModule } from 'primeng/textarea';

import { validationFields, type ApiFieldError } from '../../../../core/http/api-error';
import { MAX_PAGE_SIZE } from '../../../../core/http/pagination.model';
import { formatDay } from '../../../../shared/utils/date-range';
import type { Client } from '../../../clients/models/client.model';
import { ClientDataClient } from '../../../clients/services/client-data';
import type { Product } from '../../../products/models/product.model';
import { ProductDataClient } from '../../../products/services/product-data';
import {
  SalesOrderLinesEditor,
  type FulfilledUnits,
} from '../../components/sales-order-lines-editor/sales-order-lines-editor';
import {
  toLineInputs,
  type CreateSalesOrderPayload,
  type SalesOrder,
  type SalesOrderLineInput,
  type UpdateSalesOrderPayload,
} from '../../models/sales-order.model';
import { SalesOrderDataClient } from '../../services/sales-order-data';

/** Clients and products are bounded lookups for the pickers. */
const CLIENT_LOOKUP_SIZE = MAX_PAGE_SIZE;
const PRODUCT_LOOKUP_SIZE = MAX_PAGE_SIZE;

/** Option shape the client picker binds to — code and name in one label. */
interface ClientOption {
  readonly label: string;
  readonly value: string;
}

@Component({
  selector: 'app-sales-order-form',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    ButtonModule,
    DatePickerModule,
    SalesOrderLinesEditor,
    SelectModule,
    SkeletonModule,
    TextareaModule,
  ],
  templateUrl: './sales-order-form.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SalesOrderForm implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly orders = inject(SalesOrderDataClient);
  private readonly clients = inject(ClientDataClient);
  private readonly products = inject(ProductDataClient);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly orderId = signal<string | null>(null);
  protected readonly isEdit = computed(() => this.orderId() !== null);

  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly formError = signal<string | null>(null);
  /**
   * Per-field detail behind a 400. The generic copy says "check your data";
   * this says WHICH datum, which is the only part that lets somebody fix it.
   */
  protected readonly formFieldErrors = signal<readonly ApiFieldError[]>([]);

  protected readonly clientOptions = signal<ClientOption[]>([]);
  protected readonly productOptions = signal<Product[]>([]);

  /** The lines the editor owns; the payload is built from these on save. */
  protected readonly lines = signal<readonly SalesOrderLineInput[]>([]);

  /** Units already delivered per product — the floor each line cannot cross. */
  protected readonly fulfilled = signal<FulfilledUnits>({});

  /** Set when editing, to show the code and lock the client. */
  protected readonly existing = signal<SalesOrder | null>(null);

  /**
   * Idempotency key held across retries of the SAME order.
   *
   * A request lost on a bad connection is indistinguishable from one that
   * never arrived, and retrying without a key promises the same client the
   * same thing twice. The signature is the payload: change what is being
   * ordered and it becomes a different operation, which needs its own key.
   */
  private pendingCreate: { key: string; signature: string } | null = null;

  protected readonly form = this.fb.group({
    // The client is never editable on an existing order: changing who the
    // promise was made to is a different order, not this one.
    clientId: this.fb.control('', [Validators.required]),
    expectedDeliveryDate: this.fb.control<Date | null>(null),
    notes: this.fb.control('', [Validators.maxLength(500)]),
  });

  protected readonly canSave = computed(
    () => this.lines().length > 0 && !this.saving(),
  );

  ngOnInit(): void {
    void this.init();
  }

  protected async save(): Promise<void> {
    if (this.lines().length === 0) {
      this.formError.set('Agregá al menos un producto al pedido.');
      this.formFieldErrors.set([]);
      return;
    }
    if (!this.isEdit() && this.form.invalid) {
      // Without this the button just does nothing: the inline error under the
      // client picker is easy to miss when the button is at the far bottom.
      this.form.markAllAsTouched();
      this.formError.set('Elegí el cliente antes de registrar el pedido.');
      this.formFieldErrors.set([]);
      return;
    }

    this.saving.set(true);
    this.formError.set(null);
    this.formFieldErrors.set([]);
    try {
      const order = this.isEdit()
        ? await this.saveEdit()
        : await this.saveNew();
      await this.router.navigate(['/pedidos', order.id]);
    } catch (error) {
      this.formError.set(toMessage(error, 'No se pudo guardar el pedido.'));
      this.formFieldErrors.set(validationFields(error));
    } finally {
      this.saving.set(false);
    }
  }

  private async saveNew(): Promise<SalesOrder> {
    const raw = this.form.getRawValue();
    const payload: CreateSalesOrderPayload = {
      clientId: raw.clientId,
      // The API takes a plain YYYY-MM-DD: the client promised a DAY, and
      // sending a timestamp would let a timezone shift it by one.
      expectedDeliveryDate: raw.expectedDeliveryDate
        ? formatDay(raw.expectedDeliveryDate)
        : undefined,
      notes: raw.notes.trim() || undefined,
      items: this.lines(),
    };

    const signature = JSON.stringify(payload);
    if (this.pendingCreate?.signature !== signature) {
      this.pendingCreate = { key: crypto.randomUUID(), signature };
    }

    const created = await firstValueFrom(
      this.orders.create(payload, this.pendingCreate.key),
    );
    this.pendingCreate = null;
    return created;
  }

  private async saveEdit(): Promise<SalesOrder> {
    const id = this.orderId();
    if (!id) {
      throw new Error('No se encontró el pedido.');
    }
    const raw = this.form.getRawValue();
    const payload: UpdateSalesOrderPayload = {
      // The whole set of lines, always with unitPriceRef: a line sent without
      // it is repriced from the catalog, undoing whatever was negotiated.
      items: this.lines(),
      // Explicit null clears the date the client never actually gave.
      expectedDeliveryDate: raw.expectedDeliveryDate
        ? formatDay(raw.expectedDeliveryDate)
        : null,
      notes: raw.notes.trim(),
    };
    return firstValueFrom(this.orders.update(id, payload));
  }

  private async init(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    const id = this.route.snapshot.paramMap.get('id');
    this.orderId.set(id);

    try {
      await this.loadLookups();
      if (id) {
        await this.loadOrder(id);
      }
    } catch (error) {
      this.loadError.set(toMessage(error, 'No se pudo preparar el formulario.'));
    } finally {
      this.loading.set(false);
    }
  }

  private async loadLookups(): Promise<void> {
    const [clients, products] = await Promise.all([
      firstValueFrom(
        this.clients.list({ pageSize: CLIENT_LOOKUP_SIZE, isActive: true }),
      ),
      firstValueFrom(
        this.products.list({ pageSize: PRODUCT_LOOKUP_SIZE, isActive: true }),
      ),
    ]);
    this.clientOptions.set(clients.items.map(toClientOption));
    this.productOptions.set([...products.items]);
  }

  private async loadOrder(id: string): Promise<void> {
    const order = await firstValueFrom(this.orders.get(id));
    this.existing.set(order);
    this.lines.set(toLineInputs(order));
    this.fulfilled.set(
      Object.fromEntries(
        order.items.map((item) => [item.productId, item.quantityFulfilled]),
      ),
    );
    this.form.patchValue({
      clientId: order.clientId,
      expectedDeliveryDate: parseDay(order.expectedDeliveryDate),
      notes: order.notes ?? '',
    });
    this.form.controls.clientId.disable();
  }
}

function toClientOption(client: Client): ClientOption {
  return { label: `${client.name} (${client.code})`, value: client.id };
}

/**
 * Parses the API's `YYYY-MM-DD` into that day at LOCAL midnight.
 *
 * Not `new Date(value)`: that reads a bare date as UTC midnight, which in
 * Honduras (UTC-6) is the previous day — the datepicker would show Thursday
 * for an order promised on Friday.
 */
function parseDay(value: string | null): Date | null {
  if (!value) {
    return null;
  }
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) {
    return null;
  }
  return new Date(year, month - 1, day);
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
