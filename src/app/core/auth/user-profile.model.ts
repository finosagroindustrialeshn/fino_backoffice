export type Role =
  | 'ADMIN'
  | 'SUPERVISOR'
  | 'ACCOUNTANT'
  | 'SELLER'
  | 'PRESELLER';

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrador',
  SUPERVISOR: 'Supervisor',
  ACCOUNTANT: 'Contador',
  SELLER: 'Vendedor',
  // The API calls this role PRESELLER; the label stays the Spanish trade name
  // because "preventista" is what the role is called in the field.
  PRESELLER: 'Preventista',
};

/** Business profile returned by GET /auth/me, provisioned from the Supabase JWT on first access. */
export interface UserProfile {
  readonly id: string;
  readonly email: string;
  readonly fullName: string;
  readonly phone: string | null;
  readonly role: Role;
  readonly isActive: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Shared across the sidebar and topbar user avatars, e.g. "Ana Castillo" → "AC". */
export function getInitials(fullName: string | null | undefined): string {
  if (!fullName) {
    return '';
  }
  return fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}
