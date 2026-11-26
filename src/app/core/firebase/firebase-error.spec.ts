import { FirebaseError } from 'firebase/app';
import { describe, expect, it } from 'vitest';

import { FIREBASE_FALLBACK_MESSAGE, describeFirebaseError } from './firebase-error';

describe('describeFirebaseError', () => {
  it.each([
    ['PERMISSION_DENIED', 'No hay permiso para acceder a estos datos.'],
    ['permission-denied', 'No hay permiso para acceder a estos datos.'],
    ['database/permission-denied', 'No hay permiso para acceder a estos datos.'],
    ['storage/unauthorized', 'No hay permiso para subir o ver este archivo.'],
    ['storage/unauthenticated', 'La sesión de almacenamiento no es válida. Inicia sesión de nuevo.'],
    ['storage/canceled', 'La subida del archivo fue cancelada.'],
    ['storage/quota-exceeded', 'Se agotó el espacio de almacenamiento disponible.'],
    [
      'storage/retry-limit-exceeded',
      'La subida tardó demasiado. Revisa la conexión e inténtalo de nuevo.',
    ],
    ['storage/object-not-found', 'No se encontró el archivo solicitado.'],
    ['unavailable', 'No se pudo conectar con el servicio. Revisa tu conexión.'],
    ['network-error', 'No se pudo conectar con el servicio. Revisa tu conexión.'],
    ['disconnected', 'No se pudo conectar con el servicio. Revisa tu conexión.'],
  ])('maps %s to Spanish copy', (code, expected) => {
    expect(describeFirebaseError(new FirebaseError(code, 'raw english text'))).toBe(expected);
  });

  it('reads the code from a plain error-like object too', () => {
    expect(describeFirebaseError({ code: 'PERMISSION_DENIED', message: 'x' })).toBe(
      'No hay permiso para acceder a estos datos.',
    );
  });

  it('never leaks the raw English message for an unknown code', () => {
    const message = describeFirebaseError(new FirebaseError('storage/weird', 'internal detail'));
    expect(message).toBe(FIREBASE_FALLBACK_MESSAGE);
    expect(message).not.toContain('internal detail');
  });

  it('uses the caller fallback when provided and the code is unknown', () => {
    expect(describeFirebaseError(new Error('boom'), 'No se pudo subir la imagen.')).toBe(
      'No se pudo subir la imagen.',
    );
  });

  it.each([null, undefined, 'text', 42])('falls back for non-error value %s', (value) => {
    expect(describeFirebaseError(value)).toBe(FIREBASE_FALLBACK_MESSAGE);
  });
});
