import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';

import type { Client } from '../../../clients/models/client.model';
import { ClientDataClient } from '../../../clients/services/client-data';

/** Delay before a keystroke turns into a search request. */
const SEARCH_DEBOUNCE_MS = 350;
/** Enough matches to pick from without turning the dialog into a browser. */
const RESULT_SIZE = 20;

/**
 * The client to visit and where in the run to visit it. Order travels with the
 * selection because the API has no reorder endpoint — adding the stop is the
 * only moment its position can be chosen.
 */
export interface AddStopSelection {
  readonly clientId: string;
  readonly sortOrder: number;
}

/**
 * Picks a client to append to a route. Clients already on the route are kept
 * out of the results: the API rejects a duplicate, and an option that can only
 * fail is worse than no option at all.
 */
@Component({
  selector: 'app-add-stop-dialog',
  imports: [ButtonModule, DialogModule, InputTextModule],
  templateUrl: './add-stop-dialog.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AddStopDialog {
  private readonly clients = inject(ClientDataClient);

  readonly visible = model(false);
  /** Clients already on the route — never offered again. */
  readonly excludedClientIds = input<readonly string[]>([]);
  /** Position the new stop takes by default: the end of the run. */
  readonly nextSortOrder = input.required<number>();
  /** True while the parent is posting the stop. */
  readonly saving = input(false);

  readonly stopAdded = output<AddStopSelection>();

  /** Bound to the search box for instant feedback; debounced into `appliedSearch`. */
  protected readonly searchTerm = signal('');
  private readonly appliedSearch = signal('');
  private searchDebounce: ReturnType<typeof setTimeout> | null = null;
  /** Discards answers from a search the user has already typed past. */
  private searchToken = 0;

  private readonly results = signal<readonly Client[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly selectedClient = signal<Client | null>(null);
  protected readonly sortOrder = signal(1);
  /** The DOM `value` property is a string — bind text, keep the number here. */
  protected readonly sortOrderText = computed(() => String(this.sortOrder()));

  protected readonly candidates = computed<readonly Client[]>(() => {
    const excluded = new Set(this.excludedClientIds());
    return this.results().filter((client) => !excluded.has(client.id));
  });

  /** Shown so a short result list does not read as "the client does not exist". */
  protected readonly alreadyOnRouteCount = computed(
    () => this.results().length - this.candidates().length,
  );

  protected readonly canSubmit = computed(() => this.selectedClient() !== null && !this.saving());

  constructor() {
    effect(() => {
      if (!this.visible()) {
        return;
      }
      void this.search(this.appliedSearch());
    });

    // The default position follows the route: it is the end of the run at the
    // moment the dialog opens, not whatever it was the last time it was used.
    effect(() => {
      if (this.visible()) {
        this.sortOrder.set(this.nextSortOrder());
      }
    });
  }

  protected onSearchInput(value: string): void {
    this.searchTerm.set(value);
    if (this.searchDebounce) {
      clearTimeout(this.searchDebounce);
    }
    this.searchDebounce = setTimeout(() => {
      this.appliedSearch.set(value.trim());
    }, SEARCH_DEBOUNCE_MS);
  }

  protected onSortOrderInput(value: string): void {
    const parsed = Number.parseInt(value, 10);
    this.sortOrder.set(Number.isNaN(parsed) || parsed < 1 ? 1 : parsed);
  }

  protected select(client: Client): void {
    this.selectedClient.set(client);
  }

  protected submit(): void {
    const client = this.selectedClient();
    if (!client) {
      return;
    }
    this.stopAdded.emit({
      clientId: client.id,
      sortOrder: this.sortOrder(),
    });
  }

  protected reset(): void {
    if (this.searchDebounce) {
      clearTimeout(this.searchDebounce);
      this.searchDebounce = null;
    }
    this.searchTerm.set('');
    this.appliedSearch.set('');
    this.selectedClient.set(null);
    this.results.set([]);
    this.error.set(null);
  }

  protected retry(): void {
    void this.search(this.appliedSearch());
  }

  private async search(term: string): Promise<void> {
    const token = ++this.searchToken;
    this.loading.set(true);
    this.error.set(null);
    try {
      const page = await firstValueFrom(
        this.clients.list({
          search: term || undefined,
          pageSize: RESULT_SIZE,
          isActive: true,
        }),
      );
      if (token !== this.searchToken) {
        return;
      }
      this.results.set(page.items);
    } catch (error) {
      if (token !== this.searchToken) {
        return;
      }
      this.results.set([]);
      this.error.set(this.toMessage(error, 'No se pudieron cargar los clientes.'));
    } finally {
      if (token === this.searchToken) {
        this.loading.set(false);
      }
    }
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
