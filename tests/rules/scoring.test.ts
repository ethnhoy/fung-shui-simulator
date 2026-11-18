import { describe, expect, it } from 'vitest';
import { sampleLayout } from '../../src/model/sample';
import { WEIGHTS } from '../../src/rules/config';
import { evaluate, overallScore, scoreCategories, scoreLabel } from '../../src/rules/scoring';
import type { RuleResult } from '../../src/rules/types';
import { room } from './helpers';

const r = (category: RuleResult['category'], scoreImpact: number): RuleResult => ({
  id: 'x', category, status: scoreImpact < 0 ? 'bad' : 'good', scoreImpact, message: '', explanation: '', highlight: [],
});

describe('scoring', () => {
  it('weights add up to 100', () => {
    expect(Object.values(WEIGHTS).reduce((a: number, b) => a + b, 0)).toBe(100);
  });

  it('starts each category at 100 and clamps to 0..100', () => {
    const cats = scoreCategories([r('bed', -30), r('bed', -20), r('mirrors', -150), r('arrows', 10)]);
    expect(cats.find((c) => c.id === 'bed')!.score).toBe(50);
    expect(cats.find((c) => c.id === 'mirrors')!.score).toBe(0);
    expect(cats.find((c) => c.id === 'arrows')!.score).toBe(100);
  });

  it('computes the weighted overall score', () => {
    // Bed (35%) at 0, everything else at 100 → 65.
    expect(overallScore(scoreCategories([r('bed', -100)]))).toBe(65);
  });

  it('labels scores', () => {
    expect(scoreLabel(90)).toBe('Harmonious');
    expect(scoreLabel(70)).toBe('Good');
    expect(scoreLabel(50)).toBe('Needs attention');
    expect(scoreLabel(49)).toBe('Unsettled');
  });

  it('sorts results by severity: bad, warn, info, good', () => {
    const order = { bad: 0, warn: 1, info: 2, good: 3 };
    const statuses = evaluate(sampleLayout()).results.map((x) => order[x.status]);
    expect(statuses).toEqual([...statuses].sort((a, b) => a - b));
  });

  it('gives the sample bedroom a "Good" score and an empty room a low one', () => {
    const sample = evaluate(sampleLayout());
    expect(sample.overall).toBeGreaterThanOrEqual(70);
    expect(sample.overall).toBeLessThan(85);
    expect(evaluate(room([])).overall).toBeLessThan(70);
  });

  it('stays fast enough to run on every edit', () => {
    const t = performance.now();
    for (let i = 0; i < 5; i++) evaluate(sampleLayout());
    expect((performance.now() - t) / 5).toBeLessThan(100);
  });
});
