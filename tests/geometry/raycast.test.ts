import { describe, expect, it } from 'vitest';
import {
  angleBetween,
  pointPolygonDistance,
  polygonDistance,
  polygonsOverlap,
  rayPolygon,
  raySegment,
  segmentHitsPolygon,
  segmentsIntersect,
} from '../../src/geometry/raycast';

const square = (x: number, y: number, s: number) => [
  { x, y }, { x: x + s, y }, { x: x + s, y: y + s }, { x, y: y + s },
];

describe('raySegment / rayPolygon', () => {
  it('measures the distance to a segment the ray crosses', () => {
    expect(raySegment({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 10, y: -5 }, { x: 10, y: 5 })).toBeCloseTo(10);
  });

  it('returns null when the segment is behind or beside the ray', () => {
    expect(raySegment({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: -10, y: -5 }, { x: -10, y: 5 })).toBeNull();
    expect(raySegment({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 10, y: 1 }, { x: 10, y: 5 })).toBeNull();
  });

  it('finds the nearest edge of a polygon', () => {
    expect(rayPolygon({ x: 0, y: 5 }, { x: 1, y: 0 }, square(20, 0, 10))).toBeCloseTo(20);
  });
});

describe('segment and polygon tests', () => {
  it('detects crossing segments', () => {
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 })).toBe(true);
    expect(segmentsIntersect({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 5 }, { x: 10, y: 5 })).toBe(false);
  });

  it('detects a segment passing through a box', () => {
    expect(segmentHitsPolygon({ x: 0, y: 15 }, { x: 50, y: 15 }, square(20, 10, 10))).toBe(true);
    expect(segmentHitsPolygon({ x: 0, y: 0 }, { x: 50, y: 0 }, square(20, 10, 10))).toBe(false);
  });

  it('measures gaps between polygons', () => {
    expect(polygonDistance(square(0, 0, 10), square(25, 0, 10))).toBeCloseTo(15);
    expect(polygonsOverlap(square(0, 0, 10), square(5, 5, 10))).toBe(true);
    expect(pointPolygonDistance({ x: 5, y: 5 }, square(0, 0, 10))).toBe(0);
  });

  it('measures angles between vectors', () => {
    expect(angleBetween({ x: 1, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(90);
    expect(angleBetween({ x: 1, y: 0 }, { x: -1, y: 0 })).toBeCloseTo(180);
  });
});
