/**
 * Rule 2: poison arrows (weight 15).
 *
 * A sharp corner sends a "cutting" line of chi out along its bisector (the
 * line splitting the corner's angle in half). If that line reaches the bed
 * (or a desk chair) it's considered harmful. Closer = worse.
 * Also: open shelves near the bed, and nightstands taller than the mattress.
 */
import { createFurniture } from '../model/catalog';
import { localToRoom, rectCorners } from '../geometry/rect';
import { polygonDistance } from '../geometry/raycast';
import { add, cross, normalize, rotate, scale, sub } from '../geometry/vec';
import { addFurniture, updateFurniture } from '../model/layoutOps';
import type { Layout, Point } from '../model/types';
import { RULES } from './config';
import type { RuleContext } from './context';
import type { RuleResult, SuggestedFix } from './types';

const C = RULES.arrows;

interface Corner {
  sourceId: string | null; // furniture id, or null for a wall corner
  name: string;
  at: Point;
  dir: Point;
}

/** Outward-pointing corners of sharp furniture, each with its bisector direction. */
function furnitureCorners(ctx: RuleContext): Corner[] {
  const out: Corner[] = [];
  for (const f of ctx.layout.furniture) {
    if (!f.sharpCorners || f.type === 'bed' || f.type === 'rug' || C.ignoreSourceTypes.includes(f.type)) continue;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      out.push({
        sourceId: f.id,
        name: f.label || f.type,
        at: localToRoom(f, { x: (sx * f.width) / 2, y: (sy * f.depth) / 2 }),
        // For a right angle the bisector is the 45° diagonal, in the item's own frame.
        dir: rotate(normalize({ x: sx, y: sy }), f.rotation),
      });
    }
  }
  return out;
}

/**
 * Wall corners that stick *into* the room (the inner corner of an L-shape).
 * On our clockwise outline those are the vertices where the walls turn left.
 */
export function protrudingWallCorners(poly: Point[]): Corner[] {
  const out: Corner[] = [];
  for (let i = 0; i < poly.length; i++) {
    const prev = poly[(i - 1 + poly.length) % poly.length];
    const v = poly[i];
    const next = poly[(i + 1) % poly.length];
    const d1 = normalize(sub(v, prev));
    const d2 = normalize(sub(next, v));
    if (cross(d1, d2) < 0) out.push({ sourceId: null, name: 'wall corner', at: v, dir: normalize(sub(d1, d2)) });
  }
  return out;
}

function plantFix(at: Point, dir: Point, distance: number): SuggestedFix {
  const p = add(at, scale(dir, Math.min(35, distance / 2)));
  return {
    label: 'Soften the corner with a plant',
    apply: (l: Layout) => addFurniture(l, createFurniture('plant', Math.round(p.x), Math.round(p.y), 'small')),
  };
}

