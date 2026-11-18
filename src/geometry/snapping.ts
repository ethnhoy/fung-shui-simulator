/**
 * Snapping rules used while dragging furniture.
 *
 * 1. Grid snap: round the centre to a 5 cm grid so numbers stay tidy.
 * 2. Wall snap: if an edge of the item is within a few cm of a wall,
 *    pull it flush against the wall (furniture usually sits against walls).
 * 3. Keep the item inside the room's bounding box.
 *
 * All v1 rooms have only horizontal and vertical walls, so we work with the
 * item's axis-aligned bounding box, which is exact for 0/90/180/270° rotations.
 */
import type { Furniture, Point } from '../model/types';
import { aabbHalfExtents } from './rect';
import type { Wall } from './room';
import { clamp, roundTo } from './vec';

export const SNAP = {
  gridCm: 5,
  /** How close (cm) an edge must be to a wall before it snaps flush. */
  wallThresholdCm: 15,
  rotationStepDeg: 15,
};

type RectLike = Pick<Furniture, 'width' | 'depth' | 'rotation'>;

export function snapFurniturePosition(
  item: RectLike,
  proposed: Point,
  walls: Wall[],
  bounds: { width: number; depth: number },
): Point {
  const { hx, hy } = aabbHalfExtents(item);
  let x = roundTo(proposed.x, SNAP.gridCm);
  let y = roundTo(proposed.y, SNAP.gridCm);

  let bestDx = Infinity;
  let bestDy = Infinity;
  let snapX: number | null = null;
  let snapY: number | null = null;

  for (const w of walls) {
    const vertical = Math.abs(w.dir.x) < 1e-6;
    if (vertical) {
      // Only consider the wall if the item overlaps it vertically.
      const top = Math.min(w.start.y, w.end.y);
      const bottom = Math.max(w.start.y, w.end.y);
      if (proposed.y + hy <= top || proposed.y - hy >= bottom) continue;
      const wallX = w.start.x;
      // inward.x > 0 means the room is to the right of this wall, so the
      // item's *left* edge is the one that should touch it.
      const target = w.inward.x > 0 ? wallX + hx : wallX - hx;
      const d = Math.abs(proposed.x - target);
      if (d < SNAP.wallThresholdCm && d < bestDx) {
        bestDx = d;
        snapX = target;
      }
    } else {
      const left = Math.min(w.start.x, w.end.x);
      const right = Math.max(w.start.x, w.end.x);
      if (proposed.x + hx <= left || proposed.x - hx >= right) continue;
      const wallY = w.start.y;
      const target = w.inward.y > 0 ? wallY + hy : wallY - hy;
      const d = Math.abs(proposed.y - target);
      if (d < SNAP.wallThresholdCm && d < bestDy) {
        bestDy = d;
        snapY = target;
      }
    }
  }
  if (snapX !== null) x = snapX;
  if (snapY !== null) y = snapY;

  // Keep the item inside the room's bounding box (if it fits at all).
  if (hx * 2 <= bounds.width) x = clamp(x, hx, bounds.width - hx);
  if (hy * 2 <= bounds.depth) y = clamp(y, hy, bounds.depth - hy);
  return { x, y };
}
