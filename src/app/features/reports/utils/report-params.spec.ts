import { describe, expect, it } from 'vitest';

import { formatDay } from '../../../shared/utils/date-range';
import { parseBool, parseDay, parseOneOf, parseRange, parseUuid } from './report-params';

describe('parseDay', () => {
  it('parses a YYYY-MM-DD string into that local calendar day', () => {
    const parsed = parseDay('2026-07-24');
    expect(parsed).not.toBeNull();
    expect(formatDay(parsed!)).toBe('2026-07-24');
  });

  it('builds a local midnight, not a UTC one', () => {
    // `new Date('2026-07-24')` parses as UTC midnight, which is the previous
    // day in Honduras (UTC-6). The parser must not fall into that.
    expect(parseDay('2026-07-24')!.getDate()).toBe(24);
  });

  it('returns null for null or empty input', () => {
    expect(parseDay(null)).toBeNull();
    expect(parseDay('')).toBeNull();
  });

  it('rejects anything that is not YYYY-MM-DD', () => {
    expect(parseDay('24/07/2026')).toBeNull();
    expect(parseDay('2026-7-4')).toBeNull();
    expect(parseDay('hoy')).toBeNull();
    expect(parseDay('2026-07-24T10:00:00Z')).toBeNull();
  });

  it('rejects a syntactically valid but non-existent date', () => {
    expect(parseDay('2026-02-30')).toBeNull();
    expect(parseDay('2026-13-01')).toBeNull();
  });
});

describe('parseRange', () => {
  it('returns both bounds when both are valid', () => {
    const range = parseRange('2026-06-01', '2026-06-30');
    expect(range).not.toBeNull();
    expect(formatDay(range![0]!)).toBe('2026-06-01');
    expect(formatDay(range![1]!)).toBe('2026-06-30');
  });

  it('returns null when either bound is missing or invalid', () => {
    expect(parseRange('2026-06-01', null)).toBeNull();
    expect(parseRange(null, '2026-06-30')).toBeNull();
    expect(parseRange('basura', '2026-06-30')).toBeNull();
  });
});

describe('parseOneOf', () => {
  const CHANNELS = ['FIELD', 'STORE'] as const;

  it('accepts a value from the allowed list', () => {
    expect(parseOneOf('FIELD', CHANNELS)).toBe('FIELD');
  });

  it('rejects anything outside the list — the URL is user input', () => {
    expect(parseOneOf('BASURA', CHANNELS)).toBeNull();
    expect(parseOneOf('field', CHANNELS)).toBeNull();
    expect(parseOneOf(null, CHANNELS)).toBeNull();
  });
});

describe('parseUuid', () => {
  it('accepts a well-formed uuid', () => {
    expect(parseUuid('526ecab7-5628-4ee7-9d52-fa22288919d5')).toBe(
      '526ecab7-5628-4ee7-9d52-fa22288919d5',
    );
  });

  it('rejects malformed ids so they never reach the API', () => {
    expect(parseUuid('123')).toBeNull();
    expect(parseUuid("' OR 1=1--")).toBeNull();
    expect(parseUuid(null)).toBeNull();
  });
});

describe('parseBool', () => {
  it('reads only the literal "true" as true', () => {
    expect(parseBool('true')).toBe(true);
    expect(parseBool('false')).toBe(false);
    expect(parseBool('1')).toBe(false);
    expect(parseBool(null)).toBe(false);
  });
});
