/**
 * Room geometry: turns the room's parameters (rectangle or L-shape) into a
 * wall polygon, and answers questions like "which wall is nearest this point?".
 */
import type { Corner, Opening, Point, Room } from '../model/types';
import { add, clamp, cross, dot, length, normalize, radToDeg, scale, sub } from './vec';

export interface Wall {
  index: number;
  start: Point;
  end: Point;
  /** Unit vector from start to end. */
  dir: Point;
  /** Unit vector pointing into the room. */
  inward: Point;
  length: number;
  /** Angle of `dir` in degrees (0 = pointing right), used to rotate drawings. */
  angle: number;
}

/**
 * The room's interior outline, clockwise on screen, starting at the top wall.
 * For an L-shape we take the four rectangle corners and replace the notched
 * corner with three points that walk around the cut-out.
 */
export function roomPolygon(room: Room): Point[] {
  const W = room.width;
  const H = room.depth;
  if (room.shape === 'rectangle') {
    return [
      { x: 0, y: 0 },
      { x: W, y: 0 },
      { x: W, y: H },
      { x: 0, y: H },
    ];
  }
  const nw = room.notch.width;
  const nd = room.notch.depth;
  // Each corner's replacement points, listed in clockwise walking order.
  const replacements: Record<Corner, Point[]> = {
    'top-left': [{ x: 0, y: nd }, { x: nw, y: nd }, { x: nw, y: 0 }],
    'top-right': [{ x: W - nw, y: 0 }, { x: W - nw, y: nd }, { x: W, y: nd }],
    'bottom-right': [{ x: W, y: H - nd }, { x: W - nw, y: H - nd }, { x: W - nw, y: H }],
    'bottom-left': [{ x: nw, y: H }, { x: nw, y: H - nd }, { x: 0, y: H - nd }],
  };
  const corners: [Corner, Point][] = [
    ['top-left', { x: 0, y: 0 }],
    ['top-right', { x: W, y: 0 }],
    ['bottom-right', { x: W, y: H }],
    ['bottom-left', { x: 0, y: H }],
  ];
  const pts: Point[] = [];
  for (const [name, p] of corners) {
    if (name === room.notch.corner) pts.push(...replacements[name]);
    else pts.push(p);
  }
  // A notch at the top-left starts with its vertical points; rotate the list
  // so wall 0 is always a top (horizontal, y = min) wall for consistency.
  if (room.notch.corner === 'top-left') {
    // pts = [(0,nd), (nw,nd), (nw,0), (W,0), ...]  ->  start at (nw,0)
    return [...pts.slice(2), ...pts.slice(0, 2)];
  }
  return pts;
}

/** Build Wall objects for each polygon edge. */
export function roomWalls(room: Room): Wall[] {
  const poly = roomPolygon(room);
  return poly.map((start, i) => {
    const end = poly[(i + 1) % poly.length];
    const d = sub(end, start);
    const dir = normalize(d);
    return {
      index: i,
      start,
      end,
      dir,
      // For a clockwise polygon in y-down coordinates, rotating the wall
      // direction 90° clockwise gives a vector pointing into the room.
      inward: { x: -dir.y, y: dir.x },
      length: length(d),
      angle: radToDeg(Math.atan2(dir.y, dir.x)),
    };
  });
}

/** Signed area via the shoelace formula. Positive = clockwise on screen. */
export function polygonArea(poly: Point[]): number {
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    sum += cross(poly[i], poly[(i + 1) % poly.length]);
  }
  return sum / 2;
}

/** Ray-casting point-in-polygon test (counts edge crossings to the right). */
export function pointInPolygon(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y) {
      const xCross = a.x + ((p.y - a.y) / (b.y - a.y)) * (b.x - a.x);
      if (p.x < xCross) inside = !inside;
    }
  }
  return inside;
}

/**
 * Offset a clockwise polygon outward by `d` (used to draw the outside face
 * of the walls). Each edge is pushed outward, then neighbouring edges are
 * intersected to find the new corners ("mitred" corners).
 */
export function offsetPolygon(poly: Point[], d: number): Point[] {
  const n = poly.length;
  const lines = poly.map((a, i) => {
    const b = poly[(i + 1) % n];
    const dir = normalize(sub(b, a));
    const outward = { x: dir.y, y: -dir.x };
    return { p: add(a, scale(outward, d)), dir };
  });
  return lines.map((cur, i) => {
    const prev = lines[(i - 1 + n) % n];
    // Solve prev.p + t*prev.dir = cur.p + s*cur.dir for t.
    const denom = cross(prev.dir, cur.dir);
    if (Math.abs(denom) < 1e-9) return cur.p; // parallel edges, just use the point
    const t = cross(sub(cur.p, prev.p), cur.dir) / denom;
    return add(prev.p, scale(prev.dir, t));
  });
}

export interface WallHit {
  wallIndex: number;
  /** Distance along the wall from its start (cm). */
  offset: number;
  /** Distance from the query point to the wall (cm). */
  distance: number;
  point: Point;
}

/** Find the closest point on any wall to `p`. */
export function nearestWallPoint(walls: Wall[], p: Point): WallHit {
  let best: WallHit | null = null;
  for (const w of walls) {
    const t = clamp(dot(sub(p, w.start), w.dir), 0, w.length);
    const point = add(w.start, scale(w.dir, t));
    const distance = length(sub(p, point));
    if (!best || distance < best.distance) best = { wallIndex: w.index, offset: t, distance, point };
  }
  return best!;
}

/** Centre point of an opening in room coordinates. */
export function openingCenter(walls: Wall[], o: Opening): Point {
  const w = walls[o.wallIndex] ?? walls[0];
  return add(w.start, scale(w.dir, o.offset));
}

/** Keep an opening fully on its wall: its centre must be at least half its width from either end. */
export function clampOpeningOffset(wall: Wall, width: number, offset: number): number {
  const half = Math.min(width / 2, wall.length / 2);
  return clamp(offset, half, wall.length - half);
}

/**
 * A point guaranteed to be inside the room, used to place new furniture.
 * For an L-shape the bounding-box centre may fall in the notch, so we use
 * the centre of the full-height strip beside the notch instead.
 */
export function roomInteriorPoint(room: Room): Point {
  if (room.shape === 'rectangle') return { x: room.width / 2, y: room.depth / 2 };
  const notchOnRight = room.notch.corner.endsWith('right');
  const x0 = notchOnRight ? 0 : room.notch.width;
  const x1 = notchOnRight ? room.width - room.notch.width : room.width;
  return { x: (x0 + x1) / 2, y: room.depth / 2 };
}
