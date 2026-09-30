import { describe, expect, it } from 'vitest';
import { hasFieldValue } from '../src/utils/fieldValues';

describe('hasFieldValue', () => {
  it('shows false and zero', () => {
    expect(hasFieldValue(false)).toBe(true);
    expect(hasFieldValue(0)).toBe(true);
  });

  it('shows ordinary values', () => {
    expect(hasFieldValue(true)).toBe(true);
    expect(hasFieldValue(1929)).toBe(true);
    expect(hasFieldValue('Midtown')).toBe(true);
    expect(hasFieldValue(['a'])).toBe(true);
  });

  it('hides missing and empty values', () => {
    expect(hasFieldValue(null)).toBe(false);
    expect(hasFieldValue(undefined)).toBe(false);
    expect(hasFieldValue('')).toBe(false);
    expect(hasFieldValue('   ')).toBe(false);
    expect(hasFieldValue([])).toBe(false);
  });
});
