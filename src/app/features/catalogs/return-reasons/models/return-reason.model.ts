/** A reason a product was returned on a retorno, e.g. "Vencido", "Dañado". */
export interface ReturnReason {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly sortOrder: number;
  readonly isActive: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}
