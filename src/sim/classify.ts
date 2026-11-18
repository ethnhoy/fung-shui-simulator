/**
 * Turns the raw velocity field into feng shui terms:
 *   sha chi   = rushing   (fast)
 *   sheng chi = healthy   (gentle, meandering)
 *   si chi    = stagnant  (barely moving)
 * and summarises it into the statistics the rule engine uses.
 */
import { dist } from '../geometry/vec';
import { CHI, SIM } from '../rules/config';
import type { ChiClass, ClassMix, RasterGrid, SimStats, StagnantRegion } from './types';

/** Numeric codes for the class grid (0 = not floor). */
export const CLASS_CODE = { none: 0, sha: 1, sheng: 2, si: 3 } as const;

export function classifySpeed(speed: number, inletSpeed: number = SIM.inletSpeed): ChiClass {
  if (speed > CHI.shaAbove * inletSpeed) return 'sha';
  if (speed < CHI.siBelow * inletSpeed) return 'si';
  return 'sheng';
}

/**
 * The "chi field": how much chi is present in each floor cell.
 *
 * Moving air carries chi, and chi also spreads gently into the space around
 * it, fading with distance and stopped by walls and furniture. We start
 * from each cell's flow speed and repeatedly let every cell take a slightly
 * faded average of its neighbours, keeping whichever is larger:
 *
 *     chi[k] = max(speed[k], α · average(chi of neighbouring floor cells))
 *
 * Repeating this (Gauss–Seidel iteration) until nothing changes gives a
 * smooth halo around the flow. α is chosen so the halo halves every
 * CHI.spreadHalfDistanceCm, whatever the cell size.
 */
export function chiField(grid: RasterGrid, ux: Float32Array, uy: Float32Array, halfDistanceCm: number = CHI.spreadHalfDistanceCm): Float32Array {
  const { nx, ny, floor } = grid;
  const n = nx * ny;
  const speed = new Float32Array(n);
  const chi = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    if (!floor[k]) continue;
    speed[k] = Math.hypot(ux[k], uy[k]);
    chi[k] = speed[k];
  }
  if (halfDistanceCm <= 0) return chi;

  // Per-cell fade r (0.5 per half-distance), turned into the averaging factor α.
  // (For a 1D profile chi ∝ rⁱ, the update rule above requires r + 1/r = (4 − 2α)/α.)
  const r = Math.pow(0.5, grid.cellCm / halfDistanceCm);
  const alpha = 4 / (r + 1 / r + 2);
  const tolerance = SIM.inletSpeed * 1e-4;
  const maxIterations = 4000;

  for (let iter = 0; iter < maxIterations; iter++) {
    let maxChange = 0;
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const k = j * nx + i;
        if (!floor[k]) continue;
        // Average over the four neighbours that are floor (walls and furniture don't pass chi on).
        let sum = 0;
        let count = 0;
        if (floor[k - 1]) { sum += chi[k - 1]; count++; }
        if (floor[k + 1]) { sum += chi[k + 1]; count++; }
        if (floor[k - nx]) { sum += chi[k - nx]; count++; }
        if (floor[k + nx]) { sum += chi[k + nx]; count++; }
        if (count === 0) continue;
        const next = Math.max(speed[k], (alpha * sum) / 4 + (alpha * (4 - count) * chi[k]) / 4);
        const change = Math.abs(next - chi[k]);
        if (change > maxChange) maxChange = change;
        chi[k] = next;
      }
    }
    if (maxChange < tolerance) break;
  }
  return chi;
}

/** Classify every floor cell from the chi field. Returns a byte per cell using CLASS_CODE. */
export function classifyChi(grid: RasterGrid, chi: Float32Array): Uint8Array {
  const out = new Uint8Array(grid.nx * grid.ny);
  for (let k = 0; k < out.length; k++) {
    if (!grid.floor[k]) continue;
    out[k] = CLASS_CODE[classifySpeed(chi[k])];
  }
  return out;
}

/** Convenience: chi field + classification straight from a velocity field. */
export function classifyField(grid: RasterGrid, ux: Float32Array, uy: Float32Array): Uint8Array {
  return classifyChi(grid, chiField(grid, ux, uy));
}

