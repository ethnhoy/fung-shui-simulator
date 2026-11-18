import { describe, expect, it } from 'vitest';
import { aabbHalfExtents, facingVector, rectCorners } from '../../src/geometry/rect';

// "+ 0" turns -0 into 0 so toEqual does not trip over the sign of zero.
const r3 = (v: number) => Math.round(v * 1000) / 1000 + 0;
const close = (p: { x: number; y: number }) => ({ x: r3(p.x), y: r3(p.y) });

describe('rectCorners', () => {
  it('returns corners of an unrotated rectangle around its centre', () => {
    expect(rectCorners({ x: 100, y: 50, width: 40, depth: 20, rotation: 0 })).toEqual([
      { x: 80, y: 40 }, { x: 120, y: 40 }, { x: 120, y: 60 }, { x: 80, y: 60 },
    ]);
  });

  it('rotates corners clockwise', () => {
    // Rotated 90° clockwise, the back-left corner (-20,-10) ends up at (+10,-20).
    const [backLeft] = rectCorners({ x: 0, y: 0, width: 40, depth: 20, rotation: 90 });
    expect(close(backLeft)).toEqual({ x: 10, y: -20 });
  });
});

describe('facingVector', () => {
  it('points down at 0°, left at 90°, up at 180°, right at 270°', () => {
    expect(close(facingVector({ rotation: 0 }))).toEqual({ x: 0, y: 1 });
    expect(close(facingVector({ rotation: 90 }))).toEqual({ x: -1, y: 0 });
    expect(close(facingVector({ rotation: 180 }))).toEqual({ x: 0, y: -1 });
    expect(close(facingVector({ rotation: 270 }))).toEqual({ x: 1, y: 0 });
  });
});

describe('aabbHalfExtents', () => {
  it('swaps width and depth at 90°', () => {
    const e = aabbHalfExtents({ width: 100, depth: 60, rotation: 90 });
    expect(e.hx).toBeCloseTo(30);
    expect(e.hy).toBeCloseTo(50);
  });
});
