import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom, type Observable } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';

import { AuthSession } from '../../../../core/auth/auth-session';
import { UserDataClient } from '../../../users/services/user-data';
import {
  canAssignOrder,
  canCancelOrder,
  canEditOrder,
  canPlaceOrder,
  canUnassignOrder,
  isCancelReasonRequired,
  SALES_ORDER_STATUS_LABELS,
  SALES_ORDER_STATUS_SEVERITY,
  type SalesOrder,
  type SalesOrderStatus,
  type SalesOrderTagSeverity,
} from '../../models/sales-order.model';
import { SalesOrderDataClient } from '../../services/sales-order-data';

/** Bounded lookup: active sellers for the assign dialog. */
const LOOKUP_SIZE = 100;

@Component({
  selector: 'app-sales-order-detail',
  imports: [
    CurrencyPipe,
    DatePipe,
    FormsModule,
    RouterLink,
    ButtonModule,
    DialogModule,
    SelectModule,
    TagModule,
    TextareaModule,
  ],
  templateUrl: './sales-order-detail.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SalesOrderDetail implements OnInit {
  private readonly orders = inject(SalesOrderDataClient);
  private readonly users = inject(UserDataClient);
  private readonly auth = inject(AuthSession);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  protected readonly order = signal<SalesOrder | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);

  /** Set while an action (place/assign/unassign/cancel) is in flight. */
  protected readonly acting = signal(false);
  protected readonly actionError = signal<string | null>(null);

  protected readonly assignDialogOpen = signal(false);
  protected readonly unassignDialogOpen = signal(false);
  protected readonly cancelDialogOpen = signal(false);
  protected readonly sellerToAssign = signal<string | null>(null);
  protected readonly unassignReason = signal('');
  protected readonly cancelReason = signal('');

  protected readonly sellerOptions = signal<{ label: string; value: string }[]>(
    [],
  );

  protected readonly canEdit = computed(() => {
    const order = this.order();
    if (!order) {
      return false;
    }
    return canEditOrder(order, this.auth.role(), this.auth.user()?.id ?? null);
  });

  protected readonly canPlace = computed(() => {
    const order = this.order();
    return order ? canPlaceOrder(order) : false;
  });

  protected readonly canAssign = computed(() => {
    const order = this.order();
    return order ? canAssignOrder(order) : false;
  });

  protected readonly canUnassign = computed(() => {
    const order = this.order();
    return order ? canUnassignOrder(order) : false;
  });

  protected readonly canCancel = computed(() => {
    const order = this.order();
    return order ? canCancelOrder(order) : false;
  });

  protected readonly needsCancelReason = computed(() => {
    const order = this.order();
    return order ? isCancelReasonRequired(order.status) : false;
  });

  /** An order already held by somebody is being MOVED, not handed out. */
  protected readonly isReassign = computed(
    () => this.order()?.assignedToId !== null,
  );

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      this.loadError.set('No se encontró el pedido.');
      this.loading.set(false);
      return;
    }
    void this.load(id);
  }

  protected async place(): Promise<void> {
    await this.runAction((id) => this.orders.place(id));
  }

  protected async confirmAssign(): Promise<void> {
    const sellerId = this.sellerToAssign();
    if (!sellerId) {
      return;
    }
    const done = await this.runAction((id) => this.orders.assign(id, sellerId));
    if (done) {
      this.assignDialogOpen.set(false);
      this.sellerToAssign.set(null);
    }
  }

  protected async confirmUnassign(): Promise<void> {
    const reason = this.unassignReason().trim();
    // Always required: the next assignee has to know whether the obstacle was
    // the seller, the route or the client.
    if (!reason) {
      return;
    }
    const done = await this.runAction((id) => this.orders.unassign(id, reason));
    if (done) {
      this.unassignDialogOpen.set(false);
      this.unassignReason.set('');
    }
  }

  protected async confirmCancel(): Promise<void> {
    const reason = this.cancelReason().trim();
    if (this.needsCancelReason() && !reason) {
      return;
    }
    const done = await this.runAction((id) =>
      this.orders.cancel(id, reason || undefined),
    );
    if (done) {
      this.cancelDialogOpen.set(false);
      this.cancelReason.set('');
    }
  }

  protected openAssignDialog(): void {
    this.actionError.set(null);
    // Pre-selects nobody on a reassignment: the seller who already holds it
    // is a no-op, and offering them as the default invites a pointless call.
    this.sellerToAssign.set(null);
    this.assignDialogOpen.set(true);
  }

  protected openUnassignDialog(): void {
    this.actionError.set(null);
    this.unassignDialogOpen.set(true);
  }

  protected openCancelDialog(): void {
    this.actionError.set(null);
    this.cancelDialogOpen.set(true);
  }

  protected editOrder(): void {
    const order = this.order();
    if (order) {
      void this.router.navigate(['/pedidos', order.id, 'editar']);
    }
  }

  protected statusLabel(status: SalesOrderStatus): string {
    return SALES_ORDER_STATUS_LABELS[status];
  }

  protected statusSeverity(status: SalesOrderStatus): SalesOrderTagSeverity {
    return SALES_ORDER_STATUS_SEVERITY[status];
  }

  private async load(id: string): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      // Fully resolved by the API: client, people and per-line product data
      // all arrive joined, so there is nothing left to look up here.
      const order = await firstValueFrom(this.orders.get(id));
      this.order.set(order);
      void this.loadSellers();
    } catch (error) {
      this.loadError.set(toMessage(error, 'No se pudo cargar el pedido.'));
    } finally {
      this.loading.set(false);
    }
  }

  /** Only the assign dialog needs a lookup; the order itself carries names. */
  private async loadSellers(): Promise<void> {
    try {
      const users = await firstValueFrom(
        this.users.list({ role: 'SELLER', pageSize: LOOKUP_SIZE }),
      );
      this.sellerOptions.set(
        users.items
          .filter((user) => user.isActive)
          .map((user) => ({ label: user.fullName, value: user.id })),
      );
    } catch {
      // The dialog shows its empty message; the rest of the screen still works.
    }
  }

  /**
   * Runs one transition and replaces the order with what the API returns —
   * never with a state guessed here. Returns whether it succeeded so callers
   * can close their dialog only on success.
   */
  private async runAction(
    action: (id: string) => Observable<SalesOrder>,
  ): Promise<boolean> {
    const order = this.order();
    if (!order) {
      return false;
    }
    this.acting.set(true);
    this.actionError.set(null);
    try {
      const updated = await firstValueFrom(action(order.id));
      this.order.set(updated);
      return true;
    } catch (error) {
      this.actionError.set(
        toMessage(error, 'No se pudo completar la acción sobre el pedido.'),
      );
      return false;
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
