import { describe, expect, it } from 'vitest';

import {
  API_ERROR_CODES,
  API_ERROR_MESSAGES,
  isApiErrorCode,
} from './api-error-codes';

describe('isApiErrorCode', () => {
  it('accepts a code the API actually returns', () => {
    expect(isApiErrorCode('SHIFT_RETURN_PENDING')).toBe(true);
    expect(isApiErrorCode('PAYMENT_EXCEEDS_BALANCE')).toBe(true);
  });

  it('rejects anything that is not one of the known codes', () => {
    expect(isApiErrorCode('SOMETHING_ELSE')).toBe(false);
    expect(isApiErrorCode('')).toBe(false);
    expect(isApiErrorCode(undefined)).toBe(false);
    expect(isApiErrorCode(null)).toBe(false);
    expect(isApiErrorCode(409)).toBe(false);
    expect(isApiErrorCode({ code: 'CONFLICT' })).toBe(false);
  });

  it('is not fooled by a lowercase variant', () => {
    expect(isApiErrorCode('conflict')).toBe(false);
  });
});

describe('API_ERROR_MESSAGES', () => {
  it('has Spanish copy for every code the API can return', () => {
    const missing = API_ERROR_CODES.filter((code) => !API_ERROR_MESSAGES[code]);

    // The map is Partial by type, but an unmapped code means the user gets
    // the API's English developer prose. Keep it exhaustive on purpose.
    expect(missing).toEqual([]);
  });

  it('has no blank or whitespace-only message', () => {
    const blank = API_ERROR_CODES.filter(
      (code) => (API_ERROR_MESSAGES[code] ?? '').trim().length === 0,
    );

    expect(blank).toEqual([]);
  });

  it('tells the user what to do about a pending stock return', () => {
    const message = API_ERROR_MESSAGES['SHIFT_RETURN_PENDING'] ?? '';

    expect(message).toContain('retorno');
    // The point of the copy is the way out, not the rule that was broken.
    expect(message.toLowerCase()).toContain('confirm');
  });

  it('declares no message for a code that does not exist', () => {
    expect(
      (API_ERROR_MESSAGES as Record<string, string | undefined>)['NOPE'],
    ).toBeUndefined();
  });
});
