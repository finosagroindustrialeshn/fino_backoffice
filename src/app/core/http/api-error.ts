import type { ApiErrorCode } from './api-error-codes';

/**
 * Normalized error shape surfaced by the error interceptor. Every failed
 * request rejects with this, so consumers never deal with raw
 * HttpErrorResponse objects.
 */
export interface ApiError {
  /** HTTP status code (0 when the request never reached the server). */
  readonly status: number;
  /**
   * Stable identifier for what went wrong. Branch on this, never on
   * `message`. Absent when the failure never reached the API (status 0) or
   * came from something that does not speak our error envelope.
   */
  readonly code?: ApiErrorCode;
  /** User-facing message, already localized. Safe to render as-is. */
  readonly message: string;
  /** Raw error body, kept for logging or field-level validation errors. */
  readonly details?: unknown;
}

/**
 * Narrows a caught value to an ApiError, for the callers that need to branch
 * on `code` rather than just render `message`.
 */
export function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'status' in value &&
    'message' in value &&
    typeof (value as { message: unknown }).message === 'string'
  );
}
