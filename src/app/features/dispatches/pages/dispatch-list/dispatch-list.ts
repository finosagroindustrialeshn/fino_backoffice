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
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';
import { Table, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';

import { AuthSession } from '../../../../core/auth/auth-session';
import { LazyList } from '../../../../core/http/lazy-list';
import { DateRangePresets } from '../../../../shared/components/date-range-presets/date-range-presets';
import { formatDay } from '../../../../shared/utils/date-range';
import type { Product } from '../../../products/models/product.model';
import { ProductDataClient } from '../../../products/services/product-data';
import { UserDataClient } from '../../../users/services/user-data';
import {
  DISPATCH_STATUS_LABELS,
  DISPATCH_STATUS_SEVERITY,
  MAX_CANCEL_REASON_LENGTH,
  MIN_CANCEL_REASON_LENGTH,
  type CancelDispatchPayload,
  type Dispatch,
  type DispatchStatus,
  type DispatchSummary,
  type DispatchStatusSeverity,
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
    DatePickerModule,
    DateRangePresets,
    DialogModule,
    SelectModule,
    SkeletonModule,
    TableModule,
    TagModule,
    TextareaModule,
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
  protected readonly sellerFilter = signal<string | null>(null);
  /** [start, end] from the range datepicker; either end may be null mid-select. */
  protected readonly dateRange = signal<Date[] | null>(null);

  private readonly sellerNames = signal<ReadonlyMap<string, string>>(new Map());
  private readonly productNames = signal<ReadonlyMap<string, string>>(new Map());

  protected readonly sellerFilterOptions = computed(() => [
    { label: 'Todos los vendedores', value: null as string | null },
    ...[...this.sellerNames()].map(([id, name]) => ({ label: name, value: id })),
  ]);

  protected readonly list = new LazyList<DispatchSummary>(
    (page, pageSize) => {
      const range = this.dateRange();
      return this.dispatches.list({
        page,
        pageSize,
        status: this.statusFilter() ?? undefined,
        sellerId: this.sellerFilter() ?? undefined,
        dateFrom: range?.[0] ? formatDay(range[0]) : undefined,
        dateTo: range?.[1] ? formatDay(range[1]) : undefined,
      });
    },
    'No se pudieron cargar los despachos.',
  );

  // Detail dialog
  protected readonly detailOpen = signal(false);
  protected readonly detail = signal<Dispatch | null>(null);
  /** Mutable copy of the detail line items for the PrimeNG table. */
  protected readonly detailItems = computed(() => [
    ...(this.detail()?.items ?? []),
  ]);
  protected readonly detailLoading = signal(false);
  protected readonly acting = signal(false);
  protected readonly actionError = signal<string | null>(null);

  // Lifecycle: DRAFT -> ASSIGNED -> RECEIVED. Cancelling is possible until the
  // load leaves the warehouse; once received there is nothing left to undo.
  protected readonly canAssign = computed(
    () => this.canManage() && this.detail()?.status === 'DRAFT',
  );
  protected readonly canReceive = computed(
    () => this.canManage() && this.detail()?.status === 'ASSIGNED',
  );
  protected readonly canCancel = computed(() => {
    const status = this.detail()?.status;
    return this.canManage() && (status === 'DRAFT' || status === 'ASSIGNED');
  });

  // Cancellation. The API demands a written reason once a dispatch is
  // ASSIGNED, because from there cancelling is one party refusing another's
  // load. On a DRAFT the back office is only discarding its own work, so the
  // reason stays optional.
  protected readonly minReasonLength = MIN_CANCEL_REASON_LENGTH;
  protected readonly maxReasonLength = MAX_CANCEL_REASON_LENGTH;
  protected readonly cancelOpen = signal(false);
  protected readonly cancelReason = signal('');

  protected readonly isCancelReasonRequired = computed(
    () => this.detail()?.status === 'ASSIGNED',
  );

  protected readonly canConfirmCancel = computed(() => {
    const reason = this.cancelReason().trim();
    if (reason.length > MAX_CANCEL_REASON_LENGTH) {
      return false;
    }
    if (this.isCancelReasonRequired()) {
      return reason.length >= MIN_CANCEL_REASON_LENGTH;
    }
    // Optional, but a reason typed too short would still be rejected.
    return reason.length === 0 || reason.length >= MIN_CANCEL_REASON_LENGTH;
  });

  ngOnInit(): void {
    void this.loadLookups();
  }

  protected onStatusFilterChange(status: DispatchStatus | null): void {
    this.statusFilter.set(status);
    // reset() jumps to page 1 and re-fires onLazyLoad with the new filter.
    this.table().reset();
  }

  protected onSellerFilterChange(sellerId: string | null): void {
    this.sellerFilter.set(sellerId);
    this.table().reset();
  }

  protected onDateRangeChange(range: Date[] | null): void {
    this.dateRange.set(range);
    // Refetch once the range is complete (both ends) or cleared.
    if (!range || range.length === 0 || (range[0] && range[1])) {
      this.table().reset();
    }
  }

  protected statusLabel(status: DispatchStatus): string {
    return DISPATCH_STATUS_LABELS[status];
  }

  protected statusSeverity(status: DispatchStatus): DispatchStatusSeverity {
    return DISPATCH_STATUS_SEVERITY[status];
  }

  /** Dispatches created before the API required the field carry no number. */
  protected orderNumber(value: number | null | undefined): string {
    return value === null || value === undefined ? '—' : `${value}`;
  }

  /**
   * Line count for a list row. The LIST endpoint sends `itemsCount` (list
   * rows carry no `items` to count), so a missing value means the API did not
   * report one — shown as a dash rather than a misleading zero.
   */
  protected itemsCount(value: number | null | undefined): string {
    return value === null || value === undefined ? '—' : `${value}`;
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

  /**
   * List rows carry no line items, so the detail is fetched on open. Without
   * this the dialog silently rendered an empty product table.
   */
  protected openDetail(dispatch: DispatchSummary): void {
    this.detail.set(null);
    this.actionError.set(null);
    this.cancelOpen.set(false);
    this.cancelReason.set('');
    this.detailOpen.set(true);
    void this.loadDetail(dispatch.id);
  }

  private async loadDetail(id: string): Promise<void> {
    this.detailLoading.set(true);
    try {
      this.detail.set(await firstValueFrom(this.dispatches.get(id)));
    } catch (error) {
      this.actionError.set(
        toMessage(error, 'No se pudo cargar el detalle del despacho.'),
      );
    } finally {
      this.detailLoading.set(false);
    }
  }

  protected async assign(): Promise<void> {
    await this.runAction((id) => this.dispatches.assign(id));
  }

  protected async receive(): Promise<void> {
    await this.runAction((id) => this.dispatches.receive(id));
  }

  /** Opens the reason prompt rather than cancelling straight away. */
  protected openCancel(): void {
    this.cancelReason.set('');
    this.cancelOpen.set(true);
  }

  protected async confirmCancel(): Promise<void> {
    if (!this.canConfirmCancel()) {
      return;
    }
    const reason = this.cancelReason().trim();
    const payload: CancelDispatchPayload = reason ? { reason } : {};
    await this.runAction((id) => this.dispatches.cancel(id, payload));
    // Only close once it actually went through; on failure the dialog stays
    // open with the text the user typed, next to the error explaining why.
    if (!this.actionError()) {
      this.cancelOpen.set(false);
    }
  }

  private async runAction(
    action: (id: string) => ReturnType<DispatchDataClient['assign']>,
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

