export type MovementType =
  | 'PURCHASE'
  | 'ADJUSTMENT'
  | 'DISPATCH_OUT'
  | 'RETURN_IN';

export interface WarehouseStock {
  readonly productId: string;
  readonly quantity: number;
  readonly updatedAt: string;
}

export interface InventoryMovement {
  readonly id: string;
  readonly productId: string;
  readonly type: MovementType;
  /** Signed delta in presentation units: positive adds, negative removes. */
  readonly quantity: number;
  readonly note: string | null;
  readonly createdById: string | null;
  readonly createdAt: string;
}

export interface MovementPayload {
  readonly type: MovementType;
  /** Signed delta: positive adds, negative removes. */
  readonly quantity: number;
  readonly note: string | null;
}
