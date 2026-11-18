/**
 * Geometry of furniture: each item is a rotated rectangle described by its
 * centre, width, depth and rotation.
 */
import type { Furniture, Point } from '../model/types';
import { add, degToRad, rotate } from './vec';

type RectLike = Pick<Furniture, 'x' | 'y' | 'width' | 'depth' | 'rotation'>;

/** Convert a point from the item's own coordinates (centre = 0,0) to room coordinates. */
export function localToRoom(f: RectLike, local: Point): Point {
  return add({ x: f.x, y: f.y }, rotate(local, f.rotation));
}

/** The four corners in clockwise order: back-left, back-right, front-right, front-left. */
export function rectCorners(f: RectLike): Point[] {
  const hw = f.width / 2;
  const hd = f.depth / 2;
  return [
    { x: -hw, y: -hd },
    { x: hw, y: -hd },
    { x: hw, y: hd },
    { x: -hw, y: hd },
  ].map((p) => localToRoom(f, p));
}

/**
 * Unit vector the item's front faces. At rotation 0 that's straight down (+y).
 * For a bed this is the direction a person lying in it looks.
 */
export function facingVector(f: Pick<Furniture, 'rotation'>): Point {
  return rotate({ x: 0, y: 1 }, f.rotation);
}

/**
 * Half-size of the axis-aligned box that contains the rotated rectangle.
 * E.g. a 100×60 wardrobe rotated 90° occupies 60 across and 100 down.
 */
export function aabbHalfExtents(f: Pick<Furniture, 'width' | 'depth' | 'rotation'>): { hx: number; hy: number } {
  const r = degToRad(f.rotation);
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  return {
    hx: (f.width / 2) * c + (f.depth / 2) * s,
    hy: (f.width / 2) * s + (f.depth / 2) * c,
  };
}
