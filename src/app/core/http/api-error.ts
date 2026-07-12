/**
 * Normalized error shape surfaced by the error interceptor. Every failed
 * request rejects with this, so consumers never deal with raw
 * HttpErrorResponse objects.
 */
export interface ApiError {
  /** HTTP status code (0 when the request never reached the server). */
  readonly status: number;
  /** User-friendly message, already extracted from the backend payload. */
  readonly message: string;
  /** Raw error body, kept for logging or field-level validation errors. */
  readonly details?: unknown;
}
