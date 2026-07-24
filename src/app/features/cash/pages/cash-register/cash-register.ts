import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { SkeletonModule } from 'primeng/skeleton';
import { TextareaModule } from 'primeng/textarea';

import type { Client } from '../../../clients/models/client.model';
import { ClientDataClient } from '../../../clients/services/client-data';
import { toNumber } from '../../../../shared/forms/to-number';
import type { WarehouseStock } from '../../../inventory/models/inventory.model';
import { InventoryDataClient } from '../../../inventory/services/inventory-data';
import type { Product } from '../../../products/models/product.model';
import { ProductDataClient } from '../../../products/services/product-data';
import type { CreateSalePayload } from '../../../sales/models/sale.model';
import { SaleDataClient } from '../../../sales/services/sale-data';
import { StoreSaleDialog } from '../../components/store-sale-dialog/store-sale-dialog';
import type { CashSession } from '../../models/cash-session.model';
import { CashSessionDataClient } from '../../services/cash-session-data';

/** Products and clients are bounded pickers for the counter. */
const PICKER_SIZE = 100;

@Component({
  selector: 'app-cash-register',
  imports: [
    CurrencyPipe,
    DatePipe,
    ReactiveFormsModule,
    ButtonModule,
    DialogModule,
    SkeletonModule,
    TextareaModule,
    StoreSaleDialog,
  ],
  templateUrl: './cash-register.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CashRegister implements OnInit {
  private readonly cash = inject(CashSessionDataClient);
  private readonly sales = inject(SaleDataClient);
  private readonly products = inject(ProductDataClient);
  private readonly clients = inject(ClientDataClient);
  private readonly inventory = inject(InventoryDataClient);
  private readonly fb = inject(NonNullableFormBuilder);

  private readonly saleDialog = viewChild(StoreSaleDialog);

  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);

  /** The open till, or null when there is none. */
  protected readonly session = signal<CashSession | null>(null);
  /** Kept after a close so the cashier can read the final arqueo. */
  protected readonly lastClosed = signal<CashSession | null>(null);

  protected readonly productOptions = signal<Product[]>([]);
  protected readonly clientOptions = signal<Client[]>([]);
  /** Warehouse units on hand, keyed by product id. */
  protected readonly stockByProduct = signal<Record<string, number>>({});

  protected readonly arqueo = computed(() => this.session()?.arqueo ?? null);

  // ── Opening ────────────────────────────────────────────────────────────
  protected readonly openForm = this.fb.group({
    openingCash: this.fb.control(0, [Validators.required, Validators.min(0)]),
    notes: this.fb.control(''),
  });
  protected readonly opening = signal(false);
  protected readonly openError = signal<string | null>(null);

  // ── Selling ────────────────────────────────────────────────────────────
  protected readonly saleDialogVisible = signal(false);
  protected readonly savingSale = signal(false);
  protected readonly saleError = signal<string | null>(null);

  // ── Closing ────────────────────────────────────────────────────────────
  protected readonly closeDialogVisible = signal(false);
  protected readonly closeForm = this.fb.group({
    closingCash: this.fb.control(0, [Validators.required, Validators.min(0)]),
    notes: this.fb.control(''),
  });
  protected readonly closing = signal(false);
  protected readonly closeError = signal<string | null>(null);

  /** Subscribed so the difference recomputes as the cashier types. */
  private readonly closeChanges = toSignal(this.closeForm.valueChanges);

  /** Over (+) or short (−) against what the till should hold. */
  protected readonly closeDifference = computed(() => {
    this.closeChanges();
    const expected = toNumber(this.arqueo()?.expectedCash);
    return toNumber(this.closeForm.getRawValue().closingCash) - expected;
  });

  ngOnInit(): void {
    void this.init();
  }

  private async init(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const [session, products, clients, stock] = await Promise.all([
        firstValueFrom(this.cash.current()),
        firstValueFrom(this.products.list({ pageSize: PICKER_SIZE, isActive: true })),
        firstValueFrom(this.clients.list({ pageSize: PICKER_SIZE })),
        firstValueFrom(this.inventory.listStock({ pageSize: PICKER_SIZE })),
      ]);
      this.session.set(session);
      this.productOptions.set([...products.items]);
      this.clientOptions.set([...clients.items]);
      this.stockByProduct.set(toStockMap(stock.items));
    } catch (error) {
      this.loadError.set(toMessage(error, 'No se pudo cargar la caja.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected async openSession(): Promise<void> {
    if (this.openForm.invalid) {
      this.openForm.markAllAsTouched();
      return;
    }

    this.opening.set(true);
    this.openError.set(null);
    const raw = this.openForm.getRawValue();
    const notes = raw.notes.trim();

    try {
      const session = await firstValueFrom(
        this.cash.open({
          openingCash: raw.openingCash,
          ...(notes ? { notes } : {}),
        }),
      );
      this.session.set(session);
      this.lastClosed.set(null);
      this.openForm.reset({ openingCash: 0, notes: '' });
    } catch (error) {
      this.openError.set(toMessage(error, 'No se pudo abrir la caja.'));
    } finally {
      this.opening.set(false);
    }
  }

  protected openSaleDialog(): void {
    this.saleError.set(null);
    this.saleDialog()?.reset();
    this.saleDialogVisible.set(true);
  }

  protected async registerSale(payload: CreateSalePayload): Promise<void> {
    this.savingSale.set(true);
    this.saleError.set(null);
    try {
      await firstValueFrom(this.sales.create(payload));
      // Re-read the till and the stock the sale just consumed.
      const [session, stock] = await Promise.all([
        firstValueFrom(this.cash.current()),
        firstValueFrom(this.inventory.listStock({ pageSize: PICKER_SIZE })),
      ]);
      this.session.set(session);
      this.stockByProduct.set(toStockMap(stock.items));
      this.saleDialogVisible.set(false);
    } catch (error) {
      this.saleError.set(toMessage(error, 'No se pudo registrar la venta.'));
    } finally {
      this.savingSale.set(false);
    }
  }

  protected openCloseDialog(): void {
    this.closeError.set(null);
    this.closeForm.reset({
      closingCash: this.arqueo()?.expectedCash ?? 0,
      notes: '',
    });
    this.closeDialogVisible.set(true);
  }

  protected async closeSession(): Promise<void> {
    const current = this.session();
    if (!current || this.closeForm.invalid) {
      this.closeForm.markAllAsTouched();
      return;
    }

    this.closing.set(true);
    this.closeError.set(null);
    const raw = this.closeForm.getRawValue();
    const notes = raw.notes.trim();

    try {
      const closed = await firstValueFrom(
        this.cash.close(current.id, {
          closingCash: raw.closingCash,
          ...(notes ? { notes } : {}),
        }),
      );
      this.lastClosed.set(closed);
      this.session.set(null);
      this.closeDialogVisible.set(false);
    } catch (error) {
      this.closeError.set(toMessage(error, 'No se pudo cerrar la caja.'));
    } finally {
      this.closing.set(false);
    }
  }
}

function toStockMap(
  stock: readonly WarehouseStock[],
): Record<string, number> {
  return Object.fromEntries(
    stock.map((entry) => [entry.productId, Number(entry.quantity)]),
  );
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
