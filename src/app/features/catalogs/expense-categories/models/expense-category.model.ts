/** Petty-cash expense category used to classify operating expenses in accounting. */
export interface ExpenseCategory {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly sortOrder: number;
  readonly isActive: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Body shared by create (POST) and update (PATCH) — status is managed via activate/deactivate. */
export interface ExpenseCategoryInput {
  readonly code: string;
  readonly name: string;
  readonly description: string;
  readonly sortOrder: number;
}
