/**
 * Firebase calls bypass Angular's HttpClient, so `errorInterceptor` never sees
 * their failures. This is the equivalent localization point: it turns a
 * FirebaseError (or anything thrown by the SDK) into Spanish copy.
 *
 * It returns a plain string rather than an `ApiError` because the callers are
 * listener callbacks and upload helpers that only render a message — there is
 * no HTTP status to carry.
 */

export const FIREBASE_FALLBACK_MESSAGE = 'No se pudo completar la operación con el servicio.';

const NETWORK_MESSAGE = 'No se pudo conectar con el servicio. Revisa tu conexión.';
const PERMISSION_MESSAGE = 'No hay permiso para acceder a estos datos.';

/**
 * Keyed by the normalized code: lowercase, `_` as `-`, product prefix removed
 * where Realtime Database and Storage name the same failure differently
 * (`PERMISSION_DENIED` vs `storage/unauthorized`).
 */
const FIREBASE_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  'permission-denied': PERMISSION_MESSAGE,
  'database/permission-denied': PERMISSION_MESSAGE,
  'storage/unauthorized': 'No hay permiso para subir o ver este archivo.',
  'storage/unauthenticated': 'La sesión de almacenamiento no es válida. Inicia sesión de nuevo.',
  'storage/canceled': 'La subida del archivo fue cancelada.',
  'storage/quota-exceeded': 'Se agotó el espacio de almacenamiento disponible.',
  'storage/retry-limit-exceeded':
    'La subida tardó demasiado. Revisa la conexión e inténtalo de nuevo.',
  'storage/object-not-found': 'No se encontró el archivo solicitado.',
  unavailable: NETWORK_MESSAGE,
  'network-error': NETWORK_MESSAGE,
  disconnected: NETWORK_MESSAGE,
  'auth/network-request-failed': NETWORK_MESSAGE,
};

function extractCode(error: unknown): string | null {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code: unknown }).code;
    if (typeof code === 'string') {
      return code.toLowerCase().replaceAll('_', '-');
    }
  }
  return null;
}

/**
 * User-facing message for a Firebase failure. Unknown codes never fall back to
 * the SDK's own message: it is English prose meant for developers and can
 * include internal paths. Pass `fallback` for context-specific copy
 * (e.g. "No se pudo subir la imagen.").
 */
export function describeFirebaseError(
  error: unknown,
  fallback: string = FIREBASE_FALLBACK_MESSAGE,
): string {
  const code = extractCode(error);
  return (code && FIREBASE_ERROR_MESSAGES[code]) || fallback;
}
