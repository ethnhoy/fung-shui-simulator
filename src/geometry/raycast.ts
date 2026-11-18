/**
 * Ray casting and polygon tests used by the rule engine: "if I look from the
 * pillow towards the door, what do I hit first?", "does this sharp corner
 * point at the bed?", and so on.
 *
 * A ray is an origin point plus a unit direction; distances are in cm.
 */
import type { Point } from '../model/types';
import { add, cross, dist, dot, scale, sub } from './vec';

/** Distance along the ray to segment a–b, or null if it misses. */
export function raySegment(origin: Point, dir: Point, a: Point, b: Point): number | null {
  const edge = sub(b, a);
  const denom = cross(dir, edge);
  if (Math.abs(denom) < 1e-12) return null; // parallel
  const ao = sub(a, origin);
  const t = cross(ao, edge) / denom; // distance along the ray
  const u = cross(ao, dir) / denom; // position along the segment, 0..1
  if (t < -1e-9 || u < -1e-9 || u > 1 + 1e-9) return null;
  return Math.max(0, t);
}

/** Distance along the ray to the nearest edge of a polygon, or null. */
export function rayPolygon(origin: Point, dir: Point, poly: Point[]): number | null {
  let best: number | null = null;
  for (let i = 0; i < poly.length; i++) {
    const t = raySegment(origin, dir, poly[i], poly[(i + 1) % poly.length]);
    if (t !== null && (best === null || t < best)) best = t;
  }
  return best;
}

/** Do segments p1–p2 and q1–q2 cross (including touching)? */
export function segmentsIntersect(p1: Point, p2: Point, q1: Point, q2: Point): boolean {
  const d1 = cross(sub(q2, q1), sub(p1, q1));
  const d2 = cross(sub(q2, q1), sub(p2, q1));
  const d3 = cross(sub(p2, p1), sub(q1, p1));
  const d4 = cross(sub(p2, p1), sub(q2, p1));
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  const onSeg = (p: Point, a: Point, b: Point) =>
    Math.abs(cross(sub(b, a), sub(p, a))) < 1e-9 &&
    Math.min(a.x, b.x) - 1e-9 <= p.x && p.x <= Math.max(a.x, b.x) + 1e-9 &&
    Math.min(a.y, b.y) - 1e-9 <= p.y && p.y <= Math.max(a.y, b.y) + 1e-9;
  return onSeg(p1, q1, q2) || onSeg(p2, q1, q2) || onSeg(q1, p1, p2) || onSeg(q2, p1, p2);
}

/** Point-in-polygon for convex or concave polygons (even-odd rule). */
export function pointInPoly(p: Point, poly: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < a.x + ((p.y - a.y) / (b.y - a.y)) * (b.x - a.x)) inside = !inside;
  }
  return inside;
}

/** Does the segment a–b touch or pass through the polygon? */
export function segmentHitsPolygon(a: Point, b: Point, poly: Point[]): boolean {
  if (pointInPoly(a, poly) || pointInPoly(b, poly)) return true;
  for (let i = 0; i < poly.length; i++) {
    if (segmentsIntersect(a, b, poly[i], poly[(i + 1) % poly.length])) return true;
  }
  return false;
}

/** Shortest distance from point p to segment a–b. */
export function pointSegmentDistance(p: Point, a: Point, b: Point): number {
  const ab = sub(b, a);
  const len2 = dot(ab, ab);
  if (len2 === 0) return dist(p, a);
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / len2));
  return dist(p, add(a, scale(ab, t)));
}

/** Shortest distance from a point to a polygon's outline (0 if inside). */
export function pointPolygonDistance(p: Point, poly: Point[]): number {
  if (pointInPoly(p, poly)) return 0;
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) best = Math.min(best, pointSegmentDistance(p, poly[i], poly[(i + 1) % poly.length]));
  return best;
}

/** Do two polygons overlap or touch? */
export function polygonsOverlap(a: Point[], b: Point[]): boolean {
  for (let i = 0; i < a.length; i++) {
    for (let j = 0; j < b.length; j++) {
      if (segmentsIntersect(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length])) return true;
    }
  }
  return pointInPoly(a[0], b) || pointInPoly(b[0], a);
}

/** Shortest gap between two polygons (0 if they overlap). */
export function polygonDistance(a: Point[], b: Point[]): number {
  if (polygonsOverlap(a, b)) return 0;
  let best = Infinity;
  for (const p of a) best = Math.min(best, pointPolygonDistance(p, b));
  for (const p of b) best = Math.min(best, pointPolygonDistance(p, a));
  return best;
}

/** Angle in degrees (0..180) between two vectors. */
export function angleBetween(a: Point, b: Point): number {
  const la = Math.hypot(a.x, a.y);
  const lb = Math.hypot(b.x, b.y);
  if (la === 0 || lb === 0) return 0;
  const c = Math.max(-1, Math.min(1, dot(a, b) / (la * lb)));
  return (Math.acos(c) * 180) / Math.PI;
}
