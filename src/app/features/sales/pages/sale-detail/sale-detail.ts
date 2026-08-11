import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

import { parseUuid } from '../../../../shared/utils/query-params';
import { ClientDataClient } from '../../../clients/services/client-data';
import { ProductDataClient } from '../../../products/services/product-data';
import { UserDataClient } from '../../../users/services/user-data';
import { SalePaymentDialog } from '../../components/sale-payment-dialog/sale-payment-dialog';
import {
  PAYMENT_TYPE_LABELS,
  SALE_CHANNEL_LABELS,
  SALE_CHANNEL_SEVERITY,
  SALE_STATUS_LABELS,
  SALE_STATUS_SEVERITY,
  paymentMethodLabel,
  type CreateSalePaymentPayload,
  type PaymentType,
  type Sale,
  type SaleChannel,
  type SaleStatus,
  type SaleTagSeverity,
} from '../../models/sale.model';
import { SaleDataClient } from '../../services/sale-data';

type SaleState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly sale: Sale }
  | { readonly status: 'error'; readonly message: string };

/**
 * The in-flight abono, held so a retry after a lost response replays the
 * original request instead of collecting the money twice. The signature is
 * kept alongside because reusing a key with a DIFFERENT body is rejected
 * (409 IDEMPOTENCY_KEY_REUSED) — an edited amount must mint a new key.
 */
interface PendingPayment {
  readonly key: string;
  readonly signature: string;
}

const INVALID_SALE_MESSAGE = 'El identificador de la venta no es válido.';
const LOAD_ERROR_MESSAGE = 'No se pudo cargar la venta.';
const PAYMENT_ERROR_MESSAGE = 'No se pudo registrar el abono.';

/** The product catalog is a bounded lookup joined to the sale's line items. */
const LOOKUP_SIZE = 100;

