import { describe, expect, it } from 'vitest';

import { agingSeverity } from './aging-severity';

describe('agingSeverity', () => {
  it.each([
    [0, 'current'],
    [29, 'current'],
    [30, 'due'],
    [59, 'due'],
    [60, 'overdue'],
    [89, 'overdue'],
    [90, 'critical'],
    [365, 'critical'],
  ] as const)('classifies a band starting at %i days as %s', (fromDays, expected) => {
    expect(agingSeverity({ fromDays })).toBe(expected);
  });
});
