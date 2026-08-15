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
import { firstValueFrom, type Observable } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';
import { Table, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

import { AuthSession } from '../../../../core/auth/auth-session';
import type { UserProfile } from '../../../../core/auth/user-profile.model';
import { LazyList } from '../../../../core/http/lazy-list';
import { DateRangePresets } from '../../../../shared/components/date-range-presets/date-range-presets';
import { formatDay } from '../../../../shared/utils/date-range';
import type { ReturnReason } from '../../../catalogs/return-reasons/models/return-reason.model';
import { ReturnReasonDataClient } from '../../../catalogs/return-reasons/services/return-reason-data';
import type { Product } from '../../../products/models/product.model';
import { ProductDataClient } from '../../../products/services/product-data';
import { UserDataClient } from '../../../users/services/user-data';
import {
  RETURN_STATUS_LABELS,
  RETURN_STATUS_SEVERITY,
  type Return,
  type ReturnDetail,
  type ReturnIncidentInput,
  type ReturnStatus,
} from '../../models/return.model';
import { ReturnDataClient } from '../../services/return-data';

interface StatusOption {
  readonly label: string;
  readonly value: ReturnStatus | null;
}

/**
 * One editable line of the verification: how much of what the seller declared
 * is written off, and why. Whatever is left goes back to the warehouse.
 */
interface IncidentDraft {
  readonly productId: string;
  /** What the seller declared for this product — the line's total. */
  readonly declared: number;
  readonly flaggedBySeller: boolean;
  readonly sellerNote: string | null;
  readonly quantityMerma: number;
  readonly reasonId: string | null;
}

/** Sellers, products and reasons are bounded lookups joined to the returns. */
const LOOKUP_SIZE = 100;

@Component({
  selector: 'app-return-list',
  imports: [
    DatePipe,
    FormsModule,
    RouterLink,
    ButtonModule,
    DatePickerModule,
    DateRangePresets,
    DialogModule,
    InputNumberModule,
    SelectModule,
    SkeletonModule,
    TableModule,
    TagModule,
  ],
  templateUrl: './return-list.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReturnList implements OnInit {
  private readonly returns = inject(ReturnDataClient);
  private readonly users = inject(UserDataClient);
  private readonly products = inject(ProductDataClient);
  private readonly reasons = inject(ReturnReasonDataClient);
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
    ...(Object.keys(RETURN_STATUS_LABELS) as ReturnStatus[]).map((value) => ({
      label: RETURN_STATUS_LABELS[value],
      value,
    })),
  ];

  protected readonly statusFilter = signal<ReturnStatus | null>(null);
  protected readonly sellerFilter = signal<string | null>(null);
  /** [start, end] from the range datepicker; either end may be null mid-select. */
  protected readonly dateRange = signal<Date[] | null>(null);

  /**
   * Every user, not only sellers: a return also names who declared it and who
   * verified it, and those are back-office people.
   */
  private readonly users$ = signal<readonly UserProfile[]>([]);
  private readonly userNames = computed(
    () => new Map(this.users$().map((user) => [user.id, user.fullName])),
  );
  private readonly productNames = signal<ReadonlyMap<string, string>>(new Map());
  private readonly reasonNames = signal<ReadonlyMap<string, string>>(new Map());
  /** Only active reasons are offered for NEW merma; history keeps its own. */
  protected readonly reasonOptions = signal<ReturnReason[]>([]);

  protected readonly sellerFilterOptions = computed(() => [
    { label: 'Todos los vendedores', value: null as string | null },
    ...this.users$()
      .filter((user) => user.role === 'SELLER')
      .map((user) => ({ label: user.fullName, value: user.id as string | null })),
  ]);

  protected readonly list = new LazyList<Return>(
    (page, pageSize) => {
      const range = this.dateRange();
      return this.returns.list({
        page,
        pageSize,
        status: this.statusFilter() ?? undefined,
        sellerId: this.sellerFilter() ?? undefined,
        dateFrom: range?.[0] ? formatDay(range[0]) : undefined,
        dateTo: range?.[1] ? formatDay(range[1]) : undefined,
      });
    },
    'No se pudieron cargar los retornos.',
  );

  // Detail dialog
  protected readonly detailOpen = signal(false);
  /** Header from the row, shown immediately while the lines are fetched. */
  protected readonly detailHeader = signal<Return | null>(null);
  protected readonly detail = signal<ReturnDetail | null>(null);
  protected readonly detailLoading = signal(false);
  protected readonly detailError = signal<string | null>(null);
  /** Mutable copy of the detail line items for the PrimeNG table. */
  protected readonly detailItems = computed(() => [
    ...(this.detail()?.items ?? []),
  ]);
  protected readonly acting = signal(false);
  protected readonly actionError = signal<string | null>(null);

  /**
   * The verification draft, one row per declared line. Only meaningful while
   * the return is DRAFT — once confirmed the split is history, not an input.
   */
  protected readonly incidents = signal<IncidentDraft[]>([]);

  protected readonly isDraft = computed(
    () => this.detailHeader()?.status === 'DRAFT',
  );

  /** Rows the user actually wrote off; everything else goes back intact. */
  private readonly writtenOff = computed(() =>
    this.incidents().filter((row) => row.quantityMerma > 0),
  );

  /**
   * Blocking problems with the draft. The API rejects these too, but catching
   * them here keeps the user from losing the whole form to a 400.
   */
  protected readonly incidentErrors = computed(() => {
    const errors: string[] = [];
    for (const row of this.writtenOff()) {
      const name = this.productName(row.productId);
      if (row.quantityMerma > row.declared) {
        errors.push(
          `${name}: la merma (${row.quantityMerma}) supera lo declarado (${row.declared}).`,
        );
      }
      if (!row.reasonId) {
        errors.push(`${name}: indicá el motivo de la merma.`);
      }
    }
    return errors;
  });

  protected readonly canConfirm = computed(
    () => this.incidentErrors().length === 0,
  );

  /** What the seller declared in total — the line totals never change. */
  protected readonly totalDeclared = computed(() =>
    this.incidents().reduce((sum, row) => sum + row.declared, 0),
  );

  /** Live preview of the split the confirm would persist. */
  protected readonly draftMerma = computed(() =>
    this.incidents().reduce((sum, row) => sum + row.quantityMerma, 0),
  );

  protected readonly draftReturned = computed(
    () => this.totalDeclared() - this.draftMerma(),
  );

  /** Confirmed totals, read off the persisted lines. */
  protected readonly totalReturned = computed(() =>
    this.detailItems().reduce((sum, item) => sum + item.quantityReturned, 0),
  );

  protected readonly totalMerma = computed(() =>
    this.detailItems().reduce((sum, item) => sum + item.quantityMerma, 0),
  );

  ngOnInit(): void {
    void this.loadLookups();
  }

  protected onStatusFilterChange(status: ReturnStatus | null): void {
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

  protected statusLabel(status: ReturnStatus): string {
    return RETURN_STATUS_LABELS[status];
  }

  protected statusSeverity(
    status: ReturnStatus,
  ): 'secondary' | 'success' | 'danger' {
    return RETURN_STATUS_SEVERITY[status];
  }

  protected sellerName(sellerId: string): string {
    return this.userNames().get(sellerId) ?? '—';
  }

  protected userName(userId: string | null): string {
    if (!userId) {
      return '—';
    }
    return this.userNames().get(userId) ?? userId;
  }

  protected productName(productId: string): string {
    return this.productNames().get(productId) ?? productId;
  }

  protected reasonName(reasonId: string | null): string {
    if (!reasonId) {
      return '—';
    }
    return this.reasonNames().get(reasonId) ?? reasonId;
  }

  protected setMerma(productId: string, quantityMerma: number | null): void {
    this.patchIncident(productId, { quantityMerma: quantityMerma ?? 0 });
  }

  protected setReason(productId: string, reasonId: string | null): void {
    this.patchIncident(productId, { reasonId });
  }

  private patchIncident(
    productId: string,
    patch: Partial<Pick<IncidentDraft, 'quantityMerma' | 'reasonId'>>,
  ): void {
    this.incidents.update((rows) =>
      rows.map((row) =>
        row.productId === productId ? { ...row, ...patch } : row,
      ),
    );
  }

  protected openDetail(ret: Return): void {
    this.detailHeader.set(ret);
    this.detail.set(null);
    this.incidents.set([]);
    this.actionError.set(null);
    this.detailError.set(null);
    this.detailOpen.set(true);
    void this.loadDetail(ret.id);
  }

  /**
   * The list endpoint returns headers only, so the lines are fetched here.
   * Reading them off the row is what used to leave the dialog permanently
   * empty.
   */
  private async loadDetail(id: string): Promise<void> {
    this.detailLoading.set(true);
    this.detailError.set(null);
    try {
      const detail = await firstValueFrom(this.returns.get(id));
      // Ignore a response for a row the user already navigated away from.
      if (this.detailHeader()?.id !== id) {
        return;
      }
      this.detail.set(detail);
      // While DRAFT the whole quantity sits in quantityReturned — that is the
      // line total the write-off is taken out of.
      this.incidents.set(
        detail.items.map((item) => ({
          productId: item.productId,
          declared: item.quantityReturned + item.quantityMerma,
          flaggedBySeller: item.flaggedBySeller,
          sellerNote: item.sellerNote,
          quantityMerma: item.quantityMerma,
          reasonId: item.reasonId,
        })),
      );
    } catch (error) {
      if (this.detailHeader()?.id !== id) {
        return;
      }
      this.detailError.set(
        toMessage(error, 'No se pudo cargar el detalle del retorno.'),
      );
    } finally {
      this.detailLoading.set(false);
    }
  }

  /**
   * Confirming persists the returned/merma split. Sending no incidents is a
   * real, meaningful choice — it accepts the whole return as clean surplus.
   */
  protected async confirm(): Promise<void> {
    if (!this.canConfirm()) {
      return;
    }
    const incidents: ReturnIncidentInput[] = this.writtenOff().map((row) => ({
      productId: row.productId,
      quantityMerma: row.quantityMerma,
      // Guarded by canConfirm(): a written-off row always carries a reason.
      reasonId: row.reasonId as string,
    }));
    await this.runAction((id) =>
      this.returns.confirm(id, incidents.length > 0 ? { incidents } : {}),
    );
  }

  protected async cancel(): Promise<void> {
    await this.runAction((id) => this.returns.cancel(id));
  }

  private async runAction(
    action: (id: string) => Observable<Return>,
  ): Promise<void> {
    const current = this.detailHeader();
    if (!current || this.acting()) {
      return;
    }

    this.acting.set(true);
    this.actionError.set(null);
    try {
      const updated = await firstValueFrom(action(current.id));
      // The action returns the header only, so the status is refreshed from
      // it and the lines are refetched rather than assumed to have come back.
      this.detailHeader.set(updated);
      this.list.reload();
      await this.loadDetail(current.id);
    } catch (error) {
      this.actionError.set(
        toMessage(error, 'No se pudo actualizar el retorno.'),
      );
    } finally {
      this.acting.set(false);
    }
  }

  private async loadLookups(): Promise<void> {
    try {
      const [users, products, reasons] = await Promise.all([
        firstValueFrom(this.users.list({ pageSize: LOOKUP_SIZE })),
        firstValueFrom(this.products.list({ pageSize: LOOKUP_SIZE })),
        firstValueFrom(
          this.reasons.list({ pageSize: LOOKUP_SIZE, includeInactive: true }),
        ),
      ]);
      this.users$.set(users.items);
      this.productNames.set(
        new Map(
          products.items.map((product: Product) => [product.id, product.name]),
        ),
      );
      this.reasonNames.set(
        new Map(reasons.items.map((reason) => [reason.id, reason.name])),
      );
      this.reasonOptions.set(reasons.items.filter((reason) => reason.isActive));
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
