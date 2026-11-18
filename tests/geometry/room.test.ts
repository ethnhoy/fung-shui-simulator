import { describe, expect, it } from 'vitest';
import {
  clampOpeningOffset,
  nearestWallPoint,
  offsetPolygon,
  pointInPolygon,
  polygonArea,
  roomPolygon,
  roomWalls,
} from '../../src/geometry/room';
import type { Corner, Room } from '../../src/model/types';

const rect: Room = { shape: 'rectangle', width: 400, depth: 300, wallThickness: 15, notch: { corner: 'top-right', width: 100, depth: 100 } };
const lshape = (corner: Corner): Room => ({ ...rect, shape: 'lshape', notch: { corner, width: 100, depth: 80 } });

describe('roomPolygon', () => {
  it('returns the four corners of a rectangle, clockwise from the top-left', () => {
    expect(roomPolygon(rect)).toEqual([
      { x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 },
    ]);
  });

  it.each<Corner>(['top-left', 'top-right', 'bottom-right', 'bottom-left'])(
    'builds a 6-sided clockwise L-shape with the %s corner removed',
    (corner) => {
      const poly = roomPolygon(lshape(corner));
      expect(poly).toHaveLength(6);
      // Area = full rectangle minus the notch; positive means clockwise on screen.
      expect(polygonArea(poly)).toBeCloseTo(400 * 300 - 100 * 80);
      // Wall 0 is always a top wall (horizontal, at y = 0).
      expect(poly[0].y).toBe(0);
      expect(poly[1].y).toBe(0);
    },
  );
});

describe('roomWalls', () => {
  it('gives every wall an inward normal that points into the room', () => {
    for (const room of [rect, lshape('top-left'), lshape('bottom-right')]) {
      const poly = roomPolygon(room);
      for (const w of roomWalls(room)) {
        const mid = { x: (w.start.x + w.end.x) / 2, y: (w.start.y + w.end.y) / 2 };
        const justInside = { x: mid.x + w.inward.x * 1, y: mid.y + w.inward.y * 1 };
        expect(pointInPolygon(justInside, poly)).toBe(true);
      }
    }
  });

  it('measures wall lengths', () => {
    expect(roomWalls(rect).map((w) => w.length)).toEqual([400, 300, 400, 300]);
  });
});

describe('offsetPolygon', () => {
  it('grows a rectangle outward by the given distance on every side', () => {
    expect(offsetPolygon(roomPolygon(rect), 10)).toEqual([
      { x: -10, y: -10 }, { x: 410, y: -10 }, { x: 410, y: 310 }, { x: -10, y: 310 },
    ]);
  });

  it('moves the inner corner of an L-shape into the notch', () => {
    const out = offsetPolygon(roomPolygon(lshape('top-right')), 10);
    // The concave corner at (300, 80) moves diagonally into the notch.
    expect(out).toContainEqual({ x: 310, y: 70 });
  });
});

describe('nearestWallPoint', () => {
  it('finds the closest wall and the distance along it', () => {
    const hit = nearestWallPoint(roomWalls(rect), { x: 395, y: 120 });
    expect(hit.wallIndex).toBe(1); // right wall
    expect(hit.offset).toBeCloseTo(120);
    expect(hit.distance).toBeCloseTo(5);
  });
});

describe('clampOpeningOffset', () => {
  it('keeps an opening entirely on its wall', () => {
    const wall = roomWalls(rect)[0];
    expect(clampOpeningOffset(wall, 80, 10)).toBe(40);
    expect(clampOpeningOffset(wall, 80, 399)).toBe(360);
    expect(clampOpeningOffset(wall, 80, 200)).toBe(200);
  });
});
