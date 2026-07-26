import { describe, expect, it, vi } from 'vitest';
import { of } from 'rxjs';

import { fetchAllPages } from './fetch-all-pages';
import type { Paginated } from './pagination.model';

function page<T>(items: readonly T[], hasNextPage: boolean): Paginated<T> {
  return {
    items,
    meta: {
      page: 1,
      pageSize: items.length,
      total: items.length,
      totalPages: 1,
      hasNextPage,
      hasPreviousPage: false,
    },
  };
}

describe('fetchAllPages', () => {
  it('returns everything from a single page when there is no next page', async () => {
    const fetchPage = vi.fn().mockReturnValue(of(page(['a', 'b'], false)));

    const result = await fetchAllPages(fetchPage);

    expect(result).toEqual(['a', 'b']);
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

    expect(result).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(fetchPage).toHaveBeenNthCalledWith(1, 1, 100);
    expect(fetchPage).toHaveBeenNthCalledWith(2, 2, 100);
    expect(fetchPage).toHaveBeenNthCalledWith(3, 3, 100);
  });

  it('returns an empty array when the first page is already empty', async () => {
    const fetchPage = vi.fn().mockReturnValue(of(page([], false)));

    const result = await fetchAllPages(fetchPage);

    expect(result).toEqual([]);
  });

  it('uses a custom page size when given', async () => {
    const fetchPage = vi.fn().mockReturnValue(of(page(['a'], false)));

    await fetchAllPages(fetchPage, 25);

    expect(fetchPage).toHaveBeenCalledWith(1, 25);
  });
});
