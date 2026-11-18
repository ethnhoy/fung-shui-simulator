/**
 * D2Q9 Lattice Boltzmann fluid solver (BGK collision).
 *
 * THE IDEA IN ONE PARAGRAPH
 * Instead of solving fluid equations directly, LBM tracks, for every grid
 * cell, how much "fluid stuff" is moving in each of 9 directions (D2Q9 =
 * 2 dimensions, 9 velocities: stay still, 4 straight, 4 diagonal). Each
 * time step has two phases:
 *   1. COLLIDE: within each cell, nudge the 9 values towards a balanced
 *      "equilibrium" mix for that cell's current density and velocity.
 *      How quickly they relax is set by `tau` (bigger tau = thicker, more
 *      viscous fluid).
 *   2. STREAM: each value hops to the neighbouring cell in its direction.
 *      If that neighbour is solid, it bounces straight back (a no-slip wall).
 * Averaged over many cells and steps, this behaves like a real fluid.
 *
 * Units are "lattice units": 1 cell, 1 step. Speeds must stay well below
 * ~0.1 cells/step or the method becomes unstable, hence inlet ≈ 0.06.
 *
 * This file has no browser or DOM code, so it runs in a Web Worker and in
 * unit tests alike.
 */
import { Cell, type RasterGrid, type SolverParams } from './types';

// The 9 lattice directions (ex, ey) and their weights.
//   index: 0 = rest, 1 = E, 2 = S, 3 = W, 4 = N, 5 = SE, 6 = SW, 7 = NW, 8 = NE
// (y points down, matching the screen.)
const EX = [0, 1, 0, -1, 0, 1, -1, -1, 1];
const EY = [0, 0, 1, 0, -1, 1, 1, -1, -1];
const W = [4 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 9, 1 / 36, 1 / 36, 1 / 36, 1 / 36];
/** OPP[q] is the direction pointing exactly the other way (used for bounce-back). */
const OPP = [0, 3, 4, 1, 2, 7, 8, 5, 6];
const Q = 9;

/**
 * Equilibrium distribution for direction q, given density rho and velocity (ux, uy).
 * The standard second-order formula: w·rho·(1 + 3(e·u) + 4.5(e·u)² − 1.5|u|²).
 */
function feq(q: number, rho: number, ux: number, uy: number): number {
  const eu = EX[q] * ux + EY[q] * uy;
  const uu = ux * ux + uy * uy;
  return W[q] * rho * (1 + 3 * eu + 4.5 * eu * eu - 1.5 * uu);
}

export class LbmSolver {
  readonly nx: number;
  readonly ny: number;
  readonly n: number;
  /** Distributions, laid out as f[q * n + cell]. Two buffers: read from one, write to the other. */
  private f: Float32Array;
  private fNext: Float32Array;
  /** Macroscopic results per cell, recomputed every step. */
  readonly rho: Float32Array;
  readonly ux: Float32Array;
  readonly uy: Float32Array;
  stepCount = 0;

  constructor(
    private grid: RasterGrid,
    private params: SolverParams,
  ) {
    this.nx = grid.nx;
    this.ny = grid.ny;
    this.n = grid.nx * grid.ny;
    this.f = new Float32Array(Q * this.n);
    this.fNext = new Float32Array(Q * this.n);
    this.rho = new Float32Array(this.n);
    this.ux = new Float32Array(this.n);
    this.uy = new Float32Array(this.n);
    this.reset();
  }

  /** Still fluid everywhere: density 1, velocity 0. */
  reset(): void {
    for (let k = 0; k < this.n; k++) {
      for (let q = 0; q < Q; q++) this.f[q * this.n + k] = W[q];
      this.rho[k] = 1;
      this.ux[k] = 0;
      this.uy[k] = 0;
    }
    this.stepCount = 0;
  }

  /** Total fluid mass (sum of all distributions in non-solid cells). Used by tests. */
  totalMass(): number {
    let m = 0;
    for (let k = 0; k < this.n; k++) {
      if (this.grid.cells[k] === Cell.SOLID) continue;
      for (let q = 0; q < Q; q++) m += this.f[q * this.n + k];
    }
    return m;
  }

  /** Mean speed over open floor cells: a single number used to detect when the flow has settled. */
  meanFloorSpeed(): number {
    let sum = 0;
    let count = 0;
    for (let k = 0; k < this.n; k++) {
      if (!this.grid.floor[k]) continue;
      sum += Math.hypot(this.ux[k], this.uy[k]);
      count++;
    }
    return count ? sum / count : 0;
  }

