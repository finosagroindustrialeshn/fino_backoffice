/** One component of the guaranteed analysis printed on the product label. */
export interface CompositionItem {
  readonly name: string;
  readonly value: number;
  /** Unit of measure (%, g/kg, ppm, …). Omitted when the value is unitless. */
  readonly unit?: string;
}

export interface Product {
  readonly id: string;
  readonly name: string;
  readonly sku: string;
  readonly description: string | null;
  /** Public image URL (Supabase Storage), or null. */
  readonly imageUrl: string | null;
  /** Public technical sheet URL — image or PDF (Supabase Storage), or null. */
  readonly technicalSheetUrl: string | null;
  /** Guaranteed-analysis components, or null when never set. */
  readonly composition: readonly CompositionItem[] | null;
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
  readonly technicalSheetUrl: string | null;
  /** Empty array clears the composition; the API never receives null here. */
  readonly composition: readonly CompositionItem[];
  readonly cost: number;
  readonly price: number;
  readonly categoryId: string;
  readonly presentationId: string;
  readonly isActive: boolean;
}
