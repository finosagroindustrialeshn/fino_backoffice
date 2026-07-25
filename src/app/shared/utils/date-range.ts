/**
 * Date-range helpers shared by the report screens.
 *
 * The API takes day-granularity bounds as plain `YYYY-MM-DD` strings and
 * resolves them against the Honduras civil day (UTC-6) server-side. So the
 * client must send the day the user actually picked on the calendar — never
 * an ISO timestamp, which would shift late-evening picks to the next day.
 */

/**
 * A range as produced by a PrimeNG range datepicker: either end may be null
 * while the user is mid-selection. Kept mutable because `[ngModel]` on
 * `p-datepicker` will not accept a readonly array.
 */
export type DateRange = (Date | null)[] | null;

/** Formats a Date as YYYY-MM-DD using its local calendar day (no UTC shift). */
export function formatDay(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Number of calendar days the range covers, both bounds inclusive. Compared
 * as UTC midnights so a DST shift can never add or drop a day.
 */
export function daysInRange(from: Date, to: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const elapsed = utcMidnight(to) - utcMidnight(from);
  return Math.round(elapsed / msPerDay) + 1;
}

/** The `days`-long range ending on `today`, inclusive of both bounds. */
export function lastNDays(days: number, today: Date): [Date, Date] {
  const to = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const from = new Date(to);
  from.setDate(from.getDate() - (days - 1));
  return [from, to];
}

/** The range from the 1st of `today`'s month through `today`, inclusive of both bounds. */
export function monthToDate(today: Date): [Date, Date] {
  const to = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const from = new Date(today.getFullYear(), today.getMonth(), 1);
  return [from, to];
}

export function utcMidnight(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}
