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
import { RouterLink } from '@angular/router';
import { firstValueFrom, type Observable } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { Table, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

import { AuthSession } from '../../../../core/auth/auth-session';
import { LazyList } from '../../../../core/http/lazy-list';
import { formatDay } from '../../../../shared/utils/date-range';
import {
  ReturnDetailDialog,
} from '../../components/return-detail-dialog/return-detail-dialog';
import {
  ReturnFilters,
  type StatusOption,
} from '../../components/return-filters/return-filters';
import {
  RETURN_STATUS_LABELS,
  RETURN_STATUS_SEVERITY,
  type Return,
  type ReturnDetail,
  type ReturnIncidentInput,
  type ReturnStatus,
  type ReturnSummary,
} from '../../models/return.model';
import { ReturnDataClient } from '../../services/return-data';
import { ReturnLookups } from '../../services/return-lookups';
import {
  toConfirmedLines,
  toSummaryView,
  toVerificationLines,
} from '../../utils/return-view';

@Component({
  selector: 'app-return-list',
  imports: [
    DatePipe,
    RouterLink,
    ButtonModule,
    TableModule,
    TagModule,
    ReturnDetailDialog,
    ReturnFilters,
  ],
  templateUrl: './return-list.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReturnList implements OnInit {
  private readonly returns = inject(ReturnDataClient);
  private readonly auth = inject(AuthSession);
  protected readonly lookups = inject(ReturnLookups);
  private readonly table = viewChild.required<Table>('dt');

  protected readonly rowsPerPageOptions = [5, 10, 20, 50];

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
  protected readonly dateRange = signal<Date[] | null>(null);

  protected readonly list = new LazyList<ReturnSummary>(
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
  private readonly detail = signal<ReturnDetail | null>(null);
  protected readonly detailLoading = signal(false);
  protected readonly detailError = signal<string | null>(null);
  protected readonly acting = signal(false);
  protected readonly actionError = signal<string | null>(null);

  protected readonly editable = computed(
    () => this.detailHeader()?.status === 'DRAFT' && this.canManage(),
  );

  protected readonly summaryView = computed(() => {
    const header = this.detailHeader();
    return header ? toSummaryView(header, this.lookups) : null;
  });

  protected readonly verificationLines = computed(() =>
    toVerificationLines(this.detail()?.items ?? [], this.lookups),
  );

  protected readonly confirmedLines = computed(() =>
    toConfirmedLines(this.detail()?.items ?? [], this.lookups),
  );

  ngOnInit(): void {
    void this.lookups.load();
  }

  /** reset() jumps to page 1 and re-fires onLazyLoad with the new filter. */
  protected onFiltersChanged(): void {
    this.table().reset();
  }

  protected statusLabel(status: ReturnStatus): string {
    return RETURN_STATUS_LABELS[status];
  }

  protected statusSeverity(
    status: ReturnStatus,
  ): 'secondary' | 'success' | 'danger' {
    return RETURN_STATUS_SEVERITY[status];
  }

  protected openDetail(ret: Return): void {
    this.detailHeader.set(ret);
    this.detail.set(null);
    this.actionError.set(null);
    this.detailError.set(null);
    this.detailOpen.set(true);
    void this.loadDetail(ret.id);
  }

  protected retryDetail(): void {
    const current = this.detailHeader();
    if (current) {
      void this.loadDetail(current.id);
    }
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
  protected async confirm(
    incidents: readonly ReturnIncidentInput[],
  ): Promise<void> {
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