  /** True if any value has blown up (NaN/Infinity), meaning the simulation went unstable. */
  isUnstable(): boolean {
    for (let k = 0; k < this.n; k += 7) if (!Number.isFinite(this.ux[k])) return true;
    return false;
  }

  step(): void {
    const { n, nx, ny, f, fNext, rho, ux, uy } = this;
    const { cells, neighbor, inletVelocity } = this.grid;
    const omega = 1 / this.params.tau;
    const keep = 1 - this.params.porousDrag;
    // Ramp the inlet speed up gently from zero to avoid a pressure shock at the start.
    const ramp = Math.min(1, (this.stepCount + 1) / this.params.inletRampSteps);
    const inUx = inletVelocity.x * ramp;
    const inUy = inletVelocity.y * ramp;
    // Direction into the room (unit vector), used by the pressure inlet.
    const inLen = Math.hypot(inletVelocity.x, inletVelocity.y) || 1;
    const nx0 = inletVelocity.x / inLen;
    const ny0 = inletVelocity.y / inLen;
    const pressureInlet = this.params.inletMode === 'pressure';
    const inRho = 1 + (this.params.inletPressure ?? 0) * ramp;

    // --- Pass 1: density and velocity of every non-solid cell (needed by the boundaries).
    for (let k = 0; k < n; k++) {
      if (cells[k] === Cell.SOLID) {
        rho[k] = 1;
        ux[k] = 0;
        uy[k] = 0;
        continue;
      }
      let r = 0;
      let mx = 0;
      let my = 0;
      for (let q = 0; q < Q; q++) {
        const v = f[q * n + k];
        r += v;
        mx += v * EX[q];
        my += v * EY[q];
      }
      rho[k] = r;
      ux[k] = mx / r;
      uy[k] = my / r;
    }

    // --- Pass 2: collision (and the inlet/outlet boundary conditions).
    for (let k = 0; k < n; k++) {
      const type = cells[k];
      if (type === Cell.SOLID) continue;

      if (type === Cell.INLET) {
        if (pressureInlet) {
          // Pressure inlet: the doorway holds slightly higher "pressure" (density)
          // than the room, and chi flows in as fast as the room lets it. Block the
          // path and less chi gets in, so everything downstream slows down.
          // Velocity comes from the cell just inside, keeping only the inward part
          // (no chi leaks back out of the main door).
          const nb = neighbor[k];
          const inward = Math.max(0, ux[nb] * nx0 + uy[nb] * ny0);
          ux[k] = inward * nx0;
          uy[k] = inward * ny0;
          for (let q = 0; q < Q; q++) f[q * n + k] = feq(q, inRho, ux[k], uy[k]);
        } else {
          // Velocity inlet: force the cell to equilibrium at a fixed inlet velocity,
          // borrowing density from the cell just inside so pressure stays smooth.
          const r = rho[neighbor[k]];
          ux[k] = inUx;
          uy[k] = inUy;
          for (let q = 0; q < Q; q++) f[q * n + k] = feq(q, r, inUx, inUy);
        }
        continue;
      }
      if (type === Cell.OUTLET) {
        // Pressure outlet: fixed density 1, velocity copied from inside ("zero gradient"),
        // so chi can leave without being pushed back.
        const nb = neighbor[k];
        ux[k] = ux[nb];
        uy[k] = uy[nb];
        for (let q = 0; q < Q; q++) f[q * n + k] = feq(q, 1, ux[nb], uy[nb]);
        continue;
      }

      let vx = ux[k];
      let vy = uy[k];
      if (type === Cell.POROUS) {
        // Porous drag: relax towards a slower equilibrium, which bleeds momentum away.
        vx *= keep;
        vy *= keep;
      }
      const r = rho[k];
      for (let q = 0; q < Q; q++) {
        const idx = q * n + k;
        f[idx] += omega * (feq(q, r, vx, vy) - f[idx]);
      }
    }

    // --- Pass 3: streaming with bounce-back off solid cells.
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        if (cells[k] === Cell.SOLID) continue;
        for (let q = 0; q < Q; q++) {
          const ti = i + EX[q];
          const tj = j + EY[q];
          const v = f[q * n + k];
          const outside = ti < 0 || tj < 0 || ti >= nx || tj >= ny;
          const target = tj * nx + ti;
          if (outside || cells[target] === Cell.SOLID) {
            // Hit a wall: the value comes straight back into this cell, reversed.
            fNext[OPP[q] * n + k] = v;
          } else {
            fNext[q * n + target] = v;
          }
        }
      }
    }

    // Swap buffers (cheaper than copying).
    this.f = fNext;
    this.fNext = f;
    this.stepCount++;
  }
}
