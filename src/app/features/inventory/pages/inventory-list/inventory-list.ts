import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { DatePipe } from '@angular/common';
import {
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';

import { AuthSession } from '../../../../core/auth/auth-session';
import { LazyList } from '../../../../core/http/lazy-list';
import type { Product } from '../../../products/models/product.model';
import { ProductDataClient } from '../../../products/services/product-data';
import type {
  InventoryMovement,
  MovementType,
  WarehouseStock,
} from '../../models/inventory.model';
import { InventoryDataClient } from '../../services/inventory-data';

interface MovementOption {
  readonly label: string;
  readonly type: MovementType;
  readonly sign: 1 | -1;
}

type HistoryState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly movements: InventoryMovement[] }
  | { readonly status: 'error'; readonly message: string };

const MOVEMENT_LABELS: Record<MovementType, string> = {
  PURCHASE: 'Compra',
  RETURN_IN: 'Retorno',
  DISPATCH_OUT: 'Despacho',
  ADJUSTMENT: 'Ajuste',
};

const LOW_STOCK_THRESHOLD = 10;
/** Stock balances are a bounded lookup joined to the paginated products. */
const STOCK_LOOKUP_SIZE = 100;

@Component({
  selector: 'app-inventory-list',
  imports: [
    DatePipe,
    ReactiveFormsModule,
    ButtonModule,
    DialogModule,
    InputNumberModule,
    SelectModule,
    SkeletonModule,
    TableModule,
    TagModule,
    TextareaModule,
  ],
  templateUrl: './inventory-list.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InventoryList implements OnInit {
  private readonly inventory = inject(InventoryDataClient);
  private readonly products = inject(ProductDataClient);
  private readonly auth = inject(AuthSession);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly skeletonRows = [0, 1, 2, 3, 4];
  protected readonly canManage = computed(() => {
    const role = this.auth.role();
    return role === 'ADMIN' || role === 'SUPERVISOR';
  });

  protected readonly list = new LazyList<Product>(
    (page, pageSize) => this.products.list({ page, pageSize }),
    'No se pudo cargar el inventario.',
  );

  private readonly stockByProduct = signal<ReadonlyMap<string, WarehouseStock>>(
    new Map(),
  );

  protected readonly typeOptions: MovementOption[] = [
    { label: 'Compra (entrada)', type: 'PURCHASE', sign: 1 },
    { label: 'Retorno (entrada)', type: 'RETURN_IN', sign: 1 },
    { label: 'Despacho (salida)', type: 'DISPATCH_OUT', sign: -1 },
    { label: 'Ajuste — sumar', type: 'ADJUSTMENT', sign: 1 },
    { label: 'Ajuste — restar', type: 'ADJUSTMENT', sign: -1 },
  ];

  // Register-movement dialog
  protected readonly registerOpen = signal(false);
  protected readonly registerProduct = signal<Product | null>(null);
  protected readonly registering = signal(false);
  protected readonly registerError = signal<string | null>(null);
  protected readonly form = this.fb.group({
    option: this.fb.control(this.typeOptions[0], [Validators.required]),
    quantity: this.fb.control(1, [Validators.required, Validators.min(1)]),
    note: this.fb.control(''),
  });

  // History dialog
  protected readonly historyOpen = signal(false);
  protected readonly historyProduct = signal<Product | null>(null);
  protected readonly historyState = signal<HistoryState>({ status: 'loading' });

  ngOnInit(): void {
    void this.loadStock();
  }

  protected movementLabel(type: MovementType): string {
    return MOVEMENT_LABELS[type];
  }

  protected quantityFor(product: Product): number {
    return this.stockByProduct().get(product.id)?.quantity ?? 0;
  }

  protected updatedAtFor(product: Product): string | null {
    return this.stockByProduct().get(product.id)?.updatedAt ?? null;
  }

  protected stockSeverity(quantity: number): 'danger' | 'warn' | 'success' {
    if (quantity <= 0) {
      return 'danger';
    }
    return quantity <= LOW_STOCK_THRESHOLD ? 'warn' : 'success';
  }

  protected stockLabel(quantity: number): string {
    if (quantity <= 0) {
      return 'Sin stock';
    }
    return quantity <= LOW_STOCK_THRESHOLD ? 'Bajo' : 'OK';
  }

  private async loadStock(): Promise<void> {
    try {
      const result = await firstValueFrom(
        this.inventory.listStock({ pageSize: STOCK_LOOKUP_SIZE }),
      );
      this.stockByProduct.set(
        new Map(result.items.map((stock) => [stock.productId, stock])),
      );
    } catch {
      // Balances fall back to 0 if the stock lookup fails.
    }
  }

  protected openRegister(product: Product): void {
    this.registerProduct.set(product);
    this.registerError.set(null);
    this.form.reset({ option: this.typeOptions[0], quantity: 1, note: '' });
    this.registerOpen.set(true);
  }

  protected async submitMovement(): Promise<void> {
    const product = this.registerProduct();
    if (!product || this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.registering.set(true);
    this.registerError.set(null);

    const { option, quantity, note } = this.form.getRawValue();
    try {
      const updated = await firstValueFrom(
        this.inventory.registerMovement(product.id, {
          type: option.type,
          quantity: option.sign * quantity,
          note: note.trim() || null,
        }),
      );
      this.stockByProduct.update((current) =>
        new Map(current).set(product.id, updated),
      );
      this.registerOpen.set(false);
    } catch (error) {
      this.registerError.set(
        this.toMessage(error, 'No se pudo registrar el movimiento.'),
      );
    } finally {
      this.registering.set(false);
    }
  }

  protected openHistory(product: Product): void {
    this.historyProduct.set(product);
    this.historyOpen.set(true);
    void this.loadHistory(product.id);
  }

  private async loadHistory(productId: string): Promise<void> {
    this.historyState.set({ status: 'loading' });
    try {
      const movements = await firstValueFrom(
        this.inventory.listMovements(productId),
      );
      this.historyState.set({ status: 'success', movements });
    } catch (error) {
      this.historyState.set({
        status: 'error',
        message: this.toMessage(error, 'No se pudo cargar el historial.'),
      });
    }
  }

  private toMessage(error: unknown, fallback: string): string {
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
}
