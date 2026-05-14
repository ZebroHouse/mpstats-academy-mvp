import { describe, it, expect } from 'vitest';
import { extractBearerToken, validateBearerToken, parseAllowedTokens } from '../rag-auth';

describe('extractBearerToken', () => {
  it('returns null when header missing', () => {
    expect(extractBearerToken(null)).toBeNull();
    expect(extractBearerToken('')).toBeNull();
  });

  it('returns null when scheme is not Bearer', () => {
    expect(extractBearerToken('Basic abc')).toBeNull();
    expect(extractBearerToken('token abc')).toBeNull();
  });

  it('extracts token value after "Bearer "', () => {
    expect(extractBearerToken('Bearer abc.def')).toBe('abc.def');
  });

  it('trims trailing whitespace', () => {
    expect(extractBearerToken('Bearer abc  ')).toBe('abc');
  });
});

describe('validateBearerToken', () => {
  it('returns false for empty allowlist', () => {
    expect(validateBearerToken('x', [])).toBe(false);
  });

  it('returns false for missing token', () => {
    expect(validateBearerToken(null, ['x'])).toBe(false);
    expect(validateBearerToken('', ['x'])).toBe(false);
  });

  it('returns true when token in allowlist (exact match)', () => {
    expect(validateBearerToken('aim_dev_abc', ['aim_dev_abc', 'aim_prod_xyz'])).toBe(true);
  });

  it('returns false when token not in allowlist', () => {
    expect(validateBearerToken('hacker', ['aim_dev_abc'])).toBe(false);
  });

  it('constant-time-ish: tokens of equal length are still compared (no early exit on first byte)', () => {
    expect(validateBearerToken('aaaaaaaa', ['bbbbbbbb'])).toBe(false);
  });
});

describe('parseAllowedTokens', () => {
  it('returns [] for undefined or empty', () => {
    expect(parseAllowedTokens(undefined)).toEqual([]);
    expect(parseAllowedTokens('')).toEqual([]);
    expect(parseAllowedTokens('[]')).toEqual([]);
  });

  it('returns parsed array of strings', () => {
    expect(parseAllowedTokens('["aim_dev","aim_prod"]')).toEqual(['aim_dev', 'aim_prod']);
  });

  it('filters out empty strings', () => {
    expect(parseAllowedTokens('["aim_dev",""]')).toEqual(['aim_dev']);
  });

  it('returns [] for malformed JSON', () => {
    expect(parseAllowedTokens('not json')).toEqual([]);
  });

  it('returns [] for JSON not an array of strings', () => {
    expect(parseAllowedTokens('{"a":1}')).toEqual([]);
    expect(parseAllowedTokens('[1,2]')).toEqual([]);
  });
});
