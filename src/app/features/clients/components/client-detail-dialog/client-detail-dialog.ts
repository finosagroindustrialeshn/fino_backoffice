import { CurrencyPipe, DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  model,
  signal,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { SkeletonModule } from 'primeng/skeleton';
import { TagModule } from 'primeng/tag';

import {
  LAST_PURCHASE_STATUS_LABELS,
  LAST_PURCHASE_STATUS_SEVERITY,
  type ClientDetail,
  type LastPurchaseStatus,
  type LastPurchaseStatusSeverity,
} from '../../models/client.model';
import { ClientDataClient } from '../../services/client-data';

/**
 * Read-only client detail. Fetches GET /clients/:id on open because the LIST
 * response carries only a last-purchase SUMMARY — the product lines shown here
 * exist solely on the detail endpoint.
 */
@Component({
  selector: 'app-client-detail-dialog',
  imports: [
    CurrencyPipe,
    DatePipe,
    ButtonModule,
    DialogModule,
    SkeletonModule,
    TagModule,
  ],
  templateUrl: './client-detail-dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClientDetailDialog {
  private readonly clients = inject(ClientDataClient);

  readonly visible = model(false);
  /** Which client to show. Null closes the dialog's content down to nothing. */
  readonly clientId = input<string | null>(null);
  /** Seller display names keyed by id, so the owner reads as a name, not a uuid. */
  readonly sellerNames = input<Record<string, string>>({});
  /** Preseller display names keyed by id — the client's second owner. */
  readonly presellerNames = input<Record<string, string>>({});

  protected readonly client = signal<ClientDetail | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  constructor() {
    effect(() => {
      const id = this.clientId();
      if (!this.visible() || !id) {
        return;
      }
      void this.load(id);
    });
  }

  private async load(id: string): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    this.client.set(null);
    try {
      this.client.set(await firstValueFrom(this.clients.get(id)));
    } catch (error) {
      this.error.set(this.toMessage(error, 'No se pudo cargar el cliente.'));
    } finally {
      this.loading.set(false);
    }
  }

  protected retry(): void {
    const id = this.clientId();
    if (id) {
      void this.load(id);
    }
  }

  protected sellerName(sellerId: string | null): string {
    if (!sellerId) {
      return 'Sin asignar';
    }
    return this.sellerNames()[sellerId] ?? 'Vendedor asignado';
  }

  protected presellerName(presellerId: string | null): string {
    if (!presellerId) {
      return 'Sin asignar';
    }
    return this.presellerNames()[presellerId] ?? 'Preventista asignado';
  }

  protected lastPurchaseLabel(status: LastPurchaseStatus): string {
    return LAST_PURCHASE_STATUS_LABELS[status];
  }

  protected lastPurchaseSeverity(
    status: LastPurchaseStatus,
  ): LastPurchaseStatusSeverity {
    return LAST_PURCHASE_STATUS_SEVERITY[status];
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
