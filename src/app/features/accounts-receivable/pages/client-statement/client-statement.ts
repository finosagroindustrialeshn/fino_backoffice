import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Params, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { SkeletonModule } from 'primeng/skeleton';
import { TableModule } from 'primeng/table';

import { formatDay, type DateRange } from '../../../../shared/utils/date-range';
import { parseRange, parseUuid } from '../../../../shared/utils/query-params';
import { SALE_STATUS_LABELS } from '../../../sales/models/sale.model';
import type { Sale, SaleStatus } from '../../../sales/models/sale.model';
import {
  AGING_SEVERITY_LABELS,
  STATEMENT_ENTRY_LABELS,
  agingRangeLabel,
  agingSeverity,
  type AgingBucket,
  type AgingReport,
  type AgingSeverity,
  type ClientReceivable,
  type ClientStatement as ClientStatementData,
  type StatementEntry,
  type StatementEntryKind,
} from '../../models/accounts-receivable.model';
import { AccountsReceivableDataClient } from '../../services/accounts-receivable-data';

/** The client's open credit sales plus its own aging — both range-independent. */
interface AccountData {
  readonly receivable: ClientReceivable;
  readonly aging: AgingReport;
}

type AccountState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly account: AccountData }
  | { readonly status: 'error'; readonly message: string };

type StatementState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly statement: ClientStatementData }
  | { readonly status: 'error'; readonly message: string };

const INVALID_CLIENT_MESSAGE = 'El identificador del cliente no es válido.';
const NOT_FOUND_MESSAGE = 'No se encontró el cliente solicitado.';

