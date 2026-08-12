import { ROLE_LABELS, type Role, type UserProfile } from './user-profile.model';

/**
 * Session-scoped cache for the business profile (GET /auth/me).
 *
 * `sessionStorage`, not a cookie: the profile is only ever read by the client,
 * so shipping it back to the server on every single request would be pure
 * overhead, and a cookie the front-end must read cannot be httpOnly anyway —
 * there is no security to gain. sessionStorage also dies with the tab, which
 * is the lifetime we actually want.
 *
 * The cache is keyed by user id so a second person signing in on the same tab
 * can never be shown the previous user's name or role.
 *
 * Nothing here is trusted for authorization. A cached role decides which nav
 * items render, never what the caller may do — the API enforces that on every
 * request, and a tampered cache buys a bigger menu and a wall of 403s.
 */

const STORAGE_KEY = 'fino.auth.profile';

interface CachedProfile {
  readonly userId: string;
  readonly profile: UserProfile;
}

/**
 * Storage access is wrapped because it throws rather than degrades: Safari in
 * private mode and blocked third-party storage both raise on access. A cache
 * miss is always survivable — the caller just refetches.
 */
function storage(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

/** Rejects anything that is not a profile we could actually render. */
function isUserProfile(value: unknown): value is UserProfile {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate['id'] === 'string' &&
    typeof candidate['email'] === 'string' &&
    typeof candidate['fullName'] === 'string' &&
    typeof candidate['isActive'] === 'boolean' &&
    typeof candidate['role'] === 'string' &&
    Object.hasOwn(ROLE_LABELS, candidate['role'] as Role)
  );
}

/**
 * Returns the cached profile for `userId`, or null on any miss: no entry, a
 * different user, malformed JSON, or a shape that no longer matches the model
 * (a stale entry written by an older build).
 */
export function readCachedProfile(userId: string): UserProfile | null {
  const store = storage();
  if (!store) {
    return null;
  }

  const raw = store.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return null;
    }
    const entry = parsed as Partial<CachedProfile>;
    if (entry.userId !== userId || !isUserProfile(entry.profile)) {
      return null;
    }
    return entry.profile;
  } catch {
    // Corrupt entry: drop it so it stops being reconsidered every load.
    clearCachedProfile();
    return null;
  }
}

export function writeCachedProfile(userId: string, profile: UserProfile): void {
  const store = storage();
  if (!store) {
    return;
  }
  const entry: CachedProfile = { userId, profile };
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(entry));
  } catch {
    // Over quota or storage disabled — the app works fine without the cache.
  }
}

export function clearCachedProfile(): void {
  const store = storage();
  if (!store) {
    return;
  }
  try {
    store.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do: a cache we cannot clear is one we also cannot read.
  }
}
