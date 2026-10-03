import type { Role } from '../../../core/auth/user-profile.model';

/**
 * Login handle rule from the API: 3 to 30 characters, letters, numbers,
 * "." and "_". The API lowercases it before storing it.
 */
export const USERNAME_PATTERN = /^[A-Za-z0-9._]{3,30}$/;

/**
 * Body for POST /users. The backend provisions the Supabase Auth identity
 * and mirrors the business row with the given role. Email is optional; when
 * it is omitted, a username is required and becomes the login handle.
 * Requires the ADMIN role. Matches CreateUserDto in the API.
 */
export interface CreateUserPayload {
  readonly email?: string;
  readonly username?: string;
  readonly fullName: string;
  readonly password: string;
  readonly phone?: string;
  readonly role: Role;
}

/**
 * Body for PATCH /users/{id}. Only the fields sent are changed. Email, role,
 * active state and password have their own endpoints.
 */
export interface UpdateUserPayload {
  readonly fullName?: string;
  readonly phone?: string;
  readonly username?: string;
}

/** Body for PATCH /users/{id}/email. The email is also the Supabase Auth credential. */
export interface UpdateUserEmailPayload {
  readonly email: string;
}
