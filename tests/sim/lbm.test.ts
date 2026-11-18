import { describe, expect, it } from 'vitest';
import { sampleLayout } from '../../src/model/sample';
import { createFurniture } from '../../src/model/catalog';
import { addFurniture } from '../../src/model/layoutOps';
import { SIM } from '../../src/rules/config';
import { LbmSolver } from '../../src/sim/lbm';
import { rasterise } from '../../src/sim/rasterise';
import { Cell, type RasterGrid } from '../../src/sim/types';

const params = { tau: 0.6, porousDrag: 0.12, inletRampSteps: 50 };

/** A small hand-made grid: a box with solid walls, optionally with an inlet on the left and outlet on the right. */
function boxGrid(nx: number, ny: number, withFlow: boolean): RasterGrid {
  const n = nx * ny;
  const cells = new Uint8Array(n);
  const neighbor = new Int32Array(n).fill(-1);
  const floor = new Uint8Array(n);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const edge = i === 0 || j === 0 || i === nx - 1 || j === ny - 1;
      cells[k] = edge ? Cell.SOLID : Cell.FLUID;
      floor[k] = edge ? 0 : 1;
      // Left and right columns (except the corners) become the inlet and outlet.
      if (withFlow && j > 0 && j < ny - 1) {
        if (i === 0) {
          cells[k] = Cell.INLET;
          neighbor[k] = k + 1;
        } else if (i === nx - 1) {
          cells[k] = Cell.OUTLET;
          neighbor[k] = k - 1;
        }
      }
    }
  }
  return {
    nx, ny, cellCm: 5, originX: 0, originY: 0, cells, neighbor, floor,
    bedZone: new Uint8Array(n), inletVelocity: { x: 0.06, y: 0 }, mode: 'normal', roomCorners: [],
  };
}

describe('LbmSolver', () => {
  it('conserves mass in a closed box', () => {
    const solver = new LbmSolver(boxGrid(20, 20, false), params);
    const before = solver.totalMass();
    for (let s = 0; s < 200; s++) solver.step();
    expect(solver.totalMass()).toBeCloseTo(before, 2);
    expect(solver.meanFloorSpeed()).toBeLessThan(1e-6); // still fluid stays still
  });

  it('carries flow from an inlet to an outlet in a channel', () => {
    const solver = new LbmSolver(boxGrid(40, 12, true), params);
    for (let s = 0; s < 1500; s++) solver.step();
    expect(solver.isUnstable()).toBe(false);
    // In the middle of the channel the flow points right at roughly the inlet speed.
    const mid = 6 * 40 + 20;
    expect(solver.ux[mid]).toBeGreaterThan(0.04);
    expect(Math.abs(solver.uy[mid])).toBeLessThan(0.01);
  });

  it('stays stable on the sample bedroom and never moves solid cells', () => {
    const grid = rasterise(sampleLayout());
    const solver = new LbmSolver(grid, { tau: SIM.quality.standard.tau, porousDrag: SIM.porousDrag, inletRampSteps: SIM.inletRampSteps });
    for (let s = 0; s < 1500; s++) solver.step();
    expect(solver.isUnstable()).toBe(false);
    expect(solver.meanFloorSpeed()).toBeGreaterThan(0);
    grid.cells.forEach((c, k) => {
      if (c === Cell.SOLID) expect(solver.ux[k]).toBe(0);
    });
  });

  it('with a pressure inlet, blocking the path lets less chi in', () => {
    const q = SIM.quality.standard;
    const params = { tau: q.tau, porousDrag: SIM.porousDrag, inletRampSteps: SIM.inletRampSteps, inletMode: 'pressure' as const, inletPressure: q.inletPressure };
    const inflow = (layout: ReturnType<typeof sampleLayout>) => {
      const grid = rasterise(layout);
      const solver = new LbmSolver(grid, params);
      for (let s = 0; s < 2000; s++) solver.step();
      let sum = 0;
      let count = 0;
      grid.cells.forEach((c, k) => {
        if (c === Cell.INLET) {
          sum += Math.hypot(solver.ux[k], solver.uy[k]);
          count++;
        }
      });
      return sum / count;
    };
    const clear = inflow(sampleLayout());
    // A large plant in the stream between the door and the window.
    const blocked = inflow(addFurniture(sampleLayout(), createFurniture('plant', 341, 220, 'large')));
    expect(clear).toBeGreaterThan(0.04); // tuned to roughly the reference speed
    expect(blocked).toBeLessThan(clear * 0.9);
  });
});
