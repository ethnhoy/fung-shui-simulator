/**
 * The particle overlay: a see-through canvas on top of the plan that draws
 * every particle (flow particles in Simulate mode, problem streams in both
 * modes) with fading trails. It has its own animation loop, which only runs
 * while there is something to animate.
 *
 * The canvas ignores the mouse (CSS pointer-events: none), so you can still
 * click and drag furniture underneath it.
 */
import { FLOW_VIEW } from '../rules/config';
import { ParticleSystem, type ChiStream, type Particle, type Tint } from './particles';
import { bandOf, PARTICLE_BANDS, type ViewTransform } from './renderer';
import type { RasterGrid } from './types';

/** Stream tints: chi bouncing off a mirror is silvery blue; chi draining out of the door is a dusky brown. */
const TINT_CSS: Record<Exclude<Tint, 'flow'>, string> = {
  mirror: 'rgb(120, 170, 205)',
  coffin: 'rgb(110, 84, 70)',
};

export class ParticleOverlay {
  readonly particles = new ParticleSystem();
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  private rafId = 0;
  private running = false;
  /** Simulate mode: flow particles are on. */
  private simulating = false;
  /** Paused (Simulate mode's Pause button) freezes everything. */
  playing = true;
  speed = 1;
  showFlowParticles = true;

  constructor(
    private canvas: HTMLCanvasElement,
    private getView: () => ViewTransform,
  ) {
    this.ctx = canvas.getContext('2d')!;
  }

  // ------------------------------------------------------------ Inputs

  setStreams(streams: ChiStream[]): void {
    this.particles.setStreams(streams);
    this.wake();
  }

  /** Simulate mode starts/stops following a grid (null = Edit mode, streams only). */
  setGrid(grid: RasterGrid | null): void {
    this.simulating = grid !== null;
    this.particles.setGrid(grid);
    this.wake();
  }

  setField(ux: Float32Array, uy: Float32Array): void {
    this.particles.setField(ux, uy);
  }

  setChi(chi: Float32Array): void {
    this.particles.setChi(chi);
  }

  /** Advance one step while paused (the Step button). */
  stepOnce(): void {
    this.particles.update(FLOW_VIEW.stepsPerFrame * 4, 4);
    this.draw();
  }

  // ------------------------------------------------------------ Loop

  /** Start the loop if it isn't running. It stops itself when there's nothing left to animate. */
  private wake(): void {
    if (this.running) return;
    this.running = true;
    this.rafId = requestAnimationFrame(this.frame);
  }

  private frame = (): void => {
    if (this.playing) {
      const s = this.speed;
      this.particles.update(this.simulating ? FLOW_VIEW.stepsPerFrame * s : 0, s);
    }
    this.draw();
    // Keep going while simulating or while any particles/streams exist.
    if (this.simulating || this.particles.particles.length > 0 || this.particles.hasStreams) {
      this.rafId = requestAnimationFrame(this.frame);
    } else {
      this.running = false;
    }
  };

  stop(): void {
    cancelAnimationFrame(this.rafId);
    this.running = false;
  }

  // ------------------------------------------------------------ Drawing

  private resize(): void {
    this.dpr = window.devicePixelRatio || 1;
    const w = Math.round(this.canvas.clientWidth * this.dpr);
    const h = Math.round(this.canvas.clientHeight * this.dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  private draw(): void {
    this.resize();
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const view = this.getView();
    // Draw in room centimetres, like the editor.
    ctx.setTransform(this.dpr * view.scale, 0, 0, this.dpr * view.scale, this.dpr * view.x, this.dpr * view.y);
    const visible = this.showFlowParticles
      ? this.particles.particles
      : this.particles.particles.filter((p) => p.guide || p.ttl !== undefined);
    drawParticles(ctx, visible, view.scale);
  }
}

/**
 * Draw particles with fading trails. Particles are grouped by colour so each
 * fade level is one canvas path per colour: a few dozen calls a frame, not thousands.
 */
export function drawParticles(ctx: CanvasRenderingContext2D, particles: Particle[], scale: number): void {
  const groups = new Map<string, Particle[]>();
  for (const p of particles) {
    const css = p.tint === 'flow' ? PARTICLE_BANDS[bandOf(p.level)].css : TINT_CSS[p.tint];
    let g = groups.get(css);
    if (!g) groups.set(css, (g = []));
    g.push(p);
  }
  ctx.lineCap = 'round';
  ctx.lineWidth = 1.6 / scale;
  // Trails fade towards the tail; align them on their newest point.
  const levels = Math.max(1, ...particles.map((p) => p.trail.length));
  for (let level = 1; level < levels; level++) {
    ctx.globalAlpha = (level / levels) * 0.7;
    for (const [css, group] of groups) {
      ctx.strokeStyle = css;
      ctx.beginPath();
      for (const p of group) {
        const i = p.trail.length - levels + level;
        if (i < 1) continue;
        ctx.moveTo(p.trail[i - 1].x, p.trail[i - 1].y);
        ctx.lineTo(p.trail[i].x, p.trail[i].y);
      }
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 0.95;
  for (const [css, group] of groups) {
    ctx.fillStyle = css;
    ctx.beginPath();
    for (const p of group) {
      // Sparks shrink as they die out.
      const r = (p.ttl !== undefined ? 1.2 + p.ttl * 0.08 : 2.2) / scale;
      ctx.moveTo(p.x + r, p.y);
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    }
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
