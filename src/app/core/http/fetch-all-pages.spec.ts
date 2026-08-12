import { describe, expect, it, vi } from 'vitest';
import { of } from 'rxjs';

import { fetchAllPages } from './fetch-all-pages';
import type { Paginated } from './pagination.model';

function page<T>(
  items: readonly T[],
  hasNextPage: boolean,
  total = items.length,
): Paginated<T> {
  return {
    items,
    meta: {
      page: 1,
      pageSize: items.length,
      total,
      totalPages: 1,
      hasNextPage,
      hasPreviousPage: false,
    },
  };
}

/** Pages of `size` filler rows, `count` of them, all but the last claiming more. */
function pagesOf(size: number, count: number, total: number) {
  const fetchPage = vi.fn();
  for (let index = 0; index < count; index += 1) {
    const items = Array.from({ length: size }, (_, i) => `row-${index * size + i}`);
    fetchPage.mockReturnValueOnce(of(page(items, index < count - 1, total)));
  }
  return fetchPage;
}

describe('fetchAllPages', () => {
  it('returns everything from a single page when there is no next page', async () => {
    const fetchPage = vi.fn().mockReturnValue(of(page(['a', 'b'], false)));

    const result = await fetchAllPages(fetchPage);

    expect(result.rows).toEqual(['a', 'b']);
    expect(result.truncated).toBe(false);
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(fetchPage).toHaveBeenCalledWith(1, 100);
  });

  it('walks pages until hasNextPage is false, concatenating items in order', async () => {
    const fetchPage = vi
      .fn()
      .mockReturnValueOnce(of(page(['a', 'b'], true)))
      .mockReturnValueOnce(of(page(['c', 'd'], true)))
      .mockReturnValueOnce(of(page(['e'], false)));

    const result = await fetchAllPages(fetchPage);

    expect(result.rows).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(result.truncated).toBe(false);
    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(fetchPage).toHaveBeenNthCalledWith(1, 1, 100);
    expect(fetchPage).toHaveBeenNthCalledWith(2, 2, 100);
    expect(fetchPage).toHaveBeenNthCalledWith(3, 3, 100);
  });

  it('returns an empty result when the first page is already empty', async () => {
    const fetchPage = vi.fn().mockReturnValue(of(page([], false)));

    const result = await fetchAllPages(fetchPage);

    expect(result.rows).toEqual([]);
    expect(result.truncated).toBe(false);
  });

  it('uses a custom page size when given', async () => {
    const fetchPage = vi.fn().mockReturnValue(of(page(['a'], false)));

    await fetchAllPages(fetchPage, { pageSize: 25 });

    expect(fetchPage).toHaveBeenCalledWith(1, 25);
  });

  it('stops at maxRows and reports the result as truncated', async () => {
    const fetchPage = pagesOf(2, 5, 10);

    const result = await fetchAllPages(fetchPage, { pageSize: 2, maxRows: 4 });

    expect(result.rows).toHaveLength(4);
    expect(result.truncated).toBe(true);
    expect(result.total).toBe(10);
    // Stopped fetching once the ceiling was reached — that is the whole point.
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it('trims an overshooting page down to exactly maxRows', async () => {
    const fetchPage = pagesOf(10, 2, 20);

    const result = await fetchAllPages(fetchPage, { pageSize: 10, maxRows: 7 });

    expect(result.rows).toHaveLength(7);
    expect(result.truncated).toBe(true);
  });

  it('is not truncated when the data ends exactly at maxRows', async () => {
    const fetchPage = vi.fn().mockReturnValue(of(page(['a', 'b'], false, 2)));

    const result = await fetchAllPages(fetchPage, { maxRows: 2 });

    expect(result.rows).toEqual(['a', 'b']);
    expect(result.truncated).toBe(false);
  });

  it('gives up on an empty page that still claims a next one', async () => {
    // A misreporting API would otherwise spin here forever.
    const fetchPage = vi
      .fn()
      .mockReturnValueOnce(of(page(['a'], true, 99)))
      .mockReturnValueOnce(of(page([], true, 99)));

    const result = await fetchAllPages(fetchPage);

    expect(result.rows).toEqual(['a']);
    expect(result.truncated).toBe(true);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });
});
