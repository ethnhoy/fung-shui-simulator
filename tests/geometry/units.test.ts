import { describe, expect, it } from 'vitest';
import { formatLength, fromInputValue, toInputValue } from '../../src/geometry/units';

describe('units', () => {
  it('formats metric lengths in whole cm', () => {
    expect(formatLength(160.4, 'metric')).toBe('160 cm');
  });

  it('formats imperial lengths as feet and inches', () => {
    expect(formatLength(160, 'imperial')).toBe('5′ 3″');
    expect(formatLength(182.88, 'imperial')).toBe('6′');
    expect(formatLength(10, 'imperial')).toBe('4″');
  });

  it('round-trips input values through inches', () => {
    expect(fromInputValue(toInputValue(254, 'imperial'), 'imperial')).toBeCloseTo(254);
  });
});
