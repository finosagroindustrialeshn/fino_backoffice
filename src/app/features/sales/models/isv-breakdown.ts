/** Honduran sales tax (ISV), as the fraction already contained in a price. */
export const ISV_RATE = 0.15;

/** What a breakdown needs from a sale line: what it costs and whether it is taxed. */
export interface IsvLine {
  /** Line amount as the customer pays it — ISV-inclusive when taxable. */
  readonly subtotal: number;
  /** Exempt by law: the whole subtotal is base and it carries no ISV. */
  readonly isvExempt: boolean;
}

export interface IsvBreakdown {
  /** Sum of the taxable lines net of ISV. */
  readonly taxableBase: number;
  /** Sum of the exempt lines — what they cost, no tax inside. */
  readonly exemptBase: number;
  /** ISV already contained in the taxable lines. */
  readonly isv: number;
  /** Sum of every subtotal, untouched — the breakdown never moves the total. */
  readonly total: number;
}

/**
 * Splits ISV out of a cart for display only. Prices are ISV-INCLUSIVE, so a
 * taxable line is `base = subtotal / (1 + ISV_RATE)` and the tax is what is
 * left; an exempt line is all base. Nothing here changes what is charged.
 *
 * Each line is rounded to cents on its own and then summed, the way a receipt
 * prints it. That means the ISV shown can differ by ±0.01 from ISV computed
 * off the grand total (e.g. three taxable lines of L 10.00 give 3 × 1.30 =
 * 3.90, while 30 − 30 / 1.15 rounds to 3.91). That is intended: the rows on
 * screen add up to the lines a customer can check one by one.
 */
export function isvBreakdown(lines: readonly IsvLine[]): IsvBreakdown {
  let taxableBase = 0;
  let exemptBase = 0;
  let isv = 0;
  let total = 0;
  for (const line of lines) {
    const subtotal = roundMoney(line.subtotal);
    total += subtotal;
    if (line.isvExempt) {
      exemptBase += subtotal;
      continue;
    }
    const base = roundMoney(subtotal / (1 + ISV_RATE));
    taxableBase += base;
    // The remainder, so base + ISV is exactly the line the customer sees.
    isv += roundMoney(subtotal - base);
  }
  return {
    taxableBase: roundMoney(taxableBase),
    exemptBase: roundMoney(exemptBase),
    isv: roundMoney(isv),
    total: roundMoney(total),
  };
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