@Component({
  selector: 'app-sale-detail',
  imports: [
    CurrencyPipe,
    DatePipe,
    RouterLink,
    ButtonModule,
    SalePaymentDialog,
    SkeletonModule,
    TableModule,
    TagModule,
  ],
  templateUrl: './sale-detail.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SaleDetail {
  private readonly sales = inject(SaleDataClient);
  private readonly clients = inject(ClientDataClient);
  private readonly users = inject(UserDataClient);
  private readonly products = inject(ProductDataClient);
  private readonly route = inject(ActivatedRoute);
  private readonly paymentDialog = viewChild(SalePaymentDialog);

  protected readonly skeletonRows = [0, 1, 2, 3];
  protected readonly paymentMethodLabel = paymentMethodLabel;

  private readonly pathParams = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });

  /** Route params are user input too — a hand-edited id never reaches the API. */
  protected readonly saleId = computed(() => parseUuid(this.pathParams().get('id')));

  protected readonly state = signal<SaleState>({ status: 'loading' });

  protected readonly sale = computed(() => {
    const current = this.state();
    return current.status === 'success' ? current.sale : null;
  });

  protected readonly errorMessage = computed(() => {
    const current = this.state();
    return current.status === 'error' ? current.message : null;
  });

  /** Mutable copies: PrimeNG's `[value]` input rejects readonly arrays. */
  protected readonly items = computed(() => [...(this.sale()?.items ?? [])]);
  protected readonly payments = computed(() => [
    ...(this.sale()?.payments ?? []),
  ]);

  private readonly clientName = signal<string | null>(null);
  private readonly sellerName = signal<string | null>(null);
  private readonly productNames = signal<ReadonlyMap<string, string>>(new Map());

  protected readonly paymentOpen = signal(false);
  protected readonly paying = signal(false);
  protected readonly paymentError = signal<string | null>(null);
  private pendingPayment: PendingPayment | null = null;

  /** Only a credit sale with an outstanding balance can take an abono. */
  protected readonly canCollect = computed(() => {
    const sale = this.sale();
    return sale?.paymentType === 'CREDIT' && sale.balanceDue > 0;
  });

  protected readonly totalUnits = computed(() =>
    this.items().reduce((sum, item) => sum + Number(item.quantity), 0),
  );

  constructor() {
    effect(() => {
      const id = this.saleId();
      if (!id) {
        this.state.set({ status: 'error', message: INVALID_SALE_MESSAGE });
        return;
      }
      void this.load(id);
    });

    void this.loadProductNames();
  }

  protected statusLabel(status: SaleStatus): string {
    return SALE_STATUS_LABELS[status];
  }

  protected statusSeverity(status: SaleStatus): SaleTagSeverity {
    return SALE_STATUS_SEVERITY[status];
  }

  protected channelLabel(channel: SaleChannel): string {
    return SALE_CHANNEL_LABELS[channel];
  }

  protected channelSeverity(channel: SaleChannel): SaleTagSeverity {
    return SALE_CHANNEL_SEVERITY[channel];
  }

  protected paymentTypeLabel(paymentType: PaymentType): string {
    return PAYMENT_TYPE_LABELS[paymentType];
  }

  protected productName(productId: string): string {
    return this.productNames().get(productId) ?? '—';
  }

  /** A STORE sale can be a walk-in with no client on file. */
  protected displayClient(): string {
    return this.sale()?.clientId ? (this.clientName() ?? '…') : 'Consumidor final';
  }

  protected displaySeller(): string {
    return this.sellerName() ?? '…';
  }

  protected openPaymentDialog(): void {
    this.paymentError.set(null);
    this.paymentDialog()?.reset();
    this.paymentOpen.set(true);
  }

  protected async collect(payload: CreateSalePaymentPayload): Promise<void> {
    const sale = this.sale();
    if (!sale || this.paying()) {
      return;
    }

    // A changed amount is a different operation, so it needs its own key;
    // an unchanged one reuses the key and lets the API replay the original.
    const signature = `${payload.amount}|${payload.method ?? ''}`;
    if (this.pendingPayment?.signature !== signature) {
      this.pendingPayment = { key: crypto.randomUUID(), signature };
    }

    this.paying.set(true);
    this.paymentError.set(null);
    try {
      const updated = await firstValueFrom(
        this.sales.addPayment(sale.id, payload, this.pendingPayment.key),
      );
      this.state.set({ status: 'success', sale: updated });
      this.pendingPayment = null;
      this.paymentOpen.set(false);
    } catch (error) {
      this.paymentError.set(toMessage(error, PAYMENT_ERROR_MESSAGE));
    } finally {
      this.paying.set(false);
    }
  }

  protected retry(): void {
    const id = this.saleId();
    if (id) {
      void this.load(id);
    }
  }

  private async load(id: string): Promise<void> {
    this.state.set({ status: 'loading' });
    this.clientName.set(null);
    this.sellerName.set(null);
    try {
      const sale = await firstValueFrom(this.sales.get(id));
      this.state.set({ status: 'success', sale });
      void this.loadParties(sale);
    } catch (error) {
      this.state.set({
        status: 'error',
        message: toMessage(error, LOAD_ERROR_MESSAGE),
      });
    }
  }

  /**
   * The sale carries ids only. Names are fetched per party rather than from a
   * paginated lookup so a client outside the first page still resolves.
   */
  private async loadParties(sale: Sale): Promise<void> {
    const [client, seller] = await Promise.allSettled([
      sale.clientId
        ? firstValueFrom(this.clients.get(sale.clientId))
        : Promise.resolve(null),
      firstValueFrom(this.users.get(sale.sellerId)),
    ]);

    if (client.status === 'fulfilled' && client.value) {
      this.clientName.set(client.value.name);
    }
    if (seller.status === 'fulfilled') {
      this.sellerName.set(seller.value.fullName);
    }
  }

  private async loadProductNames(): Promise<void> {
    try {
      const products = await firstValueFrom(
        this.products.list({ pageSize: LOOKUP_SIZE }),
      );
      this.productNames.set(
        new Map(products.items.map((product) => [product.id, product.name])),
      );
    } catch {
      // Names fall back to a dash if the lookup fails.
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
