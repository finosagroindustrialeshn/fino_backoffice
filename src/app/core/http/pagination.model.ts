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

/** Query params shared by paginated list endpoints. */
export interface PaginationQuery {
  readonly page?: number;
  readonly pageSize?: number;
}
