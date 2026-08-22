/**
 * Pagination envelope returned by list endpoints. The API wraps paginated
 * collections as `{ items, meta }` inside the standard ApiEnvelope's `data`,
 * so feature services receive `Paginated<T>` directly from ApiClient.
 */
export interface PaginationMeta {
  /** 1-based page number. */
  readonly page: number;
  /** Items per page. */
  readonly pageSize: number;
  /** Total items across all pages. */
  readonly total: number;
  /** Total number of pages. */
  readonly totalPages: number;
  readonly hasNextPage: boolean;
  readonly hasPreviousPage: boolean;
}

export interface Paginated<T> {
  readonly items: readonly T[];
  readonly meta: PaginationMeta;
}

/**
 * Largest `pageSize` the API accepts. Asking for more is not clamped — it is
 * refused with 400 VALIDATION_FAILED ("pageSize must not be greater than
 * 100"), which for a lookup inside a `catch {}` means names silently render
 * as dashes and nobody finds out.
 *
 * Every bounded lookup should use this constant instead of its own number,
 * so the ceiling lives in one place and moves with the API.
 */
export const MAX_PAGE_SIZE = 100;

/** Query params shared by paginated list endpoints. */
export interface PaginationQuery {
  readonly page?: number;
  readonly pageSize?: number;
}

/** Sort direction accepted by list endpoints that support sorting. */
export type SortOrder = 'asc' | 'desc';
