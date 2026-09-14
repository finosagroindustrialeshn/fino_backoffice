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
  /**
   * Deepest discount a sale line may take below the price, as a whole
   * percent, as set from the back office. Null means no percentage cap: the
   * line may go all the way down to the cost. Either way the floor never
   * drops below the cost — see `minPrice`.
   */
  readonly maxDiscountPercent: number | null;
  /**
   * Lowest unit price a sale line may carry: the cost, or the price less
   * `maxDiscountPercent` when that is set and higher than the cost; never
   * above the price. A line priced below it is refused by the API.
   */
  readonly minPrice: number;
  /**
   * How far below the price a line may actually go, as a percent of it —
   * `(price − minPrice) / price`, rounded down. `maxDiscountPercent` is what
   * was asked for; this is what the cost allows.
   */
  readonly allowedDiscountPercent: number;
  readonly categoryId: string | null;
  readonly presentationId: string | null;
  /**
   * Exempt from ISV by law (agricultural inputs and the like). Informational:
   * prices are ISV-inclusive either way, so no total changes with this flag.
   */
  readonly isvExempt: boolean;
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
  /**
   * Whole percent 0–100, sent as a JSON number (a string is refused). Null
   * clears the cap on PATCH; omit the key on POST or to leave it unchanged.
   */
  readonly maxDiscountPercent?: number | null;
  readonly categoryId: string;
  readonly presentationId: string;
  readonly isvExempt: boolean;
  readonly isActive: boolean;
}

/**
 * One field edit from `GET /products/{id}/changes`, newest first.
 *
 * Values are text on purpose: the logged fields are numeric, boolean, uuid
 * and JSON alike, and the log is read, never summed. A null value means the
 * field was EMPTY at that point, not that it is unknown.
 */
export interface ProductChange {
  readonly id: string;
  /** The product property that changed, spelled as in the product payload. */
  readonly field: string;
  readonly oldValue: string | null;
  readonly newValue: string | null;
  /** Null for a change not made by a user. */
  readonly changedById: string | null;
  readonly changedByName: string | null;
  readonly changedAt: string;
}

/**
 * Spanish names for the logged fields. The API sends the raw property name,
 * which is developer vocabulary — anything unmapped falls back to it rather
 * than being hidden, so a newly logged field still shows up in the history.
 */
export const PRODUCT_FIELD_LABELS: Record<string, string> = {
  name: 'Nombre',
  sku: 'SKU',
  description: 'Descripción',
  imageUrl: 'Imagen',
  technicalSheetUrl: 'Ficha técnica',
  composition: 'Composición',
  cost: 'Costo',
  price: 'Precio',
  maxDiscountPercent: 'Descuento máximo (%)',
  categoryId: 'Categoría',
  presentationId: 'Presentación',
  isvExempt: 'Exento de ISV',
  isActive: 'Estado',
};

/**
 * Logged fields whose values are booleans. The log carries them as the text
 * "true"/"false", which reads better as a plain yes/no.
 */
export const PRODUCT_BOOLEAN_FIELDS: ReadonlySet<string> = new Set([
  'isvExempt',
  'isActive',
]);
