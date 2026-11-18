import { describe, expect, it } from 'vitest';
import { updateOpening } from '../../src/model/layoutOps';
import { sampleLayout } from '../../src/model/sample';
import { cellIndexAt, rasterise } from '../../src/sim/rasterise';
import { Cell } from '../../src/sim/types';

const count = (arr: Uint8Array, value: number) => arr.reduce((n, v) => n + (v === value ? 1 : 0), 0);

describe('rasterise', () => {
  const layout = sampleLayout(); // 420 × 400 room, door on the bottom wall, window on the right wall
  const grid = rasterise(layout);

  it('sizes the grid to the room plus two cells of wall padding', () => {
    expect(grid.cellCm).toBe(5);
    expect(grid.nx).toBe((420 + 20) / 5);
    expect(grid.ny).toBe((400 + 20) / 5);
  });

  it('marks walls solid and empty floor fluid', () => {
    expect(grid.cells[cellIndexAt(grid, { x: -3, y: 200 })]).toBe(Cell.SOLID); // in the left wall
    expect(grid.cells[cellIndexAt(grid, { x: 300, y: 250 })]).toBe(Cell.FLUID); // open floor
  });

  it('treats furniture by solidity: bed solid, plant porous, rug ignored', () => {
    expect(grid.cells[cellIndexAt(grid, { x: 140, y: 100 })]).toBe(Cell.SOLID); // bed
    expect(grid.cells[cellIndexAt(grid, { x: 385, y: 35 })]).toBe(Cell.POROUS); // plant
    expect(grid.cells[cellIndexAt(grid, { x: 140, y: 290 })]).toBe(Cell.FLUID); // rug only
  });

  it('turns the open main door into an inlet pointing into the room', () => {
    // An 80 cm door on a 5 cm grid is 16 cells wide.
    expect(count(grid.cells, Cell.INLET)).toBe(16);
    expect(grid.inletVelocity.y).toBeLessThan(0); // bottom wall, so chi flows up
    expect(grid.mode).toBe('normal');
  });

  it('turns the open window (top wall) into an outlet', () => {
    expect(count(grid.cells, Cell.OUTLET)).toBe(20); // 100 cm window
  });

  it('links each inlet/outlet cell to the fluid cell just inside', () => {
    grid.cells.forEach((c, k) => {
      if (c === Cell.INLET || c === Cell.OUTLET) expect(grid.cells[grid.neighbor[k]]).not.toBe(Cell.SOLID);
    });
  });

  it('marks a band around the bed', () => {
    expect(grid.bedZone[cellIndexAt(grid, { x: 140, y: 215 })]).toBe(1); // just past the foot
    expect(grid.bedZone[cellIndexAt(grid, { x: 300, y: 300 })]).toBe(0);
  });

  it('splits the doorway when the main door is the only opening', () => {
    const closedWindow = updateOpening(layout, 'window-1', { isOpen: false });
    const g = rasterise(closedWindow);
    expect(g.mode).toBe('split');
    expect(count(g.cells, Cell.INLET)).toBe(8);
    expect(count(g.cells, Cell.OUTLET)).toBe(8);
  });

  it('reports a closed main door and creates no inlet', () => {
    const g = rasterise(updateOpening(layout, 'door-main', { isOpen: false }));
    expect(g.mode).toBe('doorClosed');
    expect(count(g.cells, Cell.INLET)).toBe(0);
  });

  it('supports the high-quality 2.5 cm grid', () => {
    const g = rasterise(layout, 'high');
    expect(g.nx).toBe((420 + 10) / 2.5);
    expect(count(g.cells, Cell.INLET)).toBe(32);
  });
});
