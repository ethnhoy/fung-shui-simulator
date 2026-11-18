/**
 * The rule engine's entry point: run every rule and combine the results
 * into category scores and an overall 0–100 score.
 *
 * Each category starts at 100; each result adds its scoreImpact (usually a
 * penalty); the total is clamped to 0..100. The overall score is the
 * weighted average of the categories (weights in config.ts).
 */
import type { Layout } from '../model/types';
import type { SimStats } from '../sim/types';
import { baguaRule } from './bagua';
import { bedRule } from './bed';
import { chiFlowRule } from './chiFlow';
import { clutterRule } from './clutter';
import { CATEGORY_LABELS, SCORE_LABELS, WEIGHTS } from './config';
import { buildContext } from './context';
import { elementsRule } from './elements';
import { mirrorsRule } from './mirrors';
import { poisonArrowsRule } from './poisonArrows';
import type { CategoryId, CategoryScore, Report, RuleResult, Status } from './types';

const SEVERITY: Record<Status, number> = { bad: 0, warn: 1, info: 2, good: 3 };

export function scoreLabel(score: number): Report['label'] {
  return SCORE_LABELS.find((l) => score >= l.min)!.label;
}

export function scoreCategories(results: RuleResult[]): CategoryScore[] {
  return (Object.keys(WEIGHTS) as CategoryId[]).map((id) => {
    const total = results.filter((r) => r.category === id).reduce((s, r) => s + r.scoreImpact, 0);
    return { id, label: CATEGORY_LABELS[id], weight: WEIGHTS[id], score: Math.max(0, Math.min(100, 100 + total)) };
  });
}

export function overallScore(categories: CategoryScore[]): number {
  const weighted = categories.filter((c) => c.weight > 0);
  const totalWeight = weighted.reduce((s, c) => s + c.weight, 0);
  return Math.round(weighted.reduce((s, c) => s + c.score * c.weight, 0) / totalWeight);
}

/** Evaluate a layout. Pass sim stats (from Simulate mode) to include the flow checks. */
export function evaluate(layout: Layout, sim: SimStats | null = null): Report {
  const ctx = buildContext(layout, sim);
  const results = [
    ...bedRule(ctx),
    ...poisonArrowsRule(ctx),
    ...mirrorsRule(ctx),
    ...chiFlowRule(ctx),
    ...clutterRule(ctx),
    ...elementsRule(ctx),
    ...baguaRule(ctx),
  ];
  // Most severe first; within a severity, the biggest penalty first.
  results.sort((a, b) => SEVERITY[a.status] - SEVERITY[b.status] || a.scoreImpact - b.scoreImpact);
  const categories = scoreCategories(results);
  const overall = overallScore(categories);
  return { results, categories, overall, label: scoreLabel(overall), usedSimulation: !!sim?.settled };
}
