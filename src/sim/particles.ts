/**
 * Tracer particles: little dots released at the door that drift with the
 * flow and leave fading trails, like smoke in a wind tunnel.
 *
 * Particles live in room coordinates (cm). Each animation frame we move
 * them by (velocity × number of lattice steps), using the latest field
 * from the solver.
 */
import type { Point } from '../model/types';
import { FLOW_VIEW } from '../rules/config';
import { classifySpeed } from './classify';
import { sampleVelocity } from './field';
import { cellIndexAt } from './rasterise';
import { Cell, type ChiClass, type RasterGrid } from './types';

export interface Particle {
  x: number;
  y: number;
  age: number;
  /** Recent positions, oldest first, for drawing the trail. */
  trail: Point[];
  chi: ChiClass;
}

export class ParticleSystem {
  particles: Particle[] = [];
  private spawnPoints: Point[] = [];
  private spawnBudget = 0;
  private grid: RasterGrid | null = null;
  private ux: Float32Array | null = null;
  private uy: Float32Array | null = null;

  setGrid(grid: RasterGrid): void {
    this.grid = grid;
    this.particles = [];
    this.ux = this.uy = null;
    // Particles are born in the first room cell inside each inlet cell.
    this.spawnPoints = [];
    grid.cells.forEach((c, k) => {
      if (c !== Cell.INLET) return;
      const inner = grid.neighbor[k];
      const i = inner % grid.nx;
      const j = (inner - i) / grid.nx;
      this.spawnPoints.push({ x: grid.originX + (i + 0.5) * grid.cellCm, y: grid.originY + (j + 0.5) * grid.cellCm });
    });
  }

  setField(ux: Float32Array, uy: Float32Array): void {
    this.ux = ux;
    this.uy = uy;
  }

  clear(): void {
    this.particles = [];
  }

  /** Advance every particle by `steps` lattice steps' worth of motion. */
  update(steps: number): void {
    const { grid, ux, uy } = this;
    if (!grid || !ux || !uy || steps <= 0) return;

    this.emit(steps / FLOW_VIEW.stepsPerFrame);

    const cell = grid.cellCm;
    const alive: Particle[] = [];
    for (const p of this.particles) {
      // Move in a few sub-steps so a fast particle never jumps more than half a cell (it would skip walls).
      const v0 = sampleVelocity(grid, ux, uy, p);
      const travel = Math.hypot(v0.x, v0.y) * steps; // in cells
      const sub = Math.max(1, Math.ceil(travel / 0.5));
      const h = steps / sub;
      let dead = false;
      for (let s = 0; s < sub && !dead; s++) {
        // Midpoint method (RK2): look ahead half a step for a smoother, more accurate curve.
        const a = sampleVelocity(grid, ux, uy, p);
        const mid = { x: p.x + a.x * cell * h * 0.5, y: p.y + a.y * cell * h * 0.5 };
        const b = sampleVelocity(grid, ux, uy, mid);
        p.x += b.x * cell * h;
        p.y += b.y * cell * h;
        const k = cellIndexAt(grid, p);
        const type = k < 0 ? Cell.SOLID : grid.cells[k];
        // Leaves through a window/door, hits furniture, or slips into a wall: remove it.
        if (type === Cell.SOLID || type === Cell.OUTLET) dead = true;
      }
      p.age++;
      if (dead || p.age > FLOW_VIEW.maxAge) continue;
      const v = sampleVelocity(grid, ux, uy, p);
      p.chi = classifySpeed(Math.hypot(v.x, v.y));
      p.trail.push({ x: p.x, y: p.y });
      if (p.trail.length > FLOW_VIEW.trailLength) p.trail.shift();
      alive.push(p);
    }
    this.particles = alive;
  }

  /** Release new particles at the door, in proportion to the doorway width. */
  private emit(frameFraction: number): void {
    if (!this.spawnPoints.length || !this.grid) return;
    const widthMetres = (this.spawnPoints.length * this.grid.cellCm) / 100;
    this.spawnBudget += FLOW_VIEW.emitPerMetre * widthMetres * frameFraction;
    const jitter = this.grid.cellCm;
    while (this.spawnBudget >= 1 && this.particles.length < FLOW_VIEW.maxParticles) {
      this.spawnBudget -= 1;
      const sp = this.spawnPoints[Math.floor(Math.random() * this.spawnPoints.length)];
      const x = sp.x + (Math.random() - 0.5) * jitter;
      const y = sp.y + (Math.random() - 0.5) * jitter;
      this.particles.push({ x, y, age: 0, trail: [{ x, y }], chi: 'sha' });
    }
    if (this.particles.length >= FLOW_VIEW.maxParticles) this.spawnBudget = 0;
  }
}
