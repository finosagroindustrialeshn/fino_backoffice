/**
 * Coerces a form value into a usable number.
 *
 * A cleared `<input type="number">` hands back null, and the API serializes
 * decimals loosely (a `numeric` column can arrive as `"990.00"`). Money maths
 * must never see null, NaN or a string, so everything funnels through here:
 * an empty box reads as zero instead of poisoning a total.
 */
export function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}
