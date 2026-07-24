/** A job position (puesto) used to classify HR employees. */
export interface JobPosition {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly sortOrder: number;
  readonly isActive: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * Create/update payload. Only `name` is required by the API; `description`
 * and `sortOrder` are always sent so an edit can clear or reorder them.
 */
export interface JobPositionInput {
  readonly name: string;
  readonly description: string;
  readonly sortOrder: number;
}
