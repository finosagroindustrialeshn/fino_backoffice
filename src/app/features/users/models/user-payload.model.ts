import type { Role } from '../../../core/auth/user-profile.model';

/**
 * Body for POST /users. The backend provisions the Supabase Auth identity
 * (email + password) and mirrors the business row with the given role.
 * Requires the ADMIN role. Matches CreateUserDto in the API.
 */
export interface CreateUserPayload {
  readonly email: string;
  readonly fullName: string;
  readonly password: string;
  readonly phone: string;
  readonly role: Role;
}
