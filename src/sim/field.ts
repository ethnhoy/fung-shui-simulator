/**
 * Helpers for reading the velocity field at any point, not just cell centres.
 */
import type { Point } from '../model/types';
import type { RasterGrid } from './types';

/**
 * Bilinear interpolation: blend the four surrounding cell centres, weighted by
 * how close the point is to each. Gives smooth particle motion instead of
 * jumping from cell to cell. Returns velocity in lattice units (cells per step).
 */
export function sampleVelocity(grid: RasterGrid, ux: Float32Array, uy: Float32Array, p: Point): Point {
  const gx = (p.x - grid.originX) / grid.cellCm - 0.5;
  const gy = (p.y - grid.originY) / grid.cellCm - 0.5;
  const i0 = Math.floor(gx);
  const j0 = Math.floor(gy);
  const fx = gx - i0;
  const fy = gy - j0;
  let vx = 0;
  let vy = 0;
  for (let dj = 0; dj <= 1; dj++) {
    for (let di = 0; di <= 1; di++) {
      const i = i0 + di;
      const j = j0 + dj;
      if (i < 0 || j < 0 || i >= grid.nx || j >= grid.ny) continue;
      const w = (di ? fx : 1 - fx) * (dj ? fy : 1 - fy);
      const k = j * grid.nx + i;
      vx += w * ux[k];
      vy += w * uy[k];
    }
  }
  return { x: vx, y: vy };
}
