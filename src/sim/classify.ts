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

/** Classify every floor cell. Returns a byte per cell using CLASS_CODE. */
export function classifyField(grid: RasterGrid, ux: Float32Array, uy: Float32Array): Uint8Array {
  const out = new Uint8Array(grid.nx * grid.ny);
  for (let k = 0; k < out.length; k++) {
    if (!grid.floor[k]) continue;
    out[k] = CLASS_CODE[classifySpeed(Math.hypot(ux[k], uy[k]))];
  }
  return out;
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
