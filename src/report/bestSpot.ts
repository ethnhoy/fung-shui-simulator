/**
 * "Best spot" heatmap: while you drag the bed (or desk), shade the floor by
 * the score the item would get if you dropped it there.
 *
 * It uses only the rules that depend on that item's position, not the
 * simulation, so each candidate takes well under a millisecond. Even so,
 * a few hundred candidates would freeze the page for a moment, so the
 * runner spreads the work over several animation frames.
 */
import { rectCorners } from '../geometry/rect';
import { pointInPoly, polygonsOverlap } from '../geometry/raycast';
import { updateFurniture } from '../model/layoutOps';
import type { Layout } from '../model/types';
import { evaluateBedPlacement, evaluateDesks } from '../rules/bed';
import { WEIGHTS } from '../rules/config';
import { buildContext } from '../rules/context';
import { mirrorsRule } from '../rules/mirrors';
import { poisonArrowsRule } from '../rules/poisonArrows';
import type { RuleResult } from '../rules/types';

export interface SpotCell {
  x: number;
  y: number;
  /** 0..100, or null if the item wouldn't fit inside the room here. */
  score: number | null;
  /** True if other furniture is in the way (still scored, so you can see what moving it would give). */
  blocked: boolean;
}

const clampScore = (results: RuleResult[], multiplier = 1) =>
  Math.max(0, Math.min(100, 100 + multiplier * results.reduce((s, r) => s + r.scoreImpact, 0)));

/**
 * Score for item `id` if its centre were at (x, y), keeping its rotation.
 * Returns null if it wouldn't fit inside the room there.
 */
export function positionScore(layout: Layout, id: string, x: number, y: number): { score: number; blocked: boolean } | null {
  const item = layout.furniture.find((f) => f.id === id);
  if (!item) return null;
  const moved = updateFurniture(layout, id, { x, y });
  const ctx = buildContext(moved);
  const corners = rectCorners({ ...item, x, y, width: item.width - 2, depth: item.depth - 2 });
  if (!corners.every((c) => pointInPoly(c, ctx.poly))) return null;
  // Nightstands travel with the bed, so they don't count as "in the way" of it.
  const inTheWay = (type: string) => !(item.type === 'bed' && type === 'nightstand');
  const blocked = ctx.obstacles.some((o) => o.f.id !== id && inTheWay(o.f.type) && polygonsOverlap(o.poly, corners));
  return { score: scoreAt(ctx, item.type, id), blocked };
}

function scoreAt(ctx: ReturnType<typeof buildContext>, type: string, id: string): number {
  if (type === 'desk') {
    // Desk results are half weight (−5/−10), so stretch them to use the full colour range.
    return clampScore(evaluateDesks(ctx).filter((r) => r.id.includes(id)), 4);
  }
  // Bed: the three categories that depend on where the bed is, weighted like the real score.
  const parts = [
    { w: WEIGHTS.bed, s: clampScore(evaluateBedPlacement(ctx)) },
    { w: WEIGHTS.arrows, s: clampScore(poisonArrowsRule(ctx)) },
    { w: WEIGHTS.mirrors, s: clampScore(mirrorsRule(ctx)) },
  ];
  const total = parts.reduce((s, p) => s + p.w, 0);
  return Math.round(parts.reduce((s, p) => s + p.s * p.w, 0) / total);
}

/** All candidate centres on a grid of `step` cm inside the room's bounding box. */
export function candidateCells(layout: Layout, step: number): SpotCell[] {
  const cells: SpotCell[] = [];
  for (let y = step / 2; y < layout.room.depth; y += step) {
    for (let x = step / 2; x < layout.room.width; x += step) cells.push({ x, y, score: null, blocked: false });
  }
  return cells;
}

/** Compute the whole grid at once (used by tests; the app uses BestSpotRunner). */
export function bestSpotGrid(layout: Layout, id: string, step = 20): SpotCell[] {
  return candidateCells(layout, step).map((c) => {
    const r = positionScore(layout, id, c.x, c.y);
    return { ...c, score: r?.score ?? null, blocked: r?.blocked ?? false };
  });
}

/**
 * Computes the grid a chunk at a time (about 8 ms per animation frame),
 * calling onProgress after each chunk so the heatmap fills in smoothly.
 */
export class BestSpotRunner {
  private raf = 0;

  start(layout: Layout, id: string, step: number, onProgress: (cells: SpotCell[], done: boolean) => void): void {
    this.stop();
    const cells = candidateCells(layout, step);
    let next = 0;
    const work = () => {
      const deadline = performance.now() + 8;
      while (next < cells.length && performance.now() < deadline) {
        const r = positionScore(layout, id, cells[next].x, cells[next].y);
        cells[next].score = r?.score ?? null;
        cells[next].blocked = r?.blocked ?? false;
        next++;
      }
      const done = next >= cells.length;
      onProgress(cells, done);
      if (!done) this.raf = requestAnimationFrame(work);
    };
    this.raf = requestAnimationFrame(work);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
  }
}
