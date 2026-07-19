import { computed, signal, type Signal } from '@angular/core';
import { firstValueFrom, type Observable } from 'rxjs';
import type { TableLazyLoadEvent } from 'primeng/table';

import type { Paginated, PaginationMeta } from './pagination.model';

/** Fetches one page of a server-paginated collection. */
export type LazyListFetcher<T> = (
  page: number,
  pageSize: number,
) => Observable<Paginated<T>>;

export const DEFAULT_LAZY_ROWS = 10;

/**
 * Reusable server-side lazy pagination state for a PrimeNG table. Owns the
 * items/meta/loading/error signals and the page bookkeeping so list
 * components stay thin: wire `(onLazyLoad)` to `onLazyLoad`, bind
 * `[value]`/`[totalRecords]`/`[loading]`, and call `reload()` after a CRUD
 * mutation to refresh the current page.
 *
 * Filters (role, includeInactive, …) live in the component and are read
 * inside the fetcher closure, so `reload()` always uses the latest filters.
 */
export class LazyList<T> {
  private readonly _items = signal<T[]>([]);
  private readonly _meta = signal<PaginationMeta | null>(null);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly items: Signal<T[]> = this._items.asReadonly();
  readonly meta: Signal<PaginationMeta | null> = this._meta.asReadonly();
  readonly loading: Signal<boolean> = this._loading.asReadonly();
  readonly error: Signal<string | null> = this._error.asReadonly();
  readonly total = computed(() => this._meta()?.total ?? 0);

  private lastPage = 1;
  private lastPageSize = DEFAULT_LAZY_ROWS;

  constructor(
    private readonly fetcher: LazyListFetcher<T>,
    private readonly errorFallback = 'No se pudieron cargar los datos.',
  ) {}

  /** Fired by the lazy table on init, page change, and rows-per-page change. */
  onLazyLoad(event: TableLazyLoadEvent): void {
    const rows = event.rows ?? DEFAULT_LAZY_ROWS;
    const first = event.first ?? 0;
    const page = Math.floor(first / rows) + 1;
    void this.load(page, rows);
  }

  /** Refetch the current page — call after a create/update/delete. */
  reload(): void {
    void this.load(this.lastPage, this.lastPageSize);
  }

  private async load(page: number, pageSize: number): Promise<void> {
    this.lastPage = page;
    this.lastPageSize = pageSize;
    this._loading.set(true);
    this._error.set(null);
    try {
      const result = await firstValueFrom(this.fetcher(page, pageSize));
      this._items.set([...result.items]);
      this._meta.set(result.meta);
    } catch (error) {
      this._error.set(toMessage(error, this.errorFallback));
      this._items.set([]);
      this._meta.set(null);
    } finally {
      this._loading.set(false);
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
