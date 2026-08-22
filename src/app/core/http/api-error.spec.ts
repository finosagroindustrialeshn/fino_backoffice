import { describe, expect, it } from 'vitest';

import { isApiError, validationFields, type ApiError } from './api-error';

function error(details: unknown): ApiError {
  return {
    status: 400,
    code: 'VALIDATION_FAILED',
    message: 'Revisá los datos ingresados.',
    details,
  };
}

describe('validationFields', () => {
  it('reads the per-field breakdown the API sends with VALIDATION_FAILED', () => {
    const fields = validationFields(
      error({
        code: 'VALIDATION_FAILED',
        fields: [
          {
            field: 'items.0.unitPriceRef',
            messages: [
              'unitPriceRef must be a number conforming to the specified constraints',
            ],
          },
          { field: 'clientId', messages: ['clientId must be a UUID'] },
        ],
      }),
    );

    expect(fields).toEqual([
      {
        field: 'items.0.unitPriceRef',
        messages: [
          'unitPriceRef must be a number conforming to the specified constraints',
        ],
      },
      { field: 'clientId', messages: ['clientId must be a UUID'] },
    ]);
  });

  it('is empty when the failure carries no field breakdown', () => {
    // Only VALIDATION_FAILED comes with `fields`; every other code is a
    // single sentence about the whole request.
    expect(validationFields(error({ code: 'SALES_ORDER_EMPTY' }))).toEqual([]);
  });

  it('survives a body that is not our error envelope at all', () => {
    // A proxy or a gateway can answer with HTML or a bare string, and a
    // diagnostic helper must never be the thing that throws.
    expect(validationFields(error('<html>502</html>'))).toEqual([]);
    expect(validationFields(error(null))).toEqual([]);
    expect(validationFields(error(undefined))).toEqual([]);
  });

  it('drops entries that are not shaped like a field error', () => {
    const fields = validationFields(
      error({
        fields: [
          'not an object',
          { field: 'ok', messages: ['fine'] },
          { field: 'missing messages' },
          { messages: ['missing field'] },
          { field: 'bad messages', messages: 'not an array' },
        ],
      }),
    );

    expect(fields).toEqual([{ field: 'ok', messages: ['fine'] }]);
  });

  it('takes anything, not just an ApiError', () => {
    expect(validationFields(new Error('boom'))).toEqual([]);
    expect(validationFields('nope')).toEqual([]);
  });
});

describe('isApiError', () => {
  it('accepts a normalized error', () => {
    expect(isApiError(error({}))).toBe(true);
  });

  it('rejects a raw Error and anything else', () => {
    expect(isApiError(new Error('boom'))).toBe(false);
    expect(isApiError(null)).toBe(false);
    expect(isApiError({ status: 400 })).toBe(false);
  });
});
