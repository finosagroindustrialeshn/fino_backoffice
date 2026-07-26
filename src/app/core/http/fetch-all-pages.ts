import { firstValueFrom, type Observable } from 'rxjs';

import type { Paginated } from './pagination.model';

/** Longest page the API accepts, used to minimize round-trips. */
const MAX_PAGE_SIZE = 100;

/**
 * Walks every page of a paginated endpoint and concatenates the items, for
 * callers (exports, mostly) that need the full result set rather than the
 * one page a `LazyList`-backed table shows on screen.
 */
export async function fetchAllPages<T>(
  fetchPage: (page: number, pageSize: number) => Observable<Paginated<T>>,
  pageSize: number = MAX_PAGE_SIZE,
): Promise<readonly T[]> {
  const rows: T[] = [];
  let page = 1;
  for (;;) {
    const result = await firstValueFrom(fetchPage(page, pageSize));
    rows.push(...result.items);
    if (!result.meta.hasNextPage) {
      return rows;
    }
    page += 1;
  }
}
