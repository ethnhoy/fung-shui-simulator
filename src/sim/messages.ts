/**
 * The messages passed between the page and the simulation worker.
 * A Web Worker shares no memory with the page, so they talk only by
 * posting these objects to each other (like sending messages between
 * two separate programs).
 */
import type { RasterGrid, SolverParams } from './types';

export type ToWorker =
  | { type: 'init'; grid: RasterGrid; params: SolverParams; runId: number }
  | { type: 'play' }
  | { type: 'pause' }
  /** Run `steps` steps then pause (the "Step" button). */
  | { type: 'step'; steps: number }
  /** Steps per batch: the speed slider. */
  | { type: 'speed'; stepsPerBatch: number };

export type FromWorker =
  | {
      type: 'frame';
      runId: number;
      step: number;
      settled: boolean;
      running: boolean;
      ux: Float32Array;
      uy: Float32Array;
    }
  | { type: 'unstable'; runId: number; step: number };
