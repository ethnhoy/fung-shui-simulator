/**
 * Shared types for the chi flow simulation.
 */
import type { Point } from '../model/types';

/**
 * What each grid cell is. Stored as small numbers in a Uint8Array (a
 * compact byte array, like `byte[]` in Java) because there are thousands of cells.
 */
export const Cell = {
  FLUID: 0,
  SOLID: 1,
  /** Fluid that's slowed down (plants, chairs). */
  POROUS: 2,
  /** Chi enters here at a fixed velocity (the main door). */
  INLET: 3,
  /** Chi leaves here freely (open windows, other open doors). */
  OUTLET: 4,
} as const;
export type CellType = (typeof Cell)[keyof typeof Cell];

/**
 * Why the simulation might be in a special state:
 * - normal: main door is an inlet, other openings are outlets
 * - split: the main door is the only open opening, so half of it is an inlet and half an outlet
 * - doorClosed: the main door is shut, so nothing flows
 * - noDoor: there is no main door at all
 */
export type FlowMode = 'normal' | 'split' | 'doorClosed' | 'noDoor';

/** The layout turned into a grid, ready for the solver. All arrays are length nx * ny, row by row. */
export interface RasterGrid {
  nx: number;
  ny: number;
  cellCm: number;
  /** Room coordinates (cm) of the grid's top-left corner. Cell (i, j) centre = origin + (i + 0.5, j + 0.5) * cellCm. */
  originX: number;
  originY: number;
  cells: Uint8Array;
  /** For inlet/outlet cells, the index of the fluid cell just inside the room; otherwise -1. */
  neighbor: Int32Array;
  /** 1 where the cell is open floor inside the room (fluid or porous). */
  floor: Uint8Array;
  /** 1 for floor cells in the band around any bed. */
  bedZone: Uint8Array;
  /** Inlet velocity in lattice units. */
  inletVelocity: Point;
  mode: FlowMode;
  /** Room polygon corners (cm), for "stagnant corner" detection. */
  roomCorners: Point[];
}

/** Settings the solver needs on top of the grid. */
export interface SolverParams {
  tau: number;
  porousDrag: number;
  inletRampSteps: number;
  /** 'velocity' pushes chi in at a fixed speed; 'pressure' lets the room's resistance set the speed. */
  inletMode?: 'velocity' | 'pressure';
  /** For the pressure inlet: extra density at the door (lattice units), e.g. 0.01. */
  inletPressure?: number;
}

export type ChiClass = 'sha' | 'sheng' | 'si';

export interface ClassMix {
  sha: number;
  sheng: number;
  si: number;
}

export interface StagnantRegion {
  areaCm2: number;
  /** Centre of the region in room coordinates (cm). */
  centroid: Point;
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  inCorner: boolean;
}

/** Summary numbers handed to the rule engine. Fractions are 0..1. */
export interface SimStats {
  settled: boolean;
  step: number;
  mode: FlowMode;
  /** Share of open floor area in each chi class. */
  floor: ClassMix;
  /** Chi mix in the band around the bed, or null if there's no bed. */
  bed: ClassMix | null;
  stagnantRegions: StagnantRegion[];
}