@Component({
  selector: 'app-client-statement',
  imports: [
    CurrencyPipe,
    DatePipe,
    DecimalPipe,
    FormsModule,
    RouterLink,
    ButtonModule,
    DatePickerModule,
    SkeletonModule,
    TableModule,
  ],
  templateUrl: './client-statement.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClientAccountStatement implements OnInit {
  private readonly receivables = inject(AccountsReceivableDataClient);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly rowsPerPageOptions = [10, 20, 50];
  protected readonly skeletonCards = [0, 1, 2];
  protected readonly severityLabels = AGING_SEVERITY_LABELS;
  protected readonly entryLabels = STATEMENT_ENTRY_LABELS;
  protected readonly saleStatusLabels = SALE_STATUS_LABELS;

  private readonly pathParams = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });

  /**
   * The URL is the single source of truth for the statement window: the
   * datepicker only navigates, and this computed reads the result back, so a
   * refresh or a shared link reproduces exactly the same statement.
   */
  private readonly queryParams = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  /** Route params are user input too — a hand-edited id never reaches the API. */
  protected readonly clientId = computed(() =>
    parseUuid(this.pathParams().get('clientId')),
  );

  /** No range means the whole history, which is the useful default here. */
  protected readonly dateRange = computed<DateRange>(() => {
    const params = this.queryParams();
    return parseRange(params.get('dateFrom'), params.get('dateTo'));
  });

  protected readonly accountState = signal<AccountState>({ status: 'loading' });
  protected readonly statementState = signal<StatementState>({
    status: 'loading',
  });

  /** Name resolved from whichever request landed first. */
  protected readonly clientName = computed(() => {
    const account = this.accountState();
    if (account.status === 'success') {
      return account.account.receivable.clientName;
    }
    const statement = this.statementState();
    return statement.status === 'success' ? statement.statement.clientName : '';
  });

  protected readonly buckets = computed<readonly AgingBucket[]>(() => {
    const state = this.accountState();
    return state.status === 'success' ? state.account.aging.buckets : [];
  });

  /** True once the user narrowed the ledger, which is when opening matters. */
  protected readonly hasRange = computed(() => this.dateRange() !== null);

  /** Copied out of the readonly DTO because `p-table` takes a mutable array. */
  protected readonly entries = computed<StatementEntry[]>(() => {
    const state = this.statementState();
    return state.status === 'success' ? [...state.statement.entries] : [];
  });

  protected readonly openSales = computed<Sale[]>(() => {
    const state = this.accountState();
    return state.status === 'success' ? [...state.account.receivable.sales] : [];
  });

  /** Changes to the window — and only those — refetch the ledger. */
  private readonly rangeKey = computed(() => JSON.stringify(this.range()));

  constructor() {
    // Both effects skip their own first run: ngOnInit already performs the
    // initial load, so an unguarded effect would double every request.
    let isFirstClientRun = true;
    effect(() => {
      this.clientId();
      if (isFirstClientRun) {
        isFirstClientRun = false;
        return;
      }
      void this.loadAccount();
      void this.loadStatement();
    });

    let isFirstRangeRun = true;
    effect(() => {
      this.rangeKey();
      if (isFirstRangeRun) {
        isFirstRangeRun = false;
        return;
      }
      // The range windows the ledger only; the aging and the open sales are
      // always the client's current position.
      void this.loadStatement();
    });
  }

  ngOnInit(): void {
    void this.loadAccount();
    void this.loadStatement();
  }

  protected async loadAccount(): Promise<void> {
    const clientId = this.clientId();
    if (!clientId) {
      this.accountState.set({
        status: 'error',
        message: INVALID_CLIENT_MESSAGE,
      });
      return;
    }
    this.accountState.set({ status: 'loading' });
    try {
      const [receivable, aging] = await Promise.all([
        firstValueFrom(this.receivables.clientReceivable(clientId)),
        firstValueFrom(this.receivables.aging({ clientId })),
      ]);
      this.accountState.set({
        status: 'success',
        account: { receivable, aging },
      });
    } catch (error) {
      this.accountState.set({
        status: 'error',
        message: toMessage(error, 'No se pudo cargar la cuenta del cliente.'),
      });
    }
  }

  protected async loadStatement(): Promise<void> {
    const clientId = this.clientId();
    if (!clientId) {
      this.statementState.set({
        status: 'error',
        message: INVALID_CLIENT_MESSAGE,
      });
      return;
    }
    this.statementState.set({ status: 'loading' });
    try {
      const statement = await firstValueFrom(
        this.receivables.clientStatement(clientId, this.range()),
      );
      this.statementState.set({ status: 'success', statement });
    } catch (error) {
      this.statementState.set({
        status: 'error',
        message: toMessage(error, 'No se pudo cargar el estado de cuenta.'),
      });
    }
  }

  protected refreshAll(): void {
    void this.loadAccount();
    void this.loadStatement();
  }

  protected onDateRangeChange(range: Date[] | null): void {
    // Half-picked ranges are ignored until the second bound lands.
    if (range && range[0] && !range[1]) {
      return;
    }
    this.patchParams({
      dateFrom: range?.[0] ? formatDay(range[0]) : null,
      dateTo: range?.[1] ? formatDay(range[1]) : null,
    });
  }

  protected severityOf(bucket: AgingBucket): AgingSeverity {
    return agingSeverity(bucket);
  }

  protected rangeLabelOf(bucket: AgingBucket): string {
    return agingRangeLabel(bucket);
  }

  /** The charge column: a SALE line debits the account, a PAYMENT never does. */
  protected chargeOf(entry: StatementEntry): number | null {
    return entry.kind === 'SALE' ? entry.total : null;
  }

  /** The credit column: only an abono reduces the balance. */
  protected creditOf(entry: StatementEntry): number | null {
    return entry.kind === 'PAYMENT' ? entry.paymentAmount : null;
  }

  protected statusLabel(status: SaleStatus | null): string {
    return status ? this.saleStatusLabels[status] : '';
  }

  /**
   * Indexed through a typed method rather than in the template: `let-entry`
   * is untyped, so indexing the Record directly is an implicit `any`.
   */
  protected entryLabel(kind: StatementEntryKind): string {
    return this.entryLabels[kind];
  }

  private range(): { dateFrom?: string; dateTo?: string } {
    const [from, to] = this.dateRange() ?? [];
    if (!from || !to) {
      return {};
    }
    return { dateFrom: formatDay(from), dateTo: formatDay(to) };
  }

  /** Merges into the current query params; a null value drops the param. */
  private patchParams(patch: Params): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: patch,
      queryParamsHandling: 'merge',
    });
  }
}

function toMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object') {
    const candidate = error as { status?: unknown; message?: unknown };
    if (candidate.status === 404) {
      return NOT_FOUND_MESSAGE;
    }
    if (typeof candidate.message === 'string') {
      return candidate.message;
    }
  }
  return fallback;
}
