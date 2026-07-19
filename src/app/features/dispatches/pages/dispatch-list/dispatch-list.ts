import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';
import { Table, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

import { AuthSession } from '../../../../core/auth/auth-session';
import { LazyList } from '../../../../core/http/lazy-list';
import type { Product } from '../../../products/models/product.model';
import { ProductDataClient } from '../../../products/services/product-data';
import { UserDataClient } from '../../../users/services/user-data';
import {
  DISPATCH_STATUS_LABELS,
  DISPATCH_STATUS_SEVERITY,
  type Dispatch,
  type DispatchStatus,
} from '../../models/dispatch.model';
import { DispatchDataClient } from '../../services/dispatch-data';

interface StatusOption {
  readonly label: string;
  readonly value: DispatchStatus | null;
}

/** Sellers and products are bounded lookups joined to the paginated dispatches. */
const LOOKUP_SIZE = 100;

@Component({
  selector: 'app-dispatch-list',
  imports: [
    DatePipe,
    FormsModule,
    RouterLink,
    ButtonModule,
    DialogModule,
    SelectModule,
    SkeletonModule,
    TableModule,
    TagModule,
  ],
  templateUrl: './dispatch-list.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DispatchList implements OnInit {
  private readonly dispatches = inject(DispatchDataClient);
  private readonly users = inject(UserDataClient);
  private readonly products = inject(ProductDataClient);
  private readonly auth = inject(AuthSession);
  private readonly table = viewChild.required<Table>('dt');

  protected readonly rowsPerPageOptions = [5, 10, 20, 50];
  protected readonly skeletonRows = [0, 1, 2, 3, 4];

  protected readonly canManage = computed(() => {
    const role = this.auth.role();
    return role === 'ADMIN' || role === 'SUPERVISOR';
  });

  protected readonly statusFilterOptions: StatusOption[] = [
    { label: 'Todos los estados', value: null },
    ...(Object.keys(DISPATCH_STATUS_LABELS) as DispatchStatus[]).map(
      (value) => ({ label: DISPATCH_STATUS_LABELS[value], value }),
    ),
  ];

  protected readonly statusFilter = signal<DispatchStatus | null>(null);

  protected readonly list = new LazyList<Dispatch>(
    (page, pageSize) =>
      this.dispatches.list({
        page,
        pageSize,
        status: this.statusFilter() ?? undefined,
      }),
    'No se pudieron cargar los despachos.',
  );

  private readonly sellerNames = signal<ReadonlyMap<string, string>>(new Map());
  private readonly productNames = signal<ReadonlyMap<string, string>>(new Map());

  // Detail dialog
  protected readonly detailOpen = signal(false);
  protected readonly detail = signal<Dispatch | null>(null);
  /** Mutable copy of the detail line items for the PrimeNG table. */
  protected readonly detailItems = computed(() => [
    ...(this.detail()?.items ?? []),
  ]);
  protected readonly acting = signal(false);
  protected readonly actionError = signal<string | null>(null);

  ngOnInit(): void {
    void this.loadLookups();
  }

  protected onStatusFilterChange(status: DispatchStatus | null): void {
    this.statusFilter.set(status);
    // reset() jumps to page 1 and re-fires onLazyLoad with the new filter.
    this.table().reset();
  }

  protected statusLabel(status: DispatchStatus): string {
    return DISPATCH_STATUS_LABELS[status];
  }

  protected statusSeverity(status: DispatchStatus): 'secondary' | 'success' | 'danger' {
    return DISPATCH_STATUS_SEVERITY[status];
  }

  protected sellerName(sellerId: string): string {
    return this.sellerNames().get(sellerId) ?? '—';
  }

  protected productName(productId: string): string {
    return this.productNames().get(productId) ?? productId;
  }

  protected totalUnits(dispatch: Dispatch): number {
    return dispatch.items.reduce((sum, item) => sum + item.quantity, 0);
  }

  protected openDetail(dispatch: Dispatch): void {
    this.detail.set(dispatch);
    this.actionError.set(null);
    this.detailOpen.set(true);
  }

  protected async confirm(): Promise<void> {
    await this.runAction((id) => this.dispatches.confirm(id));
  }

  protected async cancel(): Promise<void> {
    await this.runAction((id) => this.dispatches.cancel(id));
  }

  private async runAction(
    action: (id: string) => ReturnType<DispatchDataClient['confirm']>,
  ): Promise<void> {
    const current = this.detail();
    if (!current || this.acting()) {
      return;
    }

    this.acting.set(true);
    this.actionError.set(null);
    try {
      const updated = await firstValueFrom(action(current.id));
      this.detail.set(updated);
      this.list.reload();
    } catch (error) {
      this.actionError.set(
        toMessage(error, 'No se pudo actualizar el despacho.'),
      );
    } finally {
      this.acting.set(false);
    }
  }

  private async loadLookups(): Promise<void> {
    try {
      const [sellers, products] = await Promise.all([
        firstValueFrom(
          this.users.list({ role: 'SELLER', pageSize: LOOKUP_SIZE }),
        ),
        firstValueFrom(this.products.list({ pageSize: LOOKUP_SIZE })),
      ]);
      this.sellerNames.set(
        new Map(sellers.items.map((user) => [user.id, user.fullName])),
      );
      this.productNames.set(
        new Map(
          products.items.map((product: Product) => [product.id, product.name]),
        ),
      );
    } catch {
      // Names fall back to raw ids if the lookups fail.
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
