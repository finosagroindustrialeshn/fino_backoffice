import { computed, inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import type { UserProfile } from '../../../core/auth/user-profile.model';
import type { ReturnReason } from '../../catalogs/return-reasons/models/return-reason.model';
import { ReturnReasonDataClient } from '../../catalogs/return-reasons/services/return-reason-data';
import { ProductDataClient } from '../../products/services/product-data';
import { UserDataClient } from '../../users/services/user-data';

/** Sellers, products and reasons are bounded lookups joined to the returns. */
const LOOKUP_SIZE = 100;

/**
 * The name tables a return has to be read through: it stores ids, and every
 * screen shows names.
 *
 * Loading is idempotent and cached for the session — the three catalogs are
 * bounded and change far less often than a user opens the returns screen.
 * Names fall back to the raw id so a failed lookup degrades the labels
 * instead of the page.
 */
@Injectable({ providedIn: 'root' })
export class ReturnLookups {
  private readonly users = inject(UserDataClient);
  private readonly products = inject(ProductDataClient);
  private readonly reasons = inject(ReturnReasonDataClient);

  /**
   * Every user, not only sellers: a return also names who declared it and who
   * verified it, and those are back-office people.
   */
  private readonly allUsers = signal<readonly UserProfile[]>([]);
  private readonly productNames = signal<ReadonlyMap<string, string>>(new Map());
  private readonly reasonNames = signal<ReadonlyMap<string, string>>(new Map());

  /** Only active reasons are offered for NEW merma; history keeps its own. */
  readonly reasonOptions = signal<ReturnReason[]>([]);

  private readonly userNames = computed(
    () => new Map(this.allUsers().map((user) => [user.id, user.fullName])),
  );

  readonly sellerFilterOptions = computed(() => [
    { label: 'Todos los vendedores', value: null as string | null },
    ...this.allUsers()
      .filter((user) => user.role === 'SELLER')
      .map((user) => ({ label: user.fullName, value: user.id as string | null })),
  ]);

  private loaded: Promise<void> | null = null;

  /** Safe to call on every screen entry; the fetch happens at most once. */
  load(): Promise<void> {
    this.loaded ??= this.fetch();
    return this.loaded;
  }

  userName(userId: string | null): string {
    if (!userId) {
      return '—';
    }
    return this.userNames().get(userId) ?? userId;
  }

  productName(productId: string): string {
    return this.productNames().get(productId) ?? productId;
  }

  reasonName(reasonId: string | null): string {
    if (!reasonId) {
      return '—';
    }
    return this.reasonNames().get(reasonId) ?? reasonId;
  }

  private async fetch(): Promise<void> {
    try {
      const [users, products, reasons] = await Promise.all([
        firstValueFrom(this.users.list({ pageSize: LOOKUP_SIZE })),
        firstValueFrom(this.products.list({ pageSize: LOOKUP_SIZE })),
        firstValueFrom(
          this.reasons.list({ pageSize: LOOKUP_SIZE, includeInactive: true }),
        ),
      ]);
      this.allUsers.set(users.items);
      this.productNames.set(
        new Map(products.items.map((product) => [product.id, product.name])),
      );
      this.reasonNames.set(
        new Map(reasons.items.map((reason) => [reason.id, reason.name])),
      );
      this.reasonOptions.set(reasons.items.filter((reason) => reason.isActive));
    } catch {
      // Names fall back to raw ids if the lookups fail. Cleared so a later
      // visit can retry instead of being stuck with empty tables.
      this.loaded = null;
    }
  }
}
