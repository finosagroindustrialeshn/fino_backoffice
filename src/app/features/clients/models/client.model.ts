export interface Client {
  readonly id: string;
  readonly name: string;
  readonly address: string | null;
  readonly contactName: string | null;
  readonly phone: string | null;
  readonly notes: string | null;
  /** Storefront photo public URL (Supabase Storage), or null. */
  readonly imageUrl: string | null;
  readonly latitude: number;
  readonly longitude: number;
  readonly isActive: boolean;
  /** Id of the seller/user who registered the client. */
  readonly createdById: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ClientPayload {
  readonly name: string;
  readonly address: string | null;
  readonly contactName: string | null;
  readonly phone: string | null;
  readonly notes: string | null;
  readonly imageUrl: string | null;
  readonly latitude: number;
  readonly longitude: number;
  readonly isActive: boolean;
}
