/**
 * RuleContext: geometry that several rules need, worked out once per
 * evaluation (walls, the bed's key points, the main door, obstacle shapes)
 * plus a shared ray caster.
 */
import { rectCorners, facingVector, localToRoom } from '../geometry/rect';
import { rayPolygon, raySegment } from '../geometry/raycast';
import { roomPolygon, roomWalls, type Wall } from '../geometry/room';
import { add, scale } from '../geometry/vec';
import type { Furniture, Layout, Opening, Point } from '../model/types';
import type { SimStats } from '../sim/types';
import { RULES } from './config';

export interface Obstacle {
  f: Furniture;
  poly: Point[];
}

export interface DoorGeometry {
  opening: Opening;
  wall: Wall;
  centre: Point;
  /** The two ends of the doorway. */
  a: Point;
  b: Point;
  /** Hinge end (for the swing arc). */
  hinge: Point;
}

export interface BedGeometry {
  f: Furniture;
  poly: Point[];
  /** Where the sleeper's head is. */
  pillow: Point;
  headCentre: Point;
  footCentre: Point;
  /** Direction the sleeper faces (towards the foot). */
  facing: Point;
}

export type RayHit =
  | { kind: 'furniture'; id: string; dist: number; point: Point }
  | { kind: 'wall'; wallIndex: number; dist: number; point: Point }
  | { kind: 'none'; dist: number; point: Point };

export interface RuleContext {
  layout: Layout;
  sim: SimStats | null;
  poly: Point[];
  walls: Wall[];
  /** All furniture except rugs (things that take up space). */
  obstacles: Obstacle[];
  mainDoor: DoorGeometry | null;
  bed: BedGeometry | null;
  /** First thing a ray hits: furniture (except `ignore` ids) or a wall. */
  castRay: (origin: Point, dir: Point, maxDist: number, ignore?: string[]) => RayHit;
}

export function doorGeometry(walls: Wall[], o: Opening): DoorGeometry {
  const wall = walls[o.wallIndex] ?? walls[0];
  const at = (t: number) => add(wall.start, scale(wall.dir, t));
  const a = at(o.offset - o.width / 2);
  const b = at(o.offset + o.width / 2);
  return { opening: o, wall, centre: at(o.offset), a, b, hinge: o.hinge === 'start' ? a : b };
}

export function bedGeometry(f: Furniture): BedGeometry {
  return {
    f,
    poly: rectCorners(f),
    pillow: localToRoom(f, { x: 0, y: -f.depth / 2 + RULES.bed.pillowInsetCm }),
    headCentre: localToRoom(f, { x: 0, y: -f.depth / 2 }),
    footCentre: localToRoom(f, { x: 0, y: f.depth / 2 }),
    facing: facingVector(f),
  };
}

/** Pick "the" bed: the largest one if there are several. */
export function primaryBed(layout: Layout): Furniture | undefined {
  return [...layout.furniture].filter((f) => f.type === 'bed').sort((a, b) => b.width * b.depth - a.width * a.depth)[0];
}

export function buildContext(layout: Layout, sim: SimStats | null = null): RuleContext {
  const poly = roomPolygon(layout.room);
  const walls = roomWalls(layout.room);
  const obstacles = layout.furniture.filter((f) => f.type !== 'rug').map((f) => ({ f, poly: rectCorners(f) }));
  const main = layout.openings.find((o) => o.kind === 'door' && o.isMainEntrance);
  const bed = primaryBed(layout);

  const castRay = (origin: Point, dir: Point, maxDist: number, ignore: string[] = []): RayHit => {
    let best: RayHit = { kind: 'none', dist: maxDist, point: add(origin, scale(dir, maxDist)) };
    for (const o of obstacles) {
      if (ignore.includes(o.f.id)) continue;
      const t = rayPolygon(origin, dir, o.poly);
      if (t !== null && t < best.dist) best = { kind: 'furniture', id: o.f.id, dist: t, point: add(origin, scale(dir, t)) };
    }
    for (const w of walls) {
      const t = raySegment(origin, dir, w.start, w.end);
      // Ignore a wall the ray starts on (e.g. a mirror or door sitting on it).
      if (t !== null && t > 0.5 && t < best.dist) best = { kind: 'wall', wallIndex: w.index, dist: t, point: add(origin, scale(dir, t)) };
    }
    return best;
  };

  return {
    layout,
    sim,
    poly,
    walls,
    obstacles,
    mainDoor: main ? doorGeometry(walls, main) : null,
    bed: bed ? bedGeometry(bed) : null,
    castRay,
  };
}
