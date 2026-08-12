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

import type { ApiErrorCode } from '../../../../core/http/api-error-codes';
import { isApiError } from '../../../../core/http/api-error';
import { parseUuid } from '../../../../shared/utils/query-params';
import { ExpenseCategoryDataClient } from '../../../catalogs/expense-categories/services/expense-category-data';
import type { Expense } from '../../../expenses/models/expense.model';
import { ExpenseDataClient } from '../../../expenses/services/expense-data';
import { UserDataClient } from '../../../users/services/user-data';
import { ShiftCloseDialog } from '../../components/shift-close-dialog/shift-close-dialog';
import {
  CASH_DIFFERENCE_LABELS,
  CASH_DIFFERENCE_SEVERITY,
  SHIFT_STATUS_LABELS,
  SHIFT_STATUS_SEVERITY,
  cashDifferenceKind,
  type CloseShiftPayload,
  type ShiftDetail as ShiftDetailModel,
  type ShiftStatus,
  type ShiftTagSeverity,
} from '../../models/shift.model';
import { ShiftDataClient } from '../../services/shift-data';

type ShiftState =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly shift: ShiftDetailModel }
  | { readonly status: 'error'; readonly message: string };

/**
 * The in-flight close, held so a retry after a lost response replays the
 * original request instead of settling the day twice. The signature is kept
 * alongside because reusing a key with a DIFFERENT body is rejected
 * (409 IDEMPOTENCY_KEY_REUSED) — a corrected count must mint a new key.
 */
interface PendingClose {
  readonly key: string;
  readonly signature: string;
}

const INVALID_SHIFT_MESSAGE = 'El identificador de la jornada no es válido.';
const LOAD_ERROR_MESSAGE = 'No se pudo cargar la jornada.';
const CLOSE_ERROR_MESSAGE = 'No se pudo cerrar la jornada.';

/** Expense categories are a small, bounded catalog. */
const CATEGORY_LOOKUP_SIZE = 100;
/** A single shift's expenses — a day in the field never runs to hundreds. */
const EXPENSE_PAGE_SIZE = 100;

