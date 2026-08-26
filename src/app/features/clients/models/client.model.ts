/** Payment state of the client's most recent sale. */
export type LastPurchaseStatus = 'PAID' | 'PARTIAL' | 'PENDING';

export const LAST_PURCHASE_STATUS_LABELS: Record<LastPurchaseStatus, string> = {
  PAID: 'Pagada',
  PARTIAL: 'Parcial',
  PENDING: 'Pendiente',
};

export type LastPurchaseStatusSeverity = 'success' | 'warn' | 'danger';

export const LAST_PURCHASE_STATUS_SEVERITY: Record<
  LastPurchaseStatus,
  LastPurchaseStatusSeverity
> = {
  PAID: 'success',
  PARTIAL: 'warn',
  PENDING: 'danger',
};

/**
 * The client's most recent sale, as carried by the client LIST.
 * Line items are not included here — see {@link LastPurchase}.
 */
export interface LastPurchaseSummary {
  /** The sale itself, to open it with GET /sales/:id. */
  readonly saleId: string;
  readonly date: string;
  /** Sale total in Lempiras. */
  readonly total: number;
  readonly status: LastPurchaseStatus;
  /** Still outstanding on that sale. Non-zero means the client owes for what they last took. */
  readonly balanceDue: number;
}

/** One product line of the client's most recent sale. */
export interface LastPurchaseLine {
  readonly productId: string;
  /** Carried so the UI can show what was bought without a second call. */
  readonly productName: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly subtotal: number;
}

/** The most recent sale WITH its products, as carried by the client DETAIL. */
export interface LastPurchase extends LastPurchaseSummary {
  readonly items: readonly LastPurchaseLine[];
}

export interface Client {
  readonly id: string;
  /**
   * Short human-readable code (CLI-0042) for dictating over the phone or
   * reading off a screen. A LABEL, not a key — every request still uses `id`.
   */
  readonly code: string;
  readonly name: string;
  readonly address: string | null;
  readonly contactName: string | null;
  readonly phone: string | null;
  /**
   * Honduran tax id (RTN), digits only. Null for a client who is not a
   * registered taxpayer — the normal case in the field, so render it blank,
   * never as an error. ALWAYS a string: a leading zero is meaningful.
   */
  readonly rtn: string | null;
  readonly notes: string | null;
  /** Storefront photo public URL (Supabase Storage), or null. */
  readonly imageUrl: string | null;
  readonly latitude: number;
  readonly longitude: number;
  readonly isActive: boolean;
  /**
   * Id of the seller who registered the client. Audit only — it never changes
   * and does not grant access. See {@link Client.assignedSellerId} for ownership.
   */
  readonly createdById: string | null;
  /**
   * Seller who owns this client. Null means unassigned — the normal state for a
   * client registered from the backoffice and not yet handed to a seller.
   */
  readonly assignedSellerId: string | null;
  /**
   * Preseller who owns this client — a SECOND owner, independent of
   * {@link Client.assignedSellerId}: the preseller takes the order ahead of
   * the visit and the seller carries the product, so both are normally set.
   * Null means no preseller works this client.
   */
  readonly assignedPresellerId: string | null;
  /** Most recent sale, or null when the client has never bought. */
  readonly lastPurchase: LastPurchaseSummary | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** A single client as returned by GET /clients/:id — last purchase carries its lines. */
export interface ClientDetail extends Client {
  readonly lastPurchase: LastPurchase | null;
}

/** Maximum digits an RTN may carry. Honduras uses 14 today; the API allows 20. */
export const RTN_MAX_DIGITS = 20;

/** Dashes and spaces are cosmetic — the API strips them, and so do we before sending. */
export function stripRtnSeparators(value: string): string {
  return value.replace(/[\s-]/g, '');
}

export interface ClientPayload {
  readonly name: string;
  readonly address: string | null;
  readonly contactName: string | null;
  readonly phone: string | null;
  /** Digits only — separators are stripped before sending. */
  readonly rtn: string | null;
  readonly notes: string | null;
  readonly imageUrl: string | null;
  readonly latitude: number;
  readonly longitude: number;
  readonly isActive: boolean;
  /**
   * Seller who owns this client. ADMIN/SUPERVISOR only — a SELLER always gets
   * themselves and cannot assign. Omit to leave the client unassigned.
   */
  readonly assignedSellerId?: string | null;
  /**
   * Preseller who owns this client, independent of `assignedSellerId`.
   * ADMIN/SUPERVISOR only — a PRESELLER always gets themselves.
   */
  readonly assignedPresellerId?: string | null;
}
