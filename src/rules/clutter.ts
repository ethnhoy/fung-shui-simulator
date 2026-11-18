/**
 * Rule 5: clutter and clearance (weight 10).
 *
 * - How much of the floor is covered by furniture (rugs don't count).
 * - Is there a walking path at least 75 cm wide from the door to the side
 *   of the bed? Found with a breadth-first search (BFS) over a grid of
 *   cells, where a cell is walkable only if nothing is within half the
 *   path width of it (a "clearance map").
 */
import { pointInPoly, pointPolygonDistance, pointSegmentDistance } from '../geometry/raycast';
import { dist, rotate, sub } from '../geometry/vec';
import type { Point } from '../model/types';
import { RULES } from './config';
import type { RuleContext } from './context';
import type { RuleResult } from './types';

const C = RULES.clutter;

interface Grid {
  nx: number;
  ny: number;
  centre: (k: number) => Point;
  inside: Uint8Array;
}

function makeGrid(ctx: RuleContext): Grid {
  const g = C.gridCm;
  const nx = Math.ceil(ctx.layout.room.width / g);
  const ny = Math.ceil(ctx.layout.room.depth / g);
  const centre = (k: number) => ({ x: ((k % nx) + 0.5) * g, y: (Math.floor(k / nx) + 0.5) * g });
  const inside = new Uint8Array(nx * ny);
  for (let k = 0; k < inside.length; k++) inside[k] = pointInPoly(centre(k), ctx.poly) ? 1 : 0;
  return { nx, ny, centre, inside };
}

/** Fraction of the floor covered by furniture (0..1). */
export function floorCoverage(ctx: RuleContext, grid = makeGrid(ctx)): number {
  let total = 0;
  let covered = 0;
  for (let k = 0; k < grid.inside.length; k++) {
    if (!grid.inside[k]) continue;
    total++;
    const p = grid.centre(k);
    if (ctx.obstacles.some((o) => pointInPoly(p, o.poly))) covered++;
  }
  return total ? covered / total : 0;
}

/**
 * Shortest walkable path from the door to either long side of the bed,
 * as a list of points, or null if there isn't one.
 */
export function findWalkway(ctx: RuleContext, grid = makeGrid(ctx)): Point[] | null {
  const door = ctx.mainDoor;
  const bed = ctx.bed;
  if (!door || !bed) return null;
  const r = C.walkwayWidthCm / 2;
  const n = grid.inside.length;

  // Clearance map: a cell is walkable if a person-wide circle around it hits nothing.
  const walkable = new Uint8Array(n);
  for (let k = 0; k < n; k++) {
    if (!grid.inside[k]) continue;
    const p = grid.centre(k);
    // The walls right at the doorway would always block a person-wide circle, so skip
    // the door's own wall near the doorway (people walk *through* that gap).
    const nearDoor = dist(p, door.centre) < door.opening.width;
    const wallClear = ctx.walls.every((w) => (nearDoor && w.index === door.wall.index) || pointSegmentDistance(p, w.start, w.end) >= r);
    if (wallClear && ctx.obstacles.every((o) => pointPolygonDistance(p, o.poly) >= r)) walkable[k] = 1;
  }

  // Start: walkable cells just inside the door. Goal: walkable cells beside a long side of the bed.
  const f = bed.f;
  const isGoal = (p: Point) => {
    const local = rotate(sub(p, { x: f.x, y: f.y }), -f.rotation);
    return Math.abs(local.x) > f.width / 2 && Math.abs(local.x) < f.width / 2 + r + C.gridCm * 2 && Math.abs(local.y) < f.depth / 2;
  };
  const prev = new Int32Array(n).fill(-2); // -2 = unvisited, -1 = start
  const queue: number[] = [];
  for (let k = 0; k < n; k++) {
    if (walkable[k] && dist(grid.centre(k), door.centre) < door.opening.width) {
      prev[k] = -1;
      queue.push(k);
    }
  }
  // Plain BFS over 8 neighbours: like exploring a maze one ring at a time.
  for (let head = 0; head < queue.length; head++) {
    const k = queue[head];
    if (isGoal(grid.centre(k))) {
      const path: Point[] = [];
      for (let c = k; c !== -1; c = prev[c]) path.push(grid.centre(c));
      path.push(door.centre);
      return path.reverse();
    }
    const i = k % grid.nx;
    const j = Math.floor(k / grid.nx);
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const ni = i + di;
        const nj = j + dj;
        if ((di === 0 && dj === 0) || ni < 0 || nj < 0 || ni >= grid.nx || nj >= grid.ny) continue;
        const m = nj * grid.nx + ni;
        if (walkable[m] && prev[m] === -2) {
          prev[m] = k;
          queue.push(m);
        }
      }
    }
  }
  return null;
}

export function clutterRule(ctx: RuleContext): RuleResult[] {
  const out: RuleResult[] = [];
  const grid = makeGrid(ctx);
  const coverage = floorCoverage(ctx, grid);
  const pct = Math.round(coverage * 100);

  if (coverage > C.coverageBad) {
    out.push({
      id: 'clutter.coverage', category: 'clutter', status: 'bad', scoreImpact: C.coverageBadPenalty,
      message: `Furniture covers ${pct}% of the floor`,
      explanation: 'A crowded room traps chi and feels heavy. Aim for under about 55%: remove or downsize a piece or two.',
      highlight: [],
    });
  } else if (coverage > C.coverageWarn) {
    out.push({
      id: 'clutter.coverage', category: 'clutter', status: 'warn', scoreImpact: C.coverageWarnPenalty,
      message: `Furniture covers ${pct}% of the floor`,
      explanation: 'The room is getting full. Open floor lets chi (and you) move freely.',
      highlight: [],
    });
  } else {
    out.push({
      id: 'clutter.coverage', category: 'clutter', status: 'good', scoreImpact: 0,
      message: `Plenty of open floor (furniture covers ${pct}%)`,
      explanation: 'Open space lets chi circulate.',
      highlight: [],
    });
  }

  if (ctx.mainDoor && ctx.bed) {
    const path = findWalkway(ctx, grid);
    if (path) {
      out.push({
        id: 'clutter.walkway', category: 'clutter', status: 'good', scoreImpact: 0,
        message: `Clear ${C.walkwayWidthCm} cm path from the door to the bed`,
        explanation: 'You can walk to the bed without squeezing past furniture, and chi can follow the same path.',
        highlight: [{ kind: 'path', points: path }],
      });
    } else {
      out.push({
        id: 'clutter.walkway', category: 'clutter', status: 'bad', scoreImpact: C.noWalkwayPenalty,
        message: `No ${C.walkwayWidthCm} cm wide path from the door to the bed`,
        explanation: 'Furniture squeezes the route from the door to the bed. A clear path matters both for daily life and for chi to reach you.',
        highlight: [
          { kind: 'outline', points: ctx.bed.poly },
          { kind: 'ray', from: ctx.mainDoor.a, to: ctx.mainDoor.b },
        ],
      });
    }
  }

  out.push({
    id: 'clutter.underBed', category: 'clutter', status: 'info', scoreImpact: 0,
    message: 'Tip: keep the space under the bed clear',
    explanation: 'Storage under the bed is said to block chi around you while you sleep. We can’t see under the bed in 2D, so this is a general tip.',
    highlight: ctx.bed ? [{ kind: 'outline', points: ctx.bed.poly }] : [],
  });
  return out;
}
