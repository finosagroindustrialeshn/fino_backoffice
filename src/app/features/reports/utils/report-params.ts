/**
 * Parsers for the report filters carried in the URL.
 *
 * Query params are user input — they get typed, pasted and shared — so every
 * value is validated here before it can reach the API. Anything unparseable
 * degrades to "no filter" instead of being forwarded blindly.
 */

import type { DateRange } from './date-range';

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Parses `YYYY-MM-DD` into that day at local midnight. Returns null on any
 * malformed or non-existent date (`2026-02-30`).
 *
 * Note it does NOT go through `new Date(value)`: that parses a bare date as
 * UTC midnight, which is the previous day in Honduras (UTC-6).
 */
export function parseDay(value: string | null): Date | null {
  if (!value || !DAY_PATTERN.test(value)) {
    return null;
  }
  const [year, month, day] = value.split('-').map(Number) as [
    number,
    number,
    number,
  ];
  const parsed = new Date(year, month - 1, day);
  // Round-trip check: JS rolls 2026-02-30 over into March instead of failing.
  const isRealDate =
    parsed.getFullYear() === year &&
    parsed.getMonth() === month - 1 &&
    parsed.getDate() === day;
  return isRealDate ? parsed : null;
}

/** Both bounds or nothing — a half range is treated as no range at all. */
export function parseRange(
  from: string | null,
  to: string | null,
): DateRange | null {
  const parsedFrom = parseDay(from);
  const parsedTo = parseDay(to);
  if (!parsedFrom || !parsedTo) {
    return null;
  }
  return [parsedFrom, parsedTo];
}

/** Returns the value only when it is one of `allowed`, else null. */
export function parseOneOf<T extends string>(
  value: string | null,
  allowed: readonly T[],
): T | null {
  return value && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

/** Guards ids so a hand-edited URL cannot push junk into a query param. */
export function parseUuid(value: string | null): string | null {
  return value && UUID_PATTERN.test(value) ? value : null;
}

/** Only the literal `true` flips a flag on; everything else is false. */
export function parseBool(value: string | null): boolean {
  return value === 'true';
}
