import {
  ChangeDetectionStrategy,
  Component,
  inject,
  OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom, type Observable } from 'rxjs';

import type { Paginated } from '../../../../core/http/pagination.model';
import { ConfirmationService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { Table, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

import { AuthSession } from '../../../../core/auth/auth-session';
import { LazyList } from '../../../../core/http/lazy-list';
import { UserDataClient } from '../../../users/services/user-data';
import type { Client } from '../../models/client.model';
import {
  ClientDataClient,
  type ClientSortBy,
} from '../../services/client-data';

/** Sellers are a bounded lookup for the "registered by" filter. */
const LOOKUP_SIZE = 100;
/** Delay before a keystroke turns into a search request. */
const SEARCH_DEBOUNCE_MS = 350;

interface SelectOption<T> {
  readonly label: string;
  readonly value: T;
}

@Component({
  selector: 'app-client-list',
  imports: [
    FormsModule,
    RouterLink,
    ButtonModule,
    ConfirmDialogModule,
    InputTextModule,
    SelectModule,
    TableModule,
    TagModule,
  ],
  templateUrl: './client-list.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ConfirmationService],
})
export class ClientList implements OnInit {
  private readonly clients = inject(ClientDataClient);
  private readonly users = inject(UserDataClient);
  private readonly auth = inject(AuthSession);
  private readonly confirmation = inject(ConfirmationService);
  private readonly table = viewChild.required<Table>('dt');

  protected readonly canDelete = this.auth.role;

  // Filters — read inside the fetcher closure so reload() uses the latest values.
  /** Bound to the search box for instant feedback; debounced into `appliedSearch`. */
  protected readonly searchTerm = signal('');
  private readonly appliedSearch = signal('');
  protected readonly sellerFilter = signal<string | null>(null);
  protected readonly activeFilter = signal<boolean | null>(null);
  private searchDebounce: ReturnType<typeof setTimeout> | null = null;

  protected readonly sellerFilterOptions = signal<SelectOption<string | null>[]>(
    [{ label: 'Todos los vendedores', value: null }],
  );
  protected readonly activeFilterOptions: SelectOption<boolean | null>[] = [
    { label: 'Todos los estados', value: null },
    { label: 'Activos', value: true },
    { label: 'Inactivos', value: false },
  ];

  protected readonly list = new LazyList<Client>(
    (page, pageSize): Observable<Paginated<Client>> =>
      this.clients.list({
        page,
        pageSize,
        search: this.appliedSearch() || undefined,
        createdById: this.sellerFilter() ?? undefined,
        isActive: this.activeFilter() ?? undefined,
        sortBy: (this.list.sortField() as ClientSortBy | null) ?? undefined,
        sortOrder: this.list.sortOrder() ?? undefined,
      }),
    'No se pudieron cargar los clientes.',
  );

  private readonly pendingIds = signal<ReadonlySet<string>>(new Set());
  private readonly rowErrors = signal<Readonly<Record<string, string>>>({});

  ngOnInit(): void {
    void this.loadSellers();
  }

  protected onSearchInput(value: string): void {
    this.searchTerm.set(value);
    if (this.searchDebounce) {
      clearTimeout(this.searchDebounce);
    }
    this.searchDebounce = setTimeout(() => {
      this.appliedSearch.set(value.trim());
      this.table().reset();
    }, SEARCH_DEBOUNCE_MS);
  }

  protected onSellerFilterChange(sellerId: string | null): void {
    this.sellerFilter.set(sellerId);
    this.table().reset();
  }

  protected onActiveFilterChange(isActive: boolean | null): void {
    this.activeFilter.set(isActive);
    this.table().reset();
  }

  private async loadSellers(): Promise<void> {
    try {
      const result = await firstValueFrom(
        this.users.list({ role: 'SELLER', pageSize: LOOKUP_SIZE }),
      );
      this.sellerFilterOptions.set([
        { label: 'Todos los vendedores', value: null },
        ...result.items.map((user) => ({
          label: user.fullName,
          value: user.id,
        })),
      ]);
    } catch {
      // Filter simply keeps only the "all sellers" option if the lookup fails.
    }
  }

  protected isPending(id: string): boolean {
    return this.pendingIds().has(id);
  }

  protected rowError(id: string): string | undefined {
    return this.rowErrors()[id];
  }

  protected async toggleActive(client: Client): Promise<void> {
    this.startPending(client.id);
    this.clearRowError(client.id);
    try {
      await firstValueFrom(
        this.clients.setActive(client.id, !client.isActive),
      );
      this.list.reload();
    } catch (error) {
      this.setRowError(
        client.id,
        this.toMessage(error, 'No se pudo actualizar el estado.'),
      );
    } finally {
      this.stopPending(client.id);
    }
  }

  protected confirmDelete(client: Client): void {
    this.confirmation.confirm({
      header: 'Eliminar cliente',
      message: `¿Eliminar este cliente? "${client.name}" se borrará de forma permanente.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        void this.remove(client);
      },
    });
  }

  private async remove(client: Client): Promise<void> {
    this.startPending(client.id);
    this.clearRowError(client.id);
    try {
      await firstValueFrom(this.clients.remove(client.id));
      this.list.reload();
    } catch (error) {
      this.setRowError(
        client.id,
        this.toMessage(error, 'No se pudo eliminar el cliente.'),
      );
    } finally {
      this.stopPending(client.id);
    }
  }

  private startPending(id: string): void {
    this.pendingIds.update((ids) => new Set(ids).add(id));
  }

  private stopPending(id: string): void {
    this.pendingIds.update((ids) => {
      const next = new Set(ids);
      next.delete(id);
      return next;
    });
  }

  private setRowError(id: string, message: string): void {
    this.rowErrors.update((errors) => ({ ...errors, [id]: message }));
  }

  private clearRowError(id: string): void {
    this.rowErrors.update((errors) => {
      const { [id]: _removed, ...rest } = errors;
      return rest;
    });
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
