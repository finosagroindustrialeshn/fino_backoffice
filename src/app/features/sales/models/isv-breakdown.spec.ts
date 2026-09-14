import { describe, expect, it } from 'vitest';

import { ISV_RATE, isvBreakdown, type IsvLine } from './isv-breakdown';

function taxable(subtotal: number): IsvLine {
  return { subtotal, isvExempt: false };
}

function exempt(subtotal: number): IsvLine {
  return { subtotal, isvExempt: true };
}

function sum(lines: readonly IsvLine[]): number {
  return Math.round(lines.reduce((acc, l) => acc + l.subtotal, 0) * 100) / 100;
}

describe('isvBreakdown', () => {
  it('uses the Honduran 15 % rate', () => {
    expect(ISV_RATE).toBe(0.15);
  });

  it('is all zeros for an empty cart', () => {
    expect(isvBreakdown([])).toEqual({
      taxableBase: 0,
      exemptBase: 0,
      isv: 0,
      total: 0,
    });
  });

  it('splits the tax out of an all-taxable cart', () => {
    const lines = [taxable(1150), taxable(230)];

    expect(isvBreakdown(lines)).toEqual({
      taxableBase: 1200,
      exemptBase: 0,
      isv: 180,
      total: 1380,
    });
  });

  it('carries no tax on an all-exempt cart', () => {
    const lines = [exempt(100), exempt(250.5)];

    expect(isvBreakdown(lines)).toEqual({
      taxableBase: 0,
      exemptBase: 350.5,
      isv: 0,
      total: 350.5,
    });
  });

  it('keeps taxable and exempt lines apart in a mixed cart', () => {
    const lines = [taxable(1150), exempt(100), taxable(345)];

    expect(isvBreakdown(lines)).toEqual({
      taxableBase: 1300,
      exemptBase: 100,
      isv: 195,
      total: 1595,
    });
  });

  // Rounded per line, as a receipt prints it: 10.00 → 8.70 + 1.30. Off the
  // grand total the tax would be 3.91; the per-line sum is 3.90 on purpose.
  it('rounds each line to cents before summing', () => {
    const lines = [taxable(10), taxable(10), taxable(10)];

    const result = isvBreakdown(lines);

    expect(result.taxableBase).toBe(26.1);
    expect(result.isv).toBe(3.9);
    expect(result.total).toBe(30);
    expect(Math.round((30 - 30 / 1.15) * 100) / 100).toBe(3.91);
  });

  // Per-line rounding: one cent has no ISV to show, and the row stays hidden.
  it('shows no ISV on a one-cent taxable line', () => {
    expect(isvBreakdown([taxable(0.01)])).toEqual({
      taxableBase: 0.01,
      exemptBase: 0,
      isv: 0,
      total: 0.01,
    });
  });

  it('never moves the total: base + ISV is what the customer pays', () => {
    const carts: IsvLine[][] = [
      [],
      [taxable(0.01)],
      [taxable(19.99), exempt(0.1), taxable(0.2)],
      [taxable(10), taxable(10), taxable(10)],
      [exempt(1234.56), taxable(789.01), exempt(0.03)],
    ];

    for (const cart of carts) {
      const result = isvBreakdown(cart);
      expect(result.total).toBe(sum(cart));
      expect(
        Math.round((result.taxableBase + result.exemptBase + result.isv) * 100) /
          100,
      ).toBe(result.total);
    }
  });
});
