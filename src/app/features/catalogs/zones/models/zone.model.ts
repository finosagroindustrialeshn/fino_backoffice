export interface Zone {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly sortOrder: number;
  readonly isActive: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ZonePayload {
  readonly code: string;
  readonly name: string;
  readonly description: string;
  readonly sortOrder: number;
}