@Component({
  selector: 'app-shift-detail',
  imports: [
    CurrencyPipe,
    DatePipe,
    RouterLink,
    ButtonModule,
    ShiftCloseDialog,
    SkeletonModule,
    TableModule,
    TagModule,
  ],
  templateUrl: './shift-detail.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ShiftDetail {
  private readonly shifts = inject(ShiftDataClient);
  private readonly users = inject(UserDataClient);
  private readonly expenses = inject(ExpenseDataClient);
  private readonly categories = inject(ExpenseCategoryDataClient);
  private readonly route = inject(ActivatedRoute);
  private readonly closeDialog = viewChild(ShiftCloseDialog);

  protected readonly skeletonRows = [0, 1, 2, 3];

  private readonly pathParams = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });

  /** Route params are user input too — a hand-edited id never reaches the API. */
  protected readonly shiftId = computed(() =>
    parseUuid(this.pathParams().get('id')),
  );

  protected readonly state = signal<ShiftState>({ status: 'loading' });

  protected readonly shift = computed(() => {
    const current = this.state();
    return current.status === 'success' ? current.shift : null;
  });

  protected readonly errorMessage = computed(() => {
    const current = this.state();
    return current.status === 'error' ? current.message : null;
  });

  protected readonly liquidation = computed(
    () => this.shift()?.liquidation ?? null,
  );

  private readonly sellerName = signal<string | null>(null);
  private readonly closedByName = signal<string | null>(null);
  private readonly categoryNames = signal<ReadonlyMap<string, string>>(
    new Map(),
  );

  /** Mutable copy: PrimeNG's `[value]` input rejects readonly arrays. */
  protected readonly shiftExpenses = signal<Expense[]>([]);
  protected readonly expensesLoading = signal(false);

  protected readonly closeOpen = signal(false);
  protected readonly closing = signal(false);
  protected readonly closeError = signal<string | null>(null);
  private readonly closeErrorCode = signal<ApiErrorCode | null>(null);
  private pendingClose: PendingClose | null = null;

  /**
   * A close blocked by a pending stock return is not a dead end: the return
   * has to be confirmed first, so point at where that happens instead of
   * leaving the supervisor to work out which screen they need.
   */
  protected readonly closeErrorAction = computed(() =>
    this.closeErrorCode() === 'SHIFT_RETURN_PENDING'
      ? { label: 'Ir a Retornos', route: '/retorno' }
      : null,
  );

  protected readonly isOpen = computed(() => this.shift()?.status === 'OPEN');

  /**
   * The counted cash is only meaningful once the shift is closed; while it is
   * open the API reports a live, still-moving liquidation.
   */
  protected readonly difference = computed(
    () => this.liquidation()?.cashDifference ?? null,
  );

  protected readonly differenceLabel = computed(() => {
    const difference = this.difference();
    return difference === null
      ? null
      : CASH_DIFFERENCE_LABELS[cashDifferenceKind(difference)];
  });

  protected readonly differenceSeverity = computed<ShiftTagSeverity | null>(
    () => {
      const difference = this.difference();
      return difference === null
        ? null
        : CASH_DIFFERENCE_SEVERITY[cashDifferenceKind(difference)];
    },
  );

  protected readonly differenceAmount = computed(() => {
    const difference = this.difference();
    return difference === null ? null : Math.abs(difference);
  });

  protected readonly expensesTotal = computed(() =>
    this.shiftExpenses().reduce((sum, expense) => sum + Number(expense.amount), 0),
  );

  constructor() {
    effect(() => {
      const id = this.shiftId();
      if (!id) {
        this.state.set({ status: 'error', message: INVALID_SHIFT_MESSAGE });
        return;
      }
      void this.load(id);
    });

    void this.loadCategoryNames();
  }

  protected statusLabel(status: ShiftStatus): string {
    return SHIFT_STATUS_LABELS[status];
  }

  protected statusSeverity(status: ShiftStatus): ShiftTagSeverity {
    return SHIFT_STATUS_SEVERITY[status];
  }

  protected categoryName(categoryId: string): string {
    return this.categoryNames().get(categoryId) ?? '—';
  }

  protected displaySeller(): string {
    return this.sellerName() ?? '…';
  }

  protected displayClosedBy(): string {
    return this.closedByName() ?? '…';
  }

  protected openCloseDialog(): void {
    this.closeError.set(null);
    this.closeErrorCode.set(null);
    this.closeDialog()?.reset();
    this.closeOpen.set(true);
  }

  protected async closeShift(payload: CloseShiftPayload): Promise<void> {
    const shift = this.shift();
    if (!shift || this.closing()) {
      return;
    }

    // A corrected count is a different operation, so it needs its own key; an
    // unchanged one reuses the key and lets the API replay the original close.
    const signature = `${payload.closingCash}|${payload.notes ?? ''}`;
    if (this.pendingClose?.signature !== signature) {
      this.pendingClose = { key: crypto.randomUUID(), signature };
    }

    this.closing.set(true);
    this.closeError.set(null);
    this.closeErrorCode.set(null);
    try {
      const updated = await firstValueFrom(
        this.shifts.close(shift.id, payload, this.pendingClose.key),
      );
      this.state.set({ status: 'success', shift: updated });
      this.pendingClose = null;
      this.closeOpen.set(false);
      void this.loadParties(updated);
    } catch (error) {
      const code = isApiError(error) ? (error.code ?? null) : null;
      this.closeError.set(toMessage(error, CLOSE_ERROR_MESSAGE));
      this.closeErrorCode.set(code);

      // A close rejected by a precondition never happened, so the key must
      // not be replayed: once the block is cleared, the retry is a genuinely
      // new operation and reusing the key risks replaying the original 409.
      //
      // IDEMPOTENCY_IN_PROGRESS is the exception the spec calls out by name —
      // there the original request IS still running, and the instruction is
      // to back off and retry with the SAME key. Minting a new one there
      // would run the close a second time.
      if (code && code !== 'IDEMPOTENCY_IN_PROGRESS' && isRejection(code)) {
        this.pendingClose = null;
      }
    } finally {
      this.closing.set(false);
    }
  }

  protected retry(): void {
    const id = this.shiftId();
    if (id) {
      void this.load(id);
    }
  }

  private async load(id: string): Promise<void> {
    this.state.set({ status: 'loading' });
    this.sellerName.set(null);
    this.closedByName.set(null);
    try {
      const shift = await firstValueFrom(this.shifts.get(id));
      this.state.set({ status: 'success', shift });
      void this.loadParties(shift);
      void this.loadExpenses(shift.id);
    } catch (error) {
      this.state.set({
        status: 'error',
        message: toMessage(error, LOAD_ERROR_MESSAGE),
      });
    }
  }

  /**
   * The shift carries ids only. Names are fetched per party rather than from a
   * paginated lookup so a seller outside the first page still resolves.
   */
  private async loadParties(shift: ShiftDetailModel): Promise<void> {
    const [seller, closedBy] = await Promise.allSettled([
      firstValueFrom(this.users.get(shift.sellerId)),
      shift.closedById
        ? firstValueFrom(this.users.get(shift.closedById))
        : Promise.resolve(null),
    ]);

    if (seller.status === 'fulfilled') {
      this.sellerName.set(seller.value.fullName);
    }
    if (closedBy.status === 'fulfilled' && closedBy.value) {
      this.closedByName.set(closedBy.value.fullName);
    }
  }

  /**
   * Expenses are shown inline because they are what makes the liquidation add
   * up: `expectedCash` already has them subtracted, so a supervisor looking at
   * a shortage needs to see what was spent without leaving the page.
   */
  private async loadExpenses(shiftId: string): Promise<void> {
    this.expensesLoading.set(true);
    try {
      const result = await firstValueFrom(
        this.expenses.list({ shiftId, pageSize: EXPENSE_PAGE_SIZE }),
      );
      this.shiftExpenses.set([...result.items]);
    } catch {
      // The liquidation still stands on its own if the breakdown fails.
      this.shiftExpenses.set([]);
    } finally {
      this.expensesLoading.set(false);
    }
  }

  private async loadCategoryNames(): Promise<void> {
    try {
      const categories = await firstValueFrom(
        this.categories.list({
          pageSize: CATEGORY_LOOKUP_SIZE,
          includeInactive: true,
        }),
      );
      this.categoryNames.set(
        new Map(categories.items.map((category) => [category.id, category.name])),
      );
    } catch {
      // Names fall back to a dash if the lookup fails.
    }
  }
}

/**
 * Codes that mean the close was refused outright, so nothing was recorded and
 * the next attempt starts clean. Deliberately an allow-list: an unrecognised
 * code keeps the key, because replaying a request that may have gone through
 * is safe while re-running one that did is not.
 */
const REJECTION_CODES: ReadonlySet<ApiErrorCode> = new Set<ApiErrorCode>([
  'SHIFT_RETURN_PENDING',
  'SHIFT_ALREADY_CLOSED',
  'SHIFT_NOT_FOUND',
  'VALIDATION_FAILED',
  'FORBIDDEN',
]);

function isRejection(code: ApiErrorCode): boolean {
  return REJECTION_CODES.has(code);
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
