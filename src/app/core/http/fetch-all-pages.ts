import { firstValueFrom, type Observable } from 'rxjs';

import type { Paginated } from './pagination.model';

/** Longest page the API accepts, used to minimize round-trips. */
const MAX_PAGE_SIZE = 100;

/**
 * Ceiling on how many rows one export will walk.
 *
 * At the default page size that is 50 sequential round-trips, which is
 * already a slow export. Without a ceiling, an unfiltered list of 50k rows
 * would fire 500 requests, freeze the tab and hammer the API — and the user
 * would have no idea why. Anything past this is a report the API should be
 * aggregating server-side, not something the browser should be assembling.
 */
const DEFAULT_MAX_ROWS = 5000;

export interface FetchAllPagesOptions {
  readonly pageSize?: number;
  readonly maxRows?: number;
}

export interface FetchAllPagesResult<T> {
  readonly rows: readonly T[];
  /**
   * True when the walk stopped early and rows are missing. Callers MUST
   * surface this: an export that looks complete but silently isn't is worse
   * than one that refuses to run, because the numbers get used as if they
   * were the whole picture.
   */
  readonly truncated: boolean;
  /** Total the API reports for the query, whether or not it was all fetched. */
  readonly total: number;
}

/**
 * Walks the pages of a paginated endpoint and concatenates the items, for
 * callers (exports, mostly) that need the full result set rather than the
 * one page a `LazyList`-backed table shows on screen.
 *
 * Stops at `maxRows` and reports it via `truncated` rather than running
 * unbounded.
 */
export async function fetchAllPages<T>(
  fetchPage: (page: number, pageSize: number) => Observable<Paginated<T>>,
  options: FetchAllPagesOptions = {},
): Promise<FetchAllPagesResult<T>> {
  const pageSize = options.pageSize ?? MAX_PAGE_SIZE;
  const maxRows = options.maxRows ?? DEFAULT_MAX_ROWS;

  const rows: T[] = [];
  let page = 1;
  let total = 0;

  for (;;) {
    const result = await firstValueFrom(fetchPage(page, pageSize));
    total = result.meta.total;
    rows.push(...result.items);

    if (rows.length >= maxRows) {
      return {
        rows: rows.slice(0, maxRows),
        truncated: rows.length > maxRows || result.meta.hasNextPage,
        total,
      };
    }

    if (!result.meta.hasNextPage) {
      return { rows, truncated: false, total };
    }

    // An empty page that still claims a next one would loop forever. Trust
    // the items over the flag: there is nothing left to collect either way.
    if (result.items.length === 0) {
      return { rows, truncated: rows.length < total, total };
    }

    page += 1;
  }
}
