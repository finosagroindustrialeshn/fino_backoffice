export interface ProductCategory {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly sortOrder: number;
  readonly isActive: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ProductCategoryInput {
  readonly code: string;
  readonly name: string;
  readonly description: string;
  readonly sortOrder: number;
}
