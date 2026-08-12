/**
 * A petty-cash expense paid in the field, deducted from the seller's float and
 * subtracted from the expected cash at shift close.
 */
export interface Expense {
  readonly id: string;
  /** The shift the expense was charged against — always set, never null. */
  readonly shiftId: string;
  readonly sellerId: string;
  readonly categoryId: string;
  readonly amount: number;
  readonly description: string | null;
  readonly createdById: string | null;
  readonly createdAt: string;
}
