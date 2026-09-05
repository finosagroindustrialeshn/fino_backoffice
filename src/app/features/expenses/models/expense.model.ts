/**
 * A petty-cash expense paid in the field, deducted from the seller's float and
 * subtracted from the expected cash at shift close.
 */
export interface Expense {
  readonly id: string;
  /** The shift the expense was charged against — always set, never null. */
  readonly shiftId: string;
  readonly sellerId: string;
  /**
   * Who spent it. The listing spans sellers for the office and the accountant,
   * and a uuid can be neither sorted on nor read.
   */
  readonly sellerName: string;
  readonly categoryId: string;
  /** The label the row is read by, not the id behind it. */
  readonly categoryName: string;
  readonly amount: number;
  readonly description: string | null;
  readonly createdById: string | null;
  readonly createdAt: string;
}
