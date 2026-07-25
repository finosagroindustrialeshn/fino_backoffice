import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { formatDay, lastNDays, monthToDate } from '../../utils/date-range';
import { DateRangePresets } from './date-range-presets';

/**
 * Test-only view of the members the template binds to. They are `protected`
 * on the component (template-visible, not public API), so the spec reaches
 * them through one explicit structural cast instead of scattering `any`.
 */
interface PresetsInternals {
  pickToday(): void;
  pickLast7Days(): void;
  pickThisMonth(): void;
}

describe('DateRangePresets', () => {
  let fixture: ComponentFixture<DateRangePresets>;
  let cmp: PresetsInternals;
  let emitted: [Date, Date] | undefined;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 24));

    await TestBed.configureTestingModule({
      imports: [DateRangePresets],
    }).compileComponents();

    fixture = TestBed.createComponent(DateRangePresets);
    fixture.detectChanges();

    cmp = fixture.componentInstance as unknown as PresetsInternals;
    emitted = undefined;
    fixture.componentInstance.rangeSelected.subscribe((range: [Date, Date]) => {
      emitted = range;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits the last 1 day range when "Hoy" is clicked', () => {
    cmp.pickToday();

    const [expectedFrom, expectedTo] = lastNDays(1, new Date());
    expect(emitted).toBeDefined();
    expect(formatDay(emitted![0])).toBe(formatDay(expectedFrom));
    expect(formatDay(emitted![1])).toBe(formatDay(expectedTo));
  });

  it('emits the last 7 days range when "7 días" is clicked', () => {
    cmp.pickLast7Days();

    const [expectedFrom, expectedTo] = lastNDays(7, new Date());
    expect(emitted).toBeDefined();
    expect(formatDay(emitted![0])).toBe(formatDay(expectedFrom));
    expect(formatDay(emitted![1])).toBe(formatDay(expectedTo));
  });

  it('emits the month-to-date range when "Este mes" is clicked', () => {
    cmp.pickThisMonth();

    const [expectedFrom, expectedTo] = monthToDate(new Date());
    expect(emitted).toBeDefined();
    expect(formatDay(emitted![0])).toBe(formatDay(expectedFrom));
    expect(formatDay(emitted![1])).toBe(formatDay(expectedTo));
  });
});
