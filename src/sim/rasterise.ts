/**
 * Rasteriser: converts the Layout (shapes in cm) into a grid of cells the
 * fluid solver understands. Like drawing the room on graph paper and
 * colouring each square as wall, floor, plant, door or window.
 *
 * Rules (from CLAUDE.md):
 *  - walls, closed openings and solid furniture → SOLID
 *  - plants, chairs (porous) → POROUS: slows chi but doesn't block it
 *  - rugs (solidity none) → nothing, chi flows over them
 *  - main door (open) → INLET; other open doors and windows → OUTLET
 */
import { roomPolygon, roomWalls, pointInPolygon } from '../geometry/room';
import { dot, rotate, sub } from '../geometry/vec';
import type { Furniture, Layout, Point } from '../model/types';
import { CHI, SIM } from '../rules/config';
import { Cell, type FlowMode, type RasterGrid } from './types';

export type Quality = keyof typeof SIM.quality;

/** True if room point p lies inside the furniture's rotated rectangle (optionally grown by `margin` cm). */
export function pointInFurniture(f: Furniture, p: Point, margin = 0): boolean {
  // Rotate the point into the item's own frame, where the rectangle is axis-aligned.
  const local = rotate(sub(p, { x: f.x, y: f.y }), -f.rotation);
  return Math.abs(local.x) <= f.width / 2 + margin && Math.abs(local.y) <= f.depth / 2 + margin;
}

export function rasterise(layout: Layout, quality: Quality = 'standard'): RasterGrid {
  const { cellCm } = SIM.quality[quality];
  const room = layout.room;
  const poly = roomPolygon(room);
  const walls = roomWalls(room);

  // Two cells of padding outside the room for the walls and door/window cells.
  const pad = cellCm * 2;
  const nx = Math.ceil((room.width + 2 * pad) / cellCm);
  const ny = Math.ceil((room.depth + 2 * pad) / cellCm);
  const n = nx * ny;
  const originX = -pad;
  const originY = -pad;
  const centre = (i: number, j: number): Point => ({
    x: originX + (i + 0.5) * cellCm,
    y: originY + (j + 0.5) * cellCm,
  });

  const cells = new Uint8Array(n).fill(Cell.SOLID);
  const neighbor = new Int32Array(n).fill(-1);
  const floor = new Uint8Array(n);
  const bedZone = new Uint8Array(n);

  // 1. Inside the room polygon = fluid. Everything else stays solid (walls).
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      if (pointInPolygon(centre(i, j), poly)) cells[j * nx + i] = Cell.FLUID;
    }
  }

  // 2. Furniture. Solid wins over porous if items overlap.
  const blockers = layout.furniture.filter((f) => f.solidity !== 'none');
  const beds = layout.furniture.filter((f) => f.type === 'bed');
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      if (cells[k] === Cell.SOLID) continue;
      const p = centre(i, j);
      for (const f of blockers) {
        if (!pointInFurniture(f, p)) continue;
        if (f.solidity === 'solid') {
          cells[k] = Cell.SOLID;
          break;
        }
        cells[k] = Cell.POROUS;
      }
      if (cells[k] !== Cell.SOLID) {
        floor[k] = 1;
        if (beds.some((b) => pointInFurniture(b, p, CHI.bedZoneCm))) bedZone[k] = 1;
      }
    }
  }

  // 3. Doors and windows: the first layer of cells just outside an opening.
  const main = layout.openings.find((o) => o.kind === 'door' && o.isMainEntrance);
  const otherOpen = layout.openings.filter((o) => o.isOpen && o !== main);
  let mode: FlowMode = 'normal';
  if (!main) mode = 'noDoor';
  else if (!main.isOpen) mode = 'doorClosed';
  else if (otherOpen.length === 0) mode = 'split';

  const mainWall = main ? walls[main.wallIndex] : undefined;
  const inletVelocity = mainWall && mode !== 'noDoor' && mode !== 'doorClosed'
    ? { x: mainWall.inward.x * SIM.inletSpeed, y: mainWall.inward.y * SIM.inletSpeed }
    : { x: 0, y: 0 };

  const openings = [...(main?.isOpen ? [main] : []), ...otherOpen];
  for (const o of openings) {
    const wall = walls[o.wallIndex];
    if (!wall) continue;
    const lo = o.offset - o.width / 2;
    const hi = o.offset + o.width / 2;
    // Step of one cell into the room, rounded to a grid direction (walls are axis-aligned).
    const di = Math.round(wall.inward.x);
    const dj = Math.round(wall.inward.y);
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        if (cells[k] !== Cell.SOLID) continue;
        const rel = sub(centre(i, j), wall.start);
        const along = dot(rel, wall.dir); // position along the wall
        const into = dot(rel, wall.inward); // negative = outside the room
        if (into >= 0 || into < -cellCm || along <= lo || along >= hi) continue;
        const inner = (j + dj) * nx + (i + di);
        if (cells[inner] === Cell.SOLID) continue; // blocked by furniture right behind the opening
        let type: number = Cell.OUTLET;
        if (o === main) {
          // In split mode the start-side half of the doorway breathes in and the other half out.
          type = mode === 'split' && along > o.offset ? Cell.OUTLET : Cell.INLET;
        }
        cells[k] = type;
        neighbor[k] = inner;
      }
    }
  }

  return { nx, ny, cellCm, originX, originY, cells, neighbor, floor, bedZone, inletVelocity, mode, roomCorners: poly };
}

/** Convert a room point (cm) to the index of the grid cell containing it, or -1 if outside the grid. */
export function cellIndexAt(grid: RasterGrid, p: Point): number {
  const i = Math.floor((p.x - grid.originX) / grid.cellCm);
  const j = Math.floor((p.y - grid.originY) / grid.cellCm);
  if (i < 0 || j < 0 || i >= grid.nx || j >= grid.ny) return -1;
  return j * grid.nx + i;
}
