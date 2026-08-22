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

/**
 * One field's validation failures, as the API reports them under
 * `fields` when `code` is VALIDATION_FAILED.
 *
 * `field` is a path, not a flat name — a bad line inside an order arrives as
 * `items.0.unitPriceRef`. Messages are the API's own English prose, which is
 * developer-facing by design, so surface them as a diagnostic detail rather
 * than as the primary copy a user reads.
 */
export interface ApiFieldError {
  readonly field: string;
  readonly messages: readonly string[];
}

/**
 * Pulls the per-field breakdown out of a caught error.
 *
 * Without this, a 400 renders as "Revisá los datos ingresados" and throws
 * away the one thing that says WHICH datum — the API already answered the
 * question, and the interceptor already kept the body in `details`.
 *
 * Takes `unknown` and never throws: a diagnostic helper that can itself fail
 * is worse than no diagnostic, and a gateway can answer with HTML.
 */
export function validationFields(error: unknown): readonly ApiFieldError[] {
  if (!isApiError(error)) {
    return [];
  }
  const details: unknown = error.details;
  if (!details || typeof details !== 'object' || !('fields' in details)) {
    return [];
  }
  const fields: unknown = (details as { fields: unknown }).fields;
  if (!Array.isArray(fields)) {
    return [];
  }
  return fields.filter(isApiFieldError);
}

function isApiFieldError(value: unknown): value is ApiFieldError {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as { field?: unknown; messages?: unknown };
  return (
    typeof candidate.field === 'string' &&
    Array.isArray(candidate.messages) &&
    candidate.messages.every((message) => typeof message === 'string')
  );
}
