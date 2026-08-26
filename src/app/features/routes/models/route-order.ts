/** Which way a stop is being nudged in the visit order. */
export type MoveDirection = 'up' | 'down';

/**
 * Returns a new order with the item at `index` moved one place.
 *
 * Out-of-range indexes and moves off either end return the list unchanged
 * rather than throwing: the caller is a pair of buttons, and the worst
 * outcome of a stray click should be nothing happening.
 *
 * Never drops or duplicates an item — `PATCH /routes/:id/stops/order`
 * refuses any list that does not name every stop on the route exactly once.
 */
export function moveInOrder<T>(
  items: readonly T[],
  index: number,
  direction: MoveDirection,
): readonly T[] {
  const target = direction === 'up' ? index - 1 : index + 1;
  if (
    index < 0 ||
    index >= items.length ||
    target < 0 ||
    target >= items.length
  ) {
    return items;
  }
  const next = [...items];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}
