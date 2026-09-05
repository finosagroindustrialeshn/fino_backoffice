import { CurrencyPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
  viewChild,
  type ElementRef,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  type FormControl,
  type FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';
import { TextareaModule } from 'primeng/textarea';

import { MAX_PAGE_SIZE } from '../../../../core/http/pagination.model';
import { toNumber } from '../../../../shared/forms/to-number';
import type { HasUnsavedChanges } from '../../../../shared/guards/unsaved-changes.guard';
import type { Client } from '../../../clients/models/client.model';
import { ClientDataClient } from '../../../clients/services/client-data';
import type { WarehouseStock } from '../../../inventory/models/inventory.model';
import { InventoryDataClient } from '../../../inventory/services/inventory-data';
import type { Product } from '../../../products/models/product.model';
import { ProductDataClient } from '../../../products/services/product-data';
import {
  PAYMENT_METHOD_OPTIONS,
  requiresReference,
  type CreateSalePayload,
  type PaymentMethod,
  type PaymentType,
  type SaleItemInput,
} from '../../../sales/models/sale.model';
import { SaleDataClient } from '../../../sales/services/sale-data';
import { CashSessionDataClient } from '../../services/cash-session-data';

type ItemRow = FormGroup<{
  productId: FormControl<string>;
  quantity: FormControl<number>;
  unitPrice: FormControl<number>;
}>;

/**
 * ISV rate used to break the total down. Catalog prices are treated as
 * TAX-INCLUSIVE (the Honduran retail convention), so this only splits the
 * amount for display — it never changes what the customer pays, which must
 * keep matching the `total` the API computes from the line items.
 */
const ISV_RATE = 0.15;

/** Products, clients and stock are bounded pickers for the counter. */
const PICKER_SIZE = MAX_PAGE_SIZE;

/** How many matches the search drops down. Beyond this, keep typing. */
const MAX_RESULTS = 8;

/** Mutable on purpose: PrimeNG's `[options]` input rejects readonly arrays. */
const PAYMENT_OPTIONS: { value: PaymentType; label: string }[] = [
  { value: 'CASH', label: 'Contado' },
  { value: 'CREDIT', label: 'Crédito' },
];

/** A catalog product as the search renders it. */
interface SearchHit {
  readonly id: string;
  readonly name: string;
  readonly sku: string;
  readonly price: number;
  readonly available: number;
  readonly soldOut: boolean;
  /** Already in the cart — the row says so instead of looking like a no-op. */
  readonly inCart: boolean;
}

/** A cart line as rendered: form values resolved against the catalog. */
interface SaleLine {
  readonly index: number;
  readonly productId: string;
  readonly name: string;
  readonly sku: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly subtotal: number;
  readonly available: number;
  /** Selling more units than the warehouse holds. */
  readonly exceedsStock: boolean;
}

/**
 * Counter sale, as a page rather than a dialog.
 *
 * It was a modal, and a stray click on the backdrop threw away a half-built
 * sale with no warning. A sale is a task, not a confirmation: it has a cart,
 * a customer, a collection method and change to count, so it gets a screen
 * and a guard that asks before discarding it.
 *
 * Products are added by typing rather than picked from a dropdown per line —
 * at a counter the cashier knows what they are selling, and a keyboard round
 * trip beats opening a select for every item.
 */
@Component({
  selector: 'app-store-sale',
  imports: [
    CurrencyPipe,
    ReactiveFormsModule,
    RouterLink,
    ButtonModule,
    InputTextModule,
    SelectModule,
    SkeletonModule,
    TextareaModule,
  ],
  templateUrl: './store-sale.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StoreSale implements OnInit, HasUnsavedChanges {
  private readonly cash = inject(CashSessionDataClient);
  private readonly sales = inject(SaleDataClient);
  private readonly products = inject(ProductDataClient);
  private readonly clients = inject(ClientDataClient);
  private readonly inventory = inject(InventoryDataClient);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly router = inject(Router);

  private readonly searchBox =
    viewChild<ElementRef<HTMLInputElement>>('searchBox');

  protected readonly isvRate = ISV_RATE;
  protected readonly paymentOptions = PAYMENT_OPTIONS;
  protected readonly methodOptions = PAYMENT_METHOD_OPTIONS;
  protected readonly skeletonRows = [0, 1, 2];

  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  /** False when there is no open till: nothing can be sold without one. */
  protected readonly hasOpenSession = signal(false);

  protected readonly catalog = signal<Product[]>([]);
  protected readonly clientOptions = signal<Client[]>([]);
  /** Warehouse units on hand, keyed by product id. */
  protected readonly stockByProduct = signal<Record<string, number>>({});

  protected readonly saving = signal(false);
  protected readonly saleError = signal<string | null>(null);
  /** Set once the sale is registered, so the guard lets the page go. */
  private readonly submitted = signal(false);

  // ── Search ─────────────────────────────────────────────────────────────
  protected readonly query = signal('');
  /** Which result Enter would add. Moves with the arrow keys. */
  protected readonly activeIndex = signal(0);

  protected readonly results = computed<SearchHit[]>(() => {
    const term = this.query().trim().toLowerCase();
    if (!term) {
      return [];
    }
    const stock = this.stockByProduct();
    const inCart = new Set(
      this.items.controls.map((row) => row.getRawValue().productId),
    );
    return this.catalog()
      .filter(
        (product) =>
          product.name.toLowerCase().includes(term) ||
          product.sku.toLowerCase().includes(term),
      )
      .slice(0, MAX_RESULTS)
      .map((product) => {
        const available = stock[product.id] ?? 0;
        return {
          id: product.id,
          name: product.name,
          sku: product.sku,
          price: Number(product.price ?? 0),
          available,
          soldOut: available <= 0,
          inCart: inCart.has(product.id),
        };
      });
  });

  protected readonly hasResults = computed(() => this.results().length > 0);
  /** Typed something, matched nothing — distinct from not having typed. */
  protected readonly noMatches = computed(
    () => this.query().trim().length > 0 && this.results().length === 0,
  );

  // ── The sale ───────────────────────────────────────────────────────────
  protected readonly form = this.fb.group({
    clientId: this.fb.control(''),
    paymentType: this.fb.control<PaymentType>('CASH'),
    paymentMethod: this.fb.control<PaymentMethod>('CASH'),
    referenceNumber: this.fb.control(''),
    amountPaid: this.fb.control(0),
    /** Cash handed over. Never sent — it only drives the change due. */
    cashReceived: this.fb.control(0),
    notes: this.fb.control(''),
    items: this.fb.array<ItemRow>([]),
  });

  protected get items() {
    return this.form.controls.items;
  }

  /**
   * Subscribed purely so every derived figure recomputes on each edit; the
   * values themselves are read with getRawValue(), since valueChanges emits a
   * partial shape.
   */
  private readonly changes = toSignal(this.form.valueChanges);

  protected readonly lines = computed<SaleLine[]>(() => {
    this.changes();
    const stock = this.stockByProduct();
    const names = new Map(this.catalog().map((p) => [p.id, p]));
    return this.items.controls.map((row, index) => {
      const raw = row.getRawValue();
      const product = names.get(raw.productId);
      const quantity = toNumber(raw.quantity);
      const unitPrice = toNumber(raw.unitPrice);
      const available = stock[raw.productId] ?? 0;
      return {
        index,
        productId: raw.productId,
        name: product?.name ?? 'Producto',
        sku: product?.sku ?? '',
        quantity,
        unitPrice,
        subtotal: quantity * unitPrice,
        available,
        exceedsStock: quantity > available,
      };
    });
  });

  protected readonly isEmpty = computed(() => this.lines().length === 0);

  protected readonly itemCount = computed(() =>
    this.lines().reduce((sum, line) => sum + line.quantity, 0),
  );

  protected readonly total = computed(() =>
    this.lines().reduce((sum, line) => sum + line.subtotal, 0),
  );

  /** Catalog prices include ISV, so the base is the total less the tax. */
  protected readonly tax = computed(
    () => this.total() - this.total() / (1 + ISV_RATE),
  );

  protected readonly taxableBase = computed(() => this.total() - this.tax());

  protected readonly hasStockIssue = computed(() =>
    this.lines().some((line) => line.exceedsStock),
  );

  protected readonly isCredit = computed(
    () => this.changes()?.paymentType === 'CREDIT',
  );

  protected readonly amountPaid = computed(() => {
    this.changes();
    return toNumber(this.form.getRawValue().amountPaid);
  });

  /** What the customer still owes after the down payment on a credit sale. */
  protected readonly balanceDue = computed(() =>
    this.isCredit() ? Math.max(0, this.total() - this.amountPaid()) : 0,
  );

  protected readonly overpaid = computed(
    () => this.isCredit() && this.amountPaid() > this.total(),
  );

  protected readonly paymentMethod = computed(() => {
    this.changes();
    return this.form.getRawValue().paymentMethod;
  });

  protected readonly isCashMethod = computed(
    () => this.paymentMethod() === 'CASH',
  );

  /**
   * What actually changes hands now: the whole total on a contado sale, the
   * down payment on a credit one.
   */
  protected readonly collectedNow = computed(() =>
    this.isCredit() ? this.amountPaid() : this.total(),
  );

  /**
   * A credit sale taken with no down payment collects nothing, so there is no
   * money to trace and no reference to demand — the method is left off the
   * payload entirely rather than asserting a cash collection that never was.
   */
  protected readonly needsReference = computed(
    () => requiresReference(this.paymentMethod()) && this.collectedNow() > 0,
  );

  protected readonly reference = computed(() => {
    this.changes();
    return this.form.getRawValue().referenceNumber.trim();
  });

  protected readonly missingReference = computed(
    () => this.needsReference() && this.reference().length === 0,
  );

  private readonly cashReceived = computed(() => {
    this.changes();
    return toNumber(this.form.getRawValue().cashReceived);
  });

  /** Change owed back to the customer; negative means they are still short. */
  protected readonly changeDue = computed(
    () => this.cashReceived() - this.total(),
  );

  protected readonly showsChange = computed(
    () => this.isCashMethod() && !this.isCredit() && this.cashReceived() > 0,
  );

  /** A CREDIT sale is extended to a registered client, never to a walk-in. */
  protected readonly needsClient = computed(() => {
    // Read the stream first: getRawValue() is not a signal, so without this
    // the check would answer with whatever the client was on first render.
    this.changes();
    return this.isCredit() && !this.form.getRawValue().clientId;
  });

  protected readonly canSubmit = computed(
    () =>
      !this.isEmpty() &&
      !this.overpaid() &&
      !this.hasStockIssue() &&
      !this.missingReference() &&
      !this.needsClient() &&
      !this.saving(),
  );

  ngOnInit(): void {
    void this.load();
  }

  /**
   * The cart is the only copy of this sale — nothing is persisted until it is
   * registered — so the guard asks before the page goes away. After a
   * successful submit there is nothing left to lose.
   */
  hasUnsavedChanges(): boolean {
    return !this.submitted() && !this.isEmpty();
  }

  // ── Search behaviour ───────────────────────────────────────────────────

  protected onQueryInput(value: string): void {
    this.query.set(value);
    this.activeIndex.set(0);
  }

  /** Arrow keys walk the results; they wrap so held keys never dead-end. */
  protected moveActive(delta: number): void {
    const count = this.results().length;
    if (count === 0) {
      return;
    }
    this.activeIndex.set((this.activeIndex() + delta + count) % count);
  }

  /** Enter adds whatever is highlighted — the whole point of the search. */
  protected addActive(): void {
    const hit = this.results()[this.activeIndex()];
    if (hit) {
      this.add(hit);
    }
  }

  protected clearQuery(): void {
    this.query.set('');
    this.activeIndex.set(0);
  }

  /**
   * Adds a product, or bumps the line it already has: a cashier scanning the
   * same item twice means two units, not a duplicate row to reconcile later.
   *
   * A sold-out product is still addable — the warehouse figure can lag a
   * physical shelf, and the line flags the overdraw rather than blocking a
   * sale the cashier is looking at.
   */
  protected add(hit: SearchHit): void {
    const existing = this.items.controls.find(
      (row) => row.getRawValue().productId === hit.id,
    );
    if (existing) {
      const quantity = existing.controls.quantity;
      quantity.setValue(toNumber(quantity.value) + 1);
    } else {
      this.items.push(this.newRow(hit.id, hit.price));
    }
    this.clearQuery();
    this.focusSearch();
  }

  /** Keeps the counter on the keyboard: type, Enter, type the next one. */
  protected focusSearch(): void {
    this.searchBox()?.nativeElement.focus();
  }

  // ── Cart ───────────────────────────────────────────────────────────────

  /** Steps a line's quantity, never below one unit. */
  protected bump(index: number, delta: number): void {
    const quantity = this.items.at(index).controls.quantity;
    quantity.setValue(Math.max(1, toNumber(quantity.value) + delta));
  }

  protected removeItem(index: number): void {
    this.items.removeAt(index);
  }

  protected clearCart(): void {
    this.items.clear();
  }

  // ── Submit ─────────────────────────────────────────────────────────────

  protected async submit(): Promise<void> {
    if (!this.canSubmit()) {
      this.form.markAllAsTouched();
      return;
    }

    const raw = this.form.getRawValue();
    const items: SaleItemInput[] = raw.items.map((item) => ({
      productId: item.productId,
      quantity: toNumber(item.quantity),
      unitPrice: toNumber(item.unitPrice),
    }));

    // Nothing collected means nothing to attribute: the method is omitted so
    // the sale does not claim a cash collection that never happened.
    const collection =
      this.collectedNow() > 0
        ? {
            paymentMethod: raw.paymentMethod,
            // A reference on a CASH collection is rejected by the API, so it
            // is dropped when the cashier switches method after typing one.
            ...(requiresReference(raw.paymentMethod)
              ? { referenceNumber: this.reference() }
              : {}),
          }
        : {};

    const notes = raw.notes.trim();
    const payload: CreateSalePayload = {
      channel: 'STORE',
      paymentType: raw.paymentType,
      items,
      ...(raw.clientId ? { clientId: raw.clientId } : {}),
      ...(raw.paymentType === 'CREDIT' ? { amountPaid: raw.amountPaid } : {}),
      ...collection,
      ...(notes ? { notes } : {}),
    };

    this.saving.set(true);
    this.saleError.set(null);
    try {
      const sale = await firstValueFrom(this.sales.create(payload));
      // Marked before navigating so the guard does not challenge a sale that
      // is already registered.
      this.submitted.set(true);
      await this.router.navigate(['/ventas', sale.id]);
    } catch (error) {
      this.saleError.set(toMessage(error, 'No se pudo registrar la venta.'));
    } finally {
      this.saving.set(false);
    }
  }

  protected retry(): void {
    void this.load();
  }

  // ── Loading ────────────────────────────────────────────────────────────

  private async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      const [session, products, clients, stock] = await Promise.all([
        firstValueFrom(this.cash.current()),
        firstValueFrom(
          this.products.list({ pageSize: PICKER_SIZE, isActive: true }),
        ),
        firstValueFrom(this.clients.list({ pageSize: PICKER_SIZE })),
        firstValueFrom(this.inventory.listStock({ pageSize: PICKER_SIZE })),
      ]);
      this.hasOpenSession.set(session !== null);
      this.catalog.set([...products.items]);
      this.clientOptions.set([...clients.items]);
      this.stockByProduct.set(toStockMap(stock.items));
    } catch (error) {
      this.loadError.set(toMessage(error, 'No se pudo cargar el mostrador.'));
    } finally {
      this.loading.set(false);
    }
  }

  private newRow(productId: string, unitPrice: number): ItemRow {
    return this.fb.group({
      productId: this.fb.control(productId, [Validators.required]),
      quantity: this.fb.control(1, [Validators.required, Validators.min(1)]),
      unitPrice: this.fb.control(unitPrice, [Validators.min(0)]),
    });
  }
}

function toStockMap(rows: readonly WarehouseStock[]): Record<string, number> {
  return Object.fromEntries(
    rows.map((row) => [row.productId, Number(row.quantity ?? 0)]),
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
