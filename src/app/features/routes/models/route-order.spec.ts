import { describe, expect, it } from 'vitest';

import { moveInOrder } from './route-order';

describe('moveInOrder', () => {
  const stops = ['a', 'b', 'c', 'd'];

  it('moves an item one place up', () => {
    expect(moveInOrder(stops, 2, 'up')).toEqual(['a', 'c', 'b', 'd']);
  });

  it('moves an item one place down', () => {
    expect(moveInOrder(stops, 1, 'down')).toEqual(['a', 'c', 'b', 'd']);
  });

  /** The buttons are disabled at the ends, but the guard belongs here too. */
  it('leaves the first item alone when moved up', () => {
    expect(moveInOrder(stops, 0, 'up')).toEqual(stops);
  });

  it('leaves the last item alone when moved down', () => {
    expect(moveInOrder(stops, 3, 'down')).toEqual(stops);
  });

  it('ignores an index outside the list', () => {
    expect(moveInOrder(stops, 9, 'up')).toEqual(stops);
    expect(moveInOrder(stops, -1, 'down')).toEqual(stops);
  });

  /**
   * The API refuses a list that does not name every stop exactly once, so a
   * reorder must never drop or duplicate one.
   */
  it('keeps every item exactly once', () => {
    const moved = moveInOrder(stops, 2, 'up');

    expect([...moved].sort()).toEqual([...stops].sort());
    expect(moved).toHaveLength(stops.length);
  });

  it('does not mutate the input', () => {
    const original = [...stops];
    moveInOrder(stops, 1, 'down');

    expect(stops).toEqual(original);
  });
});
