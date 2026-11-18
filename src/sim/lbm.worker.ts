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
import { SettleDetector } from './classify';
import { LbmSolver } from './lbm';
import type { FromWorker, ToWorker } from './messages';

const FRAME_INTERVAL_MS = 33;

let solver: LbmSolver | null = null;
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
  if (!solver) return;
  // Copy the arrays and *transfer* the copies: ownership moves to the page with no second copy.
  const ux = solver.ux.slice();
  const uy = solver.uy.slice();
  post({ type: 'frame', runId, step: solver.stepCount, settled: settle.settled, running, ux, uy }, [ux.buffer, uy.buffer]);
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