function mixOf(classes: Uint8Array, mask: Uint8Array): ClassMix | null {
  let sha = 0;
  let sheng = 0;
  let si = 0;
  for (let k = 0; k < classes.length; k++) {
    if (!mask[k]) continue;
    if (classes[k] === CLASS_CODE.sha) sha++;
    else if (classes[k] === CLASS_CODE.sheng) sheng++;
    else if (classes[k] === CLASS_CODE.si) si++;
  }
  const total = sha + sheng + si;
  return total ? { sha: sha / total, sheng: sheng / total, si: si / total } : null;
}

/**
 * Find connected patches of stagnant cells (flood fill, like the paint-bucket
 * tool) and keep the ones bigger than CHI.minStagnantAreaCm2.
 */
export function findStagnantRegions(grid: RasterGrid, classes: Uint8Array): StagnantRegion[] {
  const { nx, ny, cellCm, originX, originY } = grid;
  const seen = new Uint8Array(classes.length);
  const regions: StagnantRegion[] = [];
  const stack: number[] = [];

  for (let start = 0; start < classes.length; start++) {
    if (seen[start] || classes[start] !== CLASS_CODE.si) continue;
    // Explore one region with an explicit stack (avoids deep recursion).
    let count = 0;
    let sumX = 0;
    let sumY = 0;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let inCorner = false;
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const k = stack.pop()!;
      const i = k % nx;
      const j = (k - i) / nx;
      const cx = originX + (i + 0.5) * cellCm;
      const cy = originY + (j + 0.5) * cellCm;
      count++;
      sumX += cx;
      sumY += cy;
      minX = Math.min(minX, cx - cellCm / 2);
      maxX = Math.max(maxX, cx + cellCm / 2);
      minY = Math.min(minY, cy - cellCm / 2);
      maxY = Math.max(maxY, cy + cellCm / 2);
      if (!inCorner && grid.roomCorners.some((c) => dist(c, { x: cx, y: cy }) <= CHI.cornerRadiusCm)) inCorner = true;
      // 4-connected neighbours.
      const next = [i > 0 ? k - 1 : -1, i < nx - 1 ? k + 1 : -1, j > 0 ? k - nx : -1, j < ny - 1 ? k + nx : -1];
      for (const m of next) {
        if (m >= 0 && !seen[m] && classes[m] === CLASS_CODE.si) {
          seen[m] = 1;
          stack.push(m);
        }
      }
    }
    const areaCm2 = count * cellCm * cellCm;
    if (areaCm2 >= CHI.minStagnantAreaCm2) {
      regions.push({ areaCm2, centroid: { x: sumX / count, y: sumY / count }, bounds: { minX, minY, maxX, maxY }, inCorner });
    }
  }
  return regions.sort((a, b) => b.areaCm2 - a.areaCm2);
}

/** All the numbers the rule engine needs, from one velocity snapshot. */
export function computeStats(
  grid: RasterGrid,
  classes: Uint8Array,
  step: number,
  settled: boolean,
): SimStats {
  return {
    settled,
    step,
    mode: grid.mode,
    floor: mixOf(classes, grid.floor) ?? { sha: 0, sheng: 0, si: 1 },
    bed: mixOf(classes, grid.bedZone),
    stagnantRegions: findStagnantRegions(grid, classes),
  };
}

/**
 * Tracks "has the flow settled?": the mean speed, sampled every few
 * hundred steps, has stopped changing (or we've waited long enough).
 */
export class SettleDetector {
  private samples: number[] = [];
  settled = false;

  /** Feed the mean speed at a given step. Returns true once settled. */
  add(step: number, meanSpeed: number): boolean {
    const cfg = SIM.settle;
    if (this.settled) return true;
    this.samples.push(meanSpeed);
    if (this.samples.length > cfg.windowSamples) this.samples.shift();
    if (step >= cfg.maxSteps) return (this.settled = true);
    if (step < cfg.minSteps || this.samples.length < cfg.windowSamples) return false;
    const max = Math.max(...this.samples);
    const min = Math.min(...this.samples);
    const mean = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
    // A completely still room (door closed) also counts as settled.
    this.settled = mean === 0 || (max - min) / mean < cfg.tolerance;
    return this.settled;
  }
}
