/**
 * Types shared by every rule.
 */
import type { Layout, Point } from '../model/types';

export type Status = 'good' | 'warn' | 'bad' | 'info';

export type CategoryId = 'bed' | 'arrows' | 'mirrors' | 'flow' | 'clutter' | 'elements' | 'bagua';

/**
 * Shapes the report can highlight on the plan when you click an issue.
 * Plain data (no drawing code), so rules stay independent of the renderer.
 */
export type HighlightShape =
  | { kind: 'ray'; from: Point; to: Point }
  | { kind: 'outline'; points: Point[] }
  | { kind: 'point'; at: Point }
  | { kind: 'path'; points: Point[] };

/** A one-click fix: a label plus a function that returns the changed layout. */
export interface SuggestedFix {
  label: string;
  apply: (layout: Layout) => Layout;
}

export interface RuleResult {
  /** Stable id, e.g. "bed.coffin" or "arrows.corner.wardrobe-1.2". */
  id: string;
  category: CategoryId;
  status: Status;
  /**
   * Points added to (positive) or taken from (negative) this result's
   * category. Each category starts at 100 and is clamped to 0..100.
   */
  scoreImpact: number;
  /** One-line summary. */
  message: string;
  /** Why it matters, in plain language. */
  explanation: string;
  highlight: HighlightShape[];
  fix?: SuggestedFix;
}

export interface CategoryScore {
  id: CategoryId;
  label: string;
  weight: number;
  /** 0..100 */
  score: number;
}

export interface Report {
  results: RuleResult[];
  categories: CategoryScore[];
  /** Weighted overall score, 0..100. */
  overall: number;
  label: 'Harmonious' | 'Good' | 'Needs attention' | 'Unsettled';
  /** True if the sim statistics were included. */
  usedSimulation: boolean;
}
