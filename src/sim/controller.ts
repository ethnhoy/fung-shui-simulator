/**
 * The SimController connects everything in Simulate mode:
 *   Layout ─rasterise→ grid ─postMessage→ worker (LBM) ─frames→ classify/stats
 *                                                          └→ particles → renderer
 * It also owns the animation loop (requestAnimationFrame, which the browser
 * calls once per screen refresh) and re-runs the simulation when the layout changes.
 */
import type { Store } from '../editor/store';
import { roomPolygon } from '../geometry/room';
import { FLOW_VIEW, SIM } from '../rules/config';
import { classifyField, computeStats } from './classify';
import type { FromWorker, ToWorker } from './messages';
import { ParticleSystem } from './particles';
import { rasterise, type Quality } from './rasterise';
import { FlowRenderer, type RenderOptions, type ViewTransform } from './renderer';
import type { FlowMode, RasterGrid, SimStats } from './types';

export interface SimStatus {
  active: boolean;
  mode: FlowMode | null;
  running: boolean;
  settled: boolean;
  step: number;
  unstable: boolean;
  stats: SimStats | null;
}

const STATS_INTERVAL_MS = 250;
const RERUN_DELAY_MS = 300;

export class SimController {
  private worker: Worker | null = null;
  private renderer: FlowRenderer;
  private particles = new ParticleSystem();
  private grid: RasterGrid | null = null;
  private field: { ux: Float32Array; uy: Float32Array } | null = null;
  private runId = 0;
  private rafId = 0;
  private rerunTimer: number | undefined;
  private lastStatsAt = 0;
  private listeners = new Set<(s: SimStatus) => void>();

  /** True while the user wants it playing (particles move, solver runs until settled). */
  playing = true;
  speed = 1;
  quality: Quality = 'standard';
  options: RenderOptions = { heatmap: true, particles: true, arrows: false };
  status: SimStatus = { active: false, mode: null, running: false, settled: false, step: 0, unstable: false, stats: null };

  constructor(
    canvas: HTMLCanvasElement,
    private store: Store,
    private getView: () => ViewTransform,
  ) {
    this.renderer = new FlowRenderer(canvas);
    // Changing the layout while simulating re-runs the simulation (after a short pause, so typing doesn't thrash it).
    store.subscribe((kind) => {
      if (!this.status.active || kind === 'selection' || kind === 'preview') return;
      window.clearTimeout(this.rerunTimer);
      this.rerunTimer = window.setTimeout(() => this.restart(), RERUN_DELAY_MS);
    });
  }

  subscribe(fn: (s: SimStatus) => void): () => void {
    this.listeners.add(fn);
    fn(this.status);
    return () => this.listeners.delete(fn);
  }

  private setStatus(patch: Partial<SimStatus>): void {
    this.status = { ...this.status, ...patch };
    for (const fn of this.listeners) fn(this.status);
  }

  // ------------------------------------------------------------ Lifecycle

  enter(): void {
    if (!this.worker) {
      // Vite bundles the worker file separately; `new URL(..., import.meta.url)` tells it where.
      this.worker = new Worker(new URL('./lbm.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<FromWorker>) => this.onWorkerMessage(e.data);
    }
    this.setStatus({ active: true });
    this.restart();
    this.loop();
  }

  exit(): void {
    this.send({ type: 'pause' });
    cancelAnimationFrame(this.rafId);
    this.renderer.clear();
    this.setStatus({ active: false, running: false });
  }

  /** Rasterise the current layout and start the solver from still air. */
  restart(): void {
    if (!this.status.active) return;
    const grid = rasterise(this.store.layout, this.quality);
    this.grid = grid;
    this.field = null;
    this.runId++;
    this.particles.setGrid(grid);
    this.lastStatsAt = 0;
    this.setStatus({ mode: grid.mode, step: 0, settled: false, unstable: false, stats: null, running: false });

    if (grid.mode === 'doorClosed' || grid.mode === 'noDoor') {
      this.send({ type: 'pause' });
      return; // nothing can flow; the UI shows a message instead
    }
    const q = SIM.quality[this.quality];
    // Note: the grid's typed arrays are *copied* into the worker here (structured clone).
    this.send({ type: 'init', grid, params: { tau: q.tau, porousDrag: SIM.porousDrag, inletRampSteps: SIM.inletRampSteps }, runId: this.runId });
    this.send({ type: 'speed', stepsPerBatch: this.batchSize() });
    if (!this.playing) this.send({ type: 'pause' });
  }

  // ------------------------------------------------------------ Controls

  play(): void {
    this.playing = true;
    this.send({ type: 'play' });
    this.setStatus({});
  }

  pause(): void {
    this.playing = false;
    this.send({ type: 'pause' });
    this.setStatus({});
  }

  /** Advance one "frame" worth of simulation and particle motion while paused. */
  stepOnce(): void {
    this.pause();
    this.send({ type: 'step', steps: Math.round(FLOW_VIEW.stepsPerFrame * 4) });
    this.particles.update(FLOW_VIEW.stepsPerFrame * 4);
  }

  reset(): void {
    this.particles.clear();
    this.restart();
  }

  setSpeed(speed: number): void {
    this.speed = speed;
    this.send({ type: 'speed', stepsPerBatch: this.batchSize() });
  }

  setQuality(q: Quality): void {
    this.quality = q;
    this.restart();
  }

  setOptions(patch: Partial<RenderOptions>): void {
    this.options = { ...this.options, ...patch };
  }

  /** Higher quality has 4× the cells, so run fewer steps per batch to keep the page responsive. */
  private batchSize(): number {
    const base = this.quality === 'high' ? 10 : 25;
    return Math.max(1, Math.round(base * this.speed));
  }

  private send(msg: ToWorker): void {
    this.worker?.postMessage(msg);
  }

  // ------------------------------------------------------------ Data from the worker

  private onWorkerMessage(msg: FromWorker): void {
    if (msg.runId !== this.runId || !this.grid) return; // a frame from an older run: ignore it
    if (msg.type === 'unstable') {
      this.setStatus({ unstable: true, running: false });
      return;
    }
    this.field = { ux: msg.ux, uy: msg.uy };
    this.particles.setField(msg.ux, msg.uy);
    const classes = classifyField(this.grid, msg.ux, msg.uy);
    this.renderer.setClasses(classes);

    // Stats (with the flood fill) are a little heavier, so update them a few times a second.
    const now = performance.now();
    let stats = this.status.stats;
    if (msg.settled || !msg.running || now - this.lastStatsAt > STATS_INTERVAL_MS) {
      stats = computeStats(this.grid, classes, msg.step, msg.settled);
      this.lastStatsAt = now;
    }
    this.setStatus({ step: msg.step, settled: msg.settled, running: msg.running, stats });
  }

  /** Latest statistics for the rule engine (null until the first frame). */
  get stats(): SimStats | null {
    return this.status.stats;
  }

  // ------------------------------------------------------------ Animation

  private loop = (): void => {
    if (!this.status.active) return;
    if (this.playing && this.field) this.particles.update(FLOW_VIEW.stepsPerFrame * this.speed);
    const flowing = this.status.mode === 'normal' || this.status.mode === 'split';
    this.renderer.draw(
      flowing ? this.grid : null,
      this.getView(),
      roomPolygon(this.store.layout.room),
      flowing ? this.particles.particles : [],
      this.field,
      this.options,
    );
    this.rafId = requestAnimationFrame(this.loop);
  };
}
