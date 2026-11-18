/**
 * The simulation worker. It runs the LBM solver on a background thread
 * and sends the velocity field back to the page about 30 times a second.
 *
 * Loop: run a batch of steps → maybe send a frame → yield (setTimeout 0)
 * so incoming messages like "pause" get handled → repeat.
 * Once the flow has settled the worker pauses itself to save battery;
 * the page keeps animating particles on the final field.
 */
import { SIM } from '../rules/config';
import { chiField, SettleDetector } from './classify';
import { LbmSolver } from './lbm';
import type { FromWorker, ToWorker } from './messages';
import type { RasterGrid } from './types';

const FRAME_INTERVAL_MS = 33;
/** The chi field takes ~30 ms to compute, so it's refreshed less often than the velocity. */
const CHI_INTERVAL_MS = 200;

let solver: LbmSolver | null = null;
let grid: RasterGrid | null = null;
let lastChi = 0;
let settle = new SettleDetector();
let runId = 0;
let running = false;
let stepsPerBatch = 20;
let stepsLeft = Infinity; // for the "Step" button
let lastFrame = 0;
let loopScheduled = false;

function post(msg: FromWorker, transfer: Transferable[] = []): void {
  (self as unknown as Worker).postMessage(msg, transfer);
}

function sendFrame(): void {
  if (!solver || !grid) return;
  // Copy the arrays and *transfer* the copies: ownership moves to the page with no second copy.
  const ux = solver.ux.slice();
  const uy = solver.uy.slice();
  const now = performance.now();
  // Always include the chi field on a final frame (paused/settled) so the last picture is exact.
  const chi = !running || now - lastChi >= CHI_INTERVAL_MS ? chiField(grid, ux, uy) : null;
  if (chi) lastChi = now;
  const transfer: Transferable[] = [ux.buffer, uy.buffer];
  if (chi) transfer.push(chi.buffer);
  post({ type: 'frame', runId, step: solver.stepCount, settled: settle.settled, running, ux, uy, chi }, transfer);
  lastFrame = performance.now();
}

function runBatch(): void {
  loopScheduled = false;
  if (!solver || !running) return;
  const batch = Math.min(stepsPerBatch, stepsLeft);
  for (let s = 0; s < batch; s++) {
    solver.step();
    if (solver.stepCount % SIM.settle.sampleEvery === 0) settle.add(solver.stepCount, solver.meanFloorSpeed());
  }
  stepsLeft -= batch;

  if (solver.isUnstable()) {
    running = false;
    post({ type: 'unstable', runId, step: solver.stepCount });
    return;
  }
  if (settle.settled || stepsLeft <= 0) running = false;
  if (!running || performance.now() - lastFrame >= FRAME_INTERVAL_MS) sendFrame();
  schedule();
}

function schedule(): void {
  if (running && !loopScheduled) {
    loopScheduled = true;
    setTimeout(runBatch, 0);
  }
}

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  switch (msg.type) {
    case 'init':
      grid = msg.grid;
      lastChi = 0;
      solver = new LbmSolver(msg.grid, msg.params);
      settle = new SettleDetector();
      runId = msg.runId;
      running = true;
      stepsLeft = Infinity;
      sendFrame();
      schedule();
      break;
    case 'play':
      // Playing after the flow settled just keeps the final field; nothing to compute.
      running = !settle.settled;
      stepsLeft = Infinity;
      schedule();
      break;
    case 'pause':
      running = false;
      sendFrame();
      break;
    case 'step':
      running = true;
      stepsLeft = msg.steps;
      schedule();
      break;
    case 'speed':
      stepsPerBatch = Math.max(1, Math.round(msg.stepsPerBatch));
      break;
  }
};
