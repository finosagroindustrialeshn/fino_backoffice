import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { Table, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

import { LazyList } from '../../../../core/http/lazy-list';
import type { PaymentRow } from '../../../sales/models/payment.model';
import {
  PAYMENT_METHOD_LABELS,
  paymentMethodLabel,
  type PaymentMethod,
} from '../../../sales/models/sale.model';
import { PaymentDataClient } from '../../../sales/services/payment-data';
import type { CashSessionRow } from '../../models/cash-report.model';

interface MethodOption {
  readonly label: string;
  readonly value: PaymentMethod | null;
}

/**
 * The collections behind one arqueo line — the rows that add up to its
 * `totalCollected`.
 *
 * This is what makes a `difference: -300` explainable: the line says money is
 * missing, and until the individual cobros can be read one by one there is no
 * way to tell an uncounted transfer from cash that never made it back.
 *
 * Presentational apart from its own paging: the parent hands it the line and
 * this owns the filter and the fetch.
 */
@Component({
  selector: 'app-cash-collections',
  imports: [
    CurrencyPipe,
    DatePipe,
    FormsModule,
    RouterLink,
    ButtonModule,
    SelectModule,
    TableModule,
    TagModule,
  ],
  templateUrl: './cash-collections.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CashCollections {
  private readonly payments = inject(PaymentDataClient);
  private readonly table = viewChild<Table>('dt');

  /** The arqueo line being explained. */
  readonly line = input.required<CashSessionRow>();

  protected readonly rowsPerPageOptions = [5, 10, 20];
  protected readonly paymentMethodLabel = paymentMethodLabel;

  protected readonly methodOptions: MethodOption[] = [
    { label: 'Todos los métodos', value: null },
    ...(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((value) => ({
      label: PAYMENT_METHOD_LABELS[value],
      value,
    })),
  ];

  protected readonly methodFilter = signal<PaymentMethod | null>(null);

  protected readonly list = new LazyList<PaymentRow>(
    (page, pageSize) =>
      this.payments.list({
        page,
        pageSize,
        ...this.anchor(),
        method: this.methodFilter() ?? undefined,
      }),
    'No se pudieron cargar los cobros.',
  );

  /**
   * What the rows should add up to. `CASH` alone reproduces `cashCollected`,
   * which is the figure the drawer is actually counted against.
   */
  protected readonly expectedTotal = computed(() => {
    const line = this.line();
    switch (this.methodFilter()) {
      case 'CASH':
        return line.cashCollected;
      case null:
        return line.totalCollected;
      default:
        return null;
    }
  });

  /**
   * Sum of the rows ON SCREEN, not of the whole filtered set — the endpoint
   * paginates and reports no aggregate. Labelled as such in the template so it
   * is never read as the line's total.
   */
  protected readonly pageTotal = computed(() =>
    this.list.items().reduce((sum, payment) => sum + Number(payment.amount), 0),
  );

  /** True once every matching row fits on the page being shown. */
  protected readonly isWholeSet = computed(() => {
    const meta = this.list.meta();
    return meta !== null && meta.totalPages <= 1;
  });

  constructor() {
    // The table fetches on its own init, so the first run is skipped —
    // resetting there would fire a second request for the same page.
    //
    // After that, `line` only changes identity when the parent reuses this
    // component for a different row (a collapsed panel is destroyed), and
    // that reuse has to clear the filter and go back to page 1.
    let isFirstRun = true;
    effect(() => {
      this.line();
      if (isFirstRun) {
        isFirstRun = false;
        return;
      }
      this.methodFilter.set(null);
      this.table()?.reset();
    });
  }

  protected onMethodFilterChange(method: PaymentMethod | null): void {
    this.methodFilter.set(method);
    // reset() jumps to page 1 and re-fires onLazyLoad with the new filter.
    this.table()?.reset();
  }

  /**
   * True when the money was collected against a sale made on an EARLIER day.
   *
   * Worth flagging: these are precisely the rows that make summing
   * `amountPaid` over `GET /sales?shiftId=X` fail to reconcile, and an
   * accountant chasing a difference has to be able to see them.
   */
  protected isAbono(payment: PaymentRow): boolean {
    return payment.saleCreatedAt.slice(0, 10) < payment.createdAt.slice(0, 10);
  }

  protected methodSeverity(method: PaymentMethod): 'success' | 'info' {
    // Cash is the only method that reaches the drawer, so it reads apart.
    return method === 'CASH' ? 'success' : 'info';
  }

  /** A line is anchored to a shift or to a store cash session, never both. */
  private anchor(): { shiftId?: string; cashSessionId?: string } {
    const line = this.line();
    return line.kind === 'shift'
      ? { shiftId: line.id }
      : { cashSessionId: line.id };
  }
}