export function poisonArrowsRule(ctx: RuleContext): RuleResult[] {
  const out: RuleResult[] = [];
  const bed = ctx.bed;
  const hasDesk = ctx.layout.furniture.some((f) => f.type === 'desk');
  const targets = new Set(ctx.layout.furniture.filter((f) => f.type === 'bed' || (hasDesk && f.type === 'chair')).map((f) => f.id));

  // Each corner aims across a cone around its bisector. Keep the worst ray per corner,
  // and the worst corner per source item, so one wardrobe gives one finding.
  interface Hit { corner: Corner; dist: number; targetId: string; hitAt: Point; dir: Point; severity: number; aim: number }
  const worstBySource = new Map<string, Hit>();
  for (const corner of [...furnitureCorners(ctx), ...protrudingWallCorners(ctx.poly)]) {
    for (let off = -C.coneHalfAngleDeg; off <= C.coneHalfAngleDeg + 1e-9; off += C.coneStepDeg) {
      const dir = rotate(corner.dir, off);
      const origin = add(corner.at, scale(dir, 0.5));
      const hit = ctx.castRay(origin, dir, C.rangeCm, corner.sourceId ? [corner.sourceId] : []);
      if (hit.kind !== 'furniture' || !targets.has(hit.id) || hit.dist < C.minDistanceCm) continue;
      // Closeness: 1 when touching, 0 at the edge of range. Aim: 1 dead centre, coneEdgeWeight at the cone's edge.
      const closeness = 1 - (hit.dist - C.minDistanceCm) / (C.rangeCm - C.minDistanceCm);
      const aim = 1 - (1 - C.coneEdgeWeight) * (Math.abs(off) / C.coneHalfAngleDeg);
      const severity = closeness * aim;
      const key = corner.sourceId ?? `wall-${corner.at.x}-${corner.at.y}`;
      const prev = worstBySource.get(key);
      if (!prev || severity > prev.severity) {
        worstBySource.set(key, { corner, dist: hit.dist, targetId: hit.id, hitAt: hit.point, dir, severity, aim });
      }
    }
  }

  for (const [key, { corner, dist, targetId, hitAt, dir, severity, aim }] of worstBySource) {
    const closeness = severity;
    // Penalty scales with how close and how directly the corner points (at least 3 points).
    const impact = Math.min(-3, Math.round(C.maxPenalty * severity));
    const target = targetId === bed?.f.id ? 'the bed' : 'the desk chair';
    const sourceFurniture = corner.sourceId ? ctx.layout.furniture.find((f) => f.id === corner.sourceId) : undefined;
    out.push({
      id: `arrows.corner.${key}`,
      category: 'arrows',
      // Close and aimed fairly directly = bad; glancing or distant = a warning.
      status: dist < C.badWithinCm && aim > 0.75 ? 'bad' : 'warn',
      scoreImpact: impact,
      message: `A sharp corner of the ${corner.name} points at ${target} (${Math.round(dist)} cm away)`,
      explanation: 'Sharp corners send out “poison arrows”, cutting lines of chi that feel aggressive when aimed at where you rest. Rotate or move the item, or soften the corner with a plant or something rounded.',
      highlight: [
        { kind: 'point', at: corner.at },
        { kind: 'ray', from: corner.at, to: hitAt },
        ...(sourceFurniture ? [{ kind: 'outline' as const, points: rectCorners(sourceFurniture) }] : []),
      ],
      fix: plantFix(corner.at, dir, dist),
      marker: { kind: 'poisonArrow', from: corner.at, to: hitAt, severity: Math.max(0, Math.min(1, closeness)) },
    });
  }

  // Open shelves near the bed.
  if (bed) {
    for (const f of ctx.layout.furniture.filter((x) => x.type === 'bookshelf')) {
      if (polygonDistance(rectCorners(f), bed.poly) > C.bookshelfNearBedCm) continue;
      out.push({
        id: `arrows.bookshelf.${f.id}`,
        category: 'arrows',
        status: 'warn',
        scoreImpact: C.bookshelfPenalty,
        message: 'Open shelves close to the bed',
        explanation: 'Each open shelf edge is like a little blade of “cutting chi”, and the busy contents keep the mind active. Closed storage is calmer next to the bed.',
        highlight: [{ kind: 'outline', points: rectCorners(f) }],
        marker: { kind: 'zone', points: rectCorners(f) },
        fix: { label: 'Swap for a closed cabinet', apply: (l) => updateFurniture(l, f.id, { type: 'cabinet', label: '' }) },
      });
    }

    // Nightstands taller than the mattress.
    for (const n of ctx.layout.furniture.filter((x) => x.type === 'nightstand')) {
      if (n.heightCm <= bed.f.heightCm + C.nightstandToleranceCm) continue;
      out.push({
        id: `arrows.nightstand.${n.id}`,
        category: 'arrows',
        status: 'warn',
        scoreImpact: C.nightstandPenalty,
        message: `A nightstand is taller than the mattress (${Math.round(n.heightCm)} vs ${Math.round(bed.f.heightCm)} cm)`,
        explanation: 'A nightstand that towers over your head when you lie down puts a hard edge near your face. Level with the mattress, or slightly lower, feels gentler.',
        highlight: [{ kind: 'outline', points: rectCorners(n) }],
        fix: { label: 'Use a lower nightstand', apply: (l) => updateFurniture(l, n.id, { heightCm: bed.f.heightCm }) },
      });
    }
  }

  if (out.length === 0) {
    out.push({
      id: 'arrows.clear',
      category: 'arrows',
      status: 'good',
      scoreImpact: 0,
      message: 'No sharp corners aim at the bed',
      explanation: 'Nothing sends “poison arrows” towards where you rest.',
      highlight: [],
    });
  }
  return out;
}
