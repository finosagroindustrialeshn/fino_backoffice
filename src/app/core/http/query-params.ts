import type { QueryParams } from './api-client';

/**
 * Builds a query-param object from a partial filter, dropping anything the
 * caller left unset. Empty strings are dropped too — a cleared search box or
 * an unselected dropdown must not narrow the query to `field=`.
 *
 * `false` and `0` ARE kept: they are real filter values (e.g. `isActive=false`).
 */
export function toQueryParams(
  filters: Record<string, string | number | boolean | undefined | null>,
): QueryParams {
  const params: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }
    params[key] = value;
  }
  return params;
}
