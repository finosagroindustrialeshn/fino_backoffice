export interface Product {
  readonly id: string;
  readonly name: string;
  readonly sku: string;
  readonly description: string | null;
  /** Public image URL (Supabase Storage), or null. */
  readonly imageUrl: string | null;
  /** Purchase cost per presentation. */
  readonly cost: number;
  /** Sale price per presentation. */
  readonly price: number;
  readonly categoryId: string | null;
  readonly presentationId: string | null;
  readonly isActive: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ProductPayload {
  readonly name: string;
  readonly sku: string;
  readonly description: string | null;
  readonly imageUrl: string | null;
  readonly cost: number;
  readonly price: number;
  readonly categoryId: string;
  readonly presentationId: string;
  readonly isActive: boolean;
}
