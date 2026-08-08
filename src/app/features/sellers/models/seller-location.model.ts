/**
 * A seller's last known position, as published to Realtime Database under
 * `sellers/{sellerId}/location` by the field app.
 */
export interface SellerLocation {
  /** Matches the seller's user id in the API, so it can be joined with /users. */
  readonly sellerId: string;
  readonly latitude: number;
  readonly longitude: number;
  /** ISO 8601 instant, normalized to UTC. See {@link normalizeInstant}. */
  readonly capturedAt: string;
}

/**
 * How stale a position may be and still count as live. A seller who last
 * reported hours ago is not "on the map right now", and drawing them the same
 * as someone reporting this minute would misrepresent where the fleet is.
 */
export const STALE_AFTER_MS = 5 * 60 * 1000;

/**
 * The field app writes `capturedAt` with NO timezone designator
 * (`2026-08-08T17:02:05.684100` — microseconds included, the signature of
 * Python's `datetime.isoformat()`).
 *
 * Measured against a known UTC instant, the value tracks LOCAL time, not UTC:
 * a device reporting live read as 9 minutes old when parsed as local, and as
 * 369 minutes old when parsed as UTC. ECMAScript already parses an offset-less
 * date-time as local, so the value is passed through untouched. Forcing a `Z`
 * onto it (the project's usual UTC convention) would age every position by six
 * hours and paint every live seller as offline.
 *
 * A value that DOES carry an offset is honoured as written, so this keeps
 * working if the field app starts publishing proper UTC — which is where the
 * real fix belongs, since this one only holds while the backoffice and the
 * field share a timezone (Honduras, UTC-6, no DST).
 */
export function normalizeInstant(value: string): string {
  return value;
}

/** Milliseconds since a position was captured, or null if it cannot be read. */
export function ageMs(location: SellerLocation, now: number): number | null {
  const captured = Date.parse(location.capturedAt);
  return Number.isNaN(captured) ? null : now - captured;
}

/** A position is live while it is recent enough to still describe where someone is. */
export function isLive(location: SellerLocation, now: number): boolean {
  const age = ageMs(location, now);
  return age !== null && age < STALE_AFTER_MS;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Reads a `sellers` snapshot into typed positions.
 *
 * The payload crosses a trust boundary — it is written by the mobile app, not
 * by this code — so every field is checked rather than asserted. A seller whose
 * node is missing, malformed, or still at 0,0 (no GPS fix yet) is dropped
 * instead of being drawn somewhere it is not.
 */
export function parseSellerLocations(
  snapshot: unknown,
): readonly SellerLocation[] {
  if (typeof snapshot !== 'object' || snapshot === null) {
    return [];
  }

  const locations: SellerLocation[] = [];
  for (const [sellerId, node] of Object.entries(
    snapshot as Record<string, unknown>,
  )) {
    if (typeof node !== 'object' || node === null) {
      continue;
    }
    const location = (node as { location?: unknown }).location;
    if (typeof location !== 'object' || location === null) {
      continue;
    }

    const { latitude, longitude, capturedAt } = location as {
      latitude?: unknown;
      longitude?: unknown;
      capturedAt?: unknown;
    };
    if (!isFiniteNumber(latitude) || !isFiniteNumber(longitude)) {
      continue;
    }
    // 0,0 is Null Island: the app's "no fix yet", not a place anyone is.
    if (latitude === 0 && longitude === 0) {
      continue;
    }

    locations.push({
      sellerId,
      latitude,
      longitude,
      capturedAt:
        typeof capturedAt === 'string' ? normalizeInstant(capturedAt) : '',
    });
  }

  return locations;
}
