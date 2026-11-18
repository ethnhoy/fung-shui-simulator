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

/**
 * An always-on picture of a problem, drawn on the plan (unlike `highlight`,
 * which only shows when you click the issue). Plain data again.
 */
export type IssueMarker =
  /** Reflected light from a mirror's face: the edge it starts from, its direction and how far it reaches. */
  | { kind: 'mirrorBeam'; edge: [Point, Point]; dir: Point; length: number }
  /** A "poison arrow" from a sharp corner to what it hits; severity 0..1 (1 = very close). */
  | { kind: 'poisonArrow'; from: Point; to: Point; severity: number }
  /** The coffin line: a strip from the foot of the bed out through the door. */
  | { kind: 'coffin'; strip: Point[]; from: Point; to: Point }
  /** A shaded problem area (door swing over the bed, open shelves...). */
  | { kind: 'zone'; points: Point[] };

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
  /** Optional always-visible picture of the problem on the plan. */
  marker?: IssueMarker;
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
