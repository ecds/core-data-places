/**
 * Whether a user-defined field has a value worth showing. `false` and `0`
 * are values — a "No" answer, a count of zero — and are shown; only missing
 * or empty ones are hidden.
 */
export const hasFieldValue = (value: unknown): boolean => {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === 'string') {
    return value.trim() !== '';
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return true;
};
