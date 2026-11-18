/**
 * Rule 7: the bagua map (information only, weight 0 in v1).
 *
 * Western (BTB) method: stretch a 3×3 grid over the room with the bottom
 * row along the main-entrance wall. Each of the nine areas relates to a
 * life theme. We list what sits in each area and give light tips.
 */
import { displayName } from '../model/catalog';
import { pointInPoly } from '../geometry/raycast';
import { add, dot, rotate, scale } from '../geometry/vec';
import type { Layout, Point } from '../model/types';
import { roomWalls } from '../geometry/room';
import type { RuleContext } from './context';
import type { RuleResult } from './types';

/** Zone names by [row][column], row 0 = nearest the entrance, column 0 = left (looking in). */
export const BAGUA_NAMES = [
  ['Knowledge', 'Career', 'Helpful People & Travel'],
  ['Family', 'Health', 'Children & Creativity'],
  ['Wealth', 'Fame', 'Relationships'],
] as const;

const TIPS: Record<string, string> = {
  Wealth: 'Healthy plants or something in purple or gold here are said to invite abundance.',
  Fame: 'Good light or a touch of red here supports how others see you.',
  Relationships: 'Pairs (two nightstands, two lamps) here support partnership.',
  Family: 'Wood and living plants here support family harmony.',
  Health: 'Keep the centre of the room open and uncluttered.',
  'Children & Creativity': 'Something playful or handmade suits this area.',
  Knowledge: 'A quiet spot for books or reflection suits this area.',
  Career: 'Flowing shapes or a touch of Water here support your path.',
  'Helpful People & Travel': 'Metal objects or keepsakes from travel suit this area.',
};

export interface BaguaZone {
  name: string;
  row: number;
  col: number;
  polygon: Point[];
  /** Fraction of the zone that's actually inside the room (L-shapes have missing areas). */
  insideFraction: number;
}

/** The nine zones as polygons in room coordinates (for the overlay and the report). */
export function baguaZones(layout: Layout): BaguaZone[] {
  const walls = roomWalls(layout.room);
  const main = layout.openings.find((o) => o.kind === 'door' && o.isMainEntrance);
  // "Forward" = looking into the room from the entrance. Without a door, assume the bottom wall.
  const fwd = main ? walls[main.wallIndex].inward : { x: 0, y: -1 };
  const right = rotate(fwd, 90);
  const { width: W, depth: D } = layout.room;
  const corners = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: D }, { x: 0, y: D }];
  const rs = corners.map((c) => dot(c, right));
  const fs = corners.map((c) => dot(c, fwd));
  const r0 = Math.min(...rs), r1 = Math.max(...rs);
  const f0 = Math.min(...fs), f1 = Math.max(...fs);
  const toRoom = (r: number, f: number) => add(scale(right, r), scale(fwd, f));
  const poly = layout.room.shape === 'rectangle' ? null : walls.map((w) => w.start);

  const zones: BaguaZone[] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const ra = r0 + ((r1 - r0) * col) / 3, rb = r0 + ((r1 - r0) * (col + 1)) / 3;
      const fa = f0 + ((f1 - f0) * row) / 3, fb = f0 + ((f1 - f0) * (row + 1)) / 3;
      // Sample a 6×6 grid of points to see how much of this zone is real floor.
      let inside = 0;
      for (let i = 0; i < 6; i++) {
        for (let j = 0; j < 6; j++) {
          const p = toRoom(ra + ((rb - ra) * (i + 0.5)) / 6, fa + ((fb - fa) * (j + 0.5)) / 6);
          if (!poly || pointInPoly(p, poly)) inside++;
        }
      }
      zones.push({
        name: BAGUA_NAMES[row][col],
        row,
        col,
        polygon: [toRoom(ra, fa), toRoom(rb, fa), toRoom(rb, fb), toRoom(ra, fb)],
        insideFraction: inside / 36,
      });
    }
  }
  return zones;
}

export function baguaRule(ctx: RuleContext): RuleResult[] {
  const out: RuleResult[] = [];
  for (const z of baguaZones(ctx.layout)) {
    const outline = { kind: 'outline' as const, points: z.polygon };
    if (z.insideFraction < 0.5) {
      out.push({
        id: `bagua.missing.${z.name}`, category: 'bagua', status: 'info', scoreImpact: 0,
        message: `The ${z.name} area is missing (the L-shape cuts it off)`,
        explanation: 'In Western feng shui a missing area is “completed” symbolically: hang a mirror on the adjoining wall or place a plant at the inside corner.',
        highlight: [outline],
      });
      continue;
    }
    const items = ctx.layout.furniture.filter((f) => pointInPoly({ x: f.x, y: f.y }, z.polygon));
    const names = items.map(displayName);
    const pairs = z.name === 'Relationships' && items.some((a) => items.filter((b) => b.type === a.type).length >= 2);
    out.push({
      id: `bagua.zone.${z.name}`, category: 'bagua', status: pairs ? 'good' : 'info', scoreImpact: 0,
      message: `${z.name}: ${names.length ? names.join(', ') : 'empty'}`,
      explanation: pairs ? 'Pairs of items here support partnership. Nice.' : TIPS[z.name],
      highlight: [outline, ...items.map((f) => ({ kind: 'point' as const, at: { x: f.x, y: f.y } }))],
    });
  }
  return out;
}
