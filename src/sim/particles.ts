/**
 * Particles with fading trails, for two kinds of motion:
 *
 * 1. FLOW particles (Simulate mode): released at the door, they drift with the
 *    solver's velocity field like smoke in a wind tunnel.
 *
 * 2. STREAM particles (both modes): small jets of chi along a "problem" path
 *    from the rule engine: cutting chi from a sharp corner to the bed (poison
 *    arrow), chi bouncing off a mirror onto the bed, or chi draining from the
 *    foot of the bed out of the door (coffin position).
 *
 * In Simulate mode the two are connected:
 *  - a stream is fed by the flow: the more chi around its source, the stronger it is;
 *  - flow particles drifting past a sharp corner or a mirror can get caught and
 *    redirected along the stream;
 *  - stream particles that reach the bed are released back into the flow.
 *
 * Positions are in room centimetres.
 */
import type { Point } from '../model/types';
import { add, dist, dot, normalize, scale, sub } from '../geometry/vec';
import { FLOW_VIEW, SIM } from '../rules/config';
import { sampleVelocity } from './field';
import { cellIndexAt } from './rasterise';
import { Cell, type RasterGrid } from './types';

export type StreamKind = 'arrow' | 'mirror' | 'coffin';

/** A problem path that chi streams along. */
export interface ChiStream {
  id: string;
  kind: StreamKind;
  /** Particles start somewhere on the segment fromA–fromB (a single point if they're equal). */
  fromA: Point;
  fromB: Point;
  /** Unit direction of travel and how far the stream reaches (cm). */
  dir: Point;
  length: number;
  /** 0..1: how bad the problem is (closer corners are more severe). */
  severity: number;
}

/** Colour family: flow, arrow and mirror particles use the chi colour ramp; coffin streams have their own tint. */
export type Tint = 'flow' | 'coffin';

interface Guide {
  streamId: string;
  kind: StreamKind;
  origin: Point;
  dir: Point;
  length: number;
  travelled: number;
  /** cm per animation frame */
  speed: number;
  /** For a gentle sideways wobble, so streams look alive rather than ruler-straight. */
  phase: number;
}

export interface Particle {
  x: number;
  y: number;
  age: number;
  /** Recent positions, oldest first, for drawing the trail. */
  trail: Point[];
  /** Chi level as a fraction of the reference speed (0 = still, 1 = door speed). Sets the colour. */
  level: number;
  tint: Tint;
  /** Set while the particle follows a problem stream instead of the flow field. */
  guide?: Guide;
  /** Sparks: short-lived splashes where a poison arrow hits. Frames left to live. */
  ttl?: number;
  spark?: Point;
}

/** Stream tuning (per animation frame at 1× speed). */
const STREAM = {
  /** Particles released per frame at full strength. */
  rate: { arrow: 0.38, mirror: 0.45, coffin: 0.3 },
  /** Base and extra speed (cm per frame), the extra scaled by strength. */
  speed: { arrow: [1.8, 1.8], mirror: [1.3, 1.0], coffin: [0.8, 0.6] } as Record<StreamKind, [number, number]>,
  /** Strength used when there's no simulation (Edit mode). */
  defaultStrength: 0.6,
  /** Even in stagnant air a problem still shows a steady trickle. */
  minStrength: 0.4,
  /** Flow particles closer than this to a corner or mirror may get caught (cm). */
  captureRadius: 14,
  /** Chance per frame of being caught, at full strength. */
  captureChance: 0.08,
  maxGuided: 180,
  wobbleCm: 1.6,
};

export class ParticleSystem {
  particles: Particle[] = [];
  private spawnPoints: Point[] = [];
  private spawnBudget = 0;
  private grid: RasterGrid | null = null;
  private ux: Float32Array | null = null;
  private uy: Float32Array | null = null;
  private chi: Float32Array | null = null;
  private streams: ChiStream[] = [];
  private streamBudget = new Map<string, number>();

  /** Is there a flow field to follow? (Only in Simulate mode, once the solver has sent a frame.) */
  private get flowing(): boolean {
    return !!(this.grid && this.ux && this.uy);
  }

  /** Start following a new grid (or none, in Edit mode). Flow particles are cleared; streams carry on. */
  setGrid(grid: RasterGrid | null): void {
    this.grid = grid;
    this.ux = this.uy = this.chi = null;
    this.particles = this.particles.filter((p) => p.guide || p.ttl !== undefined);
    // Flow particles are born in the first room cell inside each inlet cell.
    this.spawnPoints = [];
    grid?.cells.forEach((c, k) => {
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

  /** The spread-out chi field, used to colour flow particles like the heatmap and to feed streams. */
  setChi(chi: Float32Array): void {
    this.chi = chi;
  }

  /** Replace the problem streams. Particles on streams that no longer exist disappear. */
  setStreams(streams: ChiStream[]): void {
    this.streams = streams;
    const ids = new Set(streams.map((s) => s.id));
    this.particles = this.particles.filter((p) => !p.guide || ids.has(p.guide.streamId));
    for (const id of [...this.streamBudget.keys()]) if (!ids.has(id)) this.streamBudget.delete(id);
  }

  get hasStreams(): boolean {
    return this.streams.length > 0;
  }

  /** Remove flow particles (e.g. Reset); streams keep running. */
  clearFlow(): void {
    this.particles = this.particles.filter((p) => p.guide || p.ttl !== undefined);
  }

  /**
   * Advance everything one animation frame.
   * @param flowSteps lattice steps of flow motion (0 when paused or not simulating)
   * @param streamFrames how many frames' worth of stream motion (0 when paused)
   */
  update(flowSteps: number, streamFrames: number): void {
    if (this.flowing && flowSteps > 0) this.emitFlow(flowSteps / FLOW_VIEW.stepsPerFrame);
    if (streamFrames > 0) this.emitStreams(streamFrames);

    const alive: Particle[] = [];
    for (const p of this.particles) {
      let keep: boolean;
      if (p.ttl !== undefined) keep = streamFrames > 0 ? this.moveSpark(p, streamFrames) : true;
      else if (p.guide) keep = streamFrames > 0 ? this.moveGuided(p, streamFrames, alive) : true;
      else keep = this.flowing && flowSteps > 0 ? this.moveWithFlow(p, flowSteps, streamFrames) : this.flowing;
      if (keep) alive.push(p);
    }
    this.particles = alive;
  }

  // ------------------------------------------------------------ Flow particles

  private moveWithFlow(p: Particle, steps: number, streamFrames: number): boolean {
    const grid = this.grid!;
    const ux = this.ux!;
    const uy = this.uy!;
    const cell = grid.cellCm;
    // Move in a few sub-steps so a fast particle never jumps more than half a cell (it would skip walls).
    const v0 = sampleVelocity(grid, ux, uy, p);
    const travel = Math.hypot(v0.x, v0.y) * steps; // in cells
    const subSteps = Math.max(1, Math.ceil(travel / 0.5));
    const h = steps / subSteps;
    for (let s = 0; s < subSteps; s++) {
      // Midpoint method (RK2): look ahead half a step for a smoother, more accurate curve.
      const a = sampleVelocity(grid, ux, uy, p);
      const mid = { x: p.x + a.x * cell * h * 0.5, y: p.y + a.y * cell * h * 0.5 };
      const b = sampleVelocity(grid, ux, uy, mid);
      p.x += b.x * cell * h;
      p.y += b.y * cell * h;
      const k = cellIndexAt(grid, p);
      const type = k < 0 ? Cell.SOLID : grid.cells[k];
      // Leaves through a window/door, hits furniture, or slips into a wall: remove it.
      if (type === Cell.SOLID || type === Cell.OUTLET) return false;
    }
    p.age++;
    if (p.age > FLOW_VIEW.maxAge) return false;
    const v = sampleVelocity(grid, ux, uy, p);
    const k = cellIndexAt(grid, p);
    // Colour by the chi field where we have it (matches the heatmap), else by local speed.
    const value = this.chi && k >= 0 ? Math.max(this.chi[k], Math.hypot(v.x, v.y)) : Math.hypot(v.x, v.y);
    p.level = value / SIM.inletSpeed;
    this.pushTrail(p);
    if (streamFrames > 0) this.maybeCapture(p, streamFrames);
    return true;
  }

  /** Release new flow particles at the door, in proportion to the doorway width. */
  private emitFlow(frameFraction: number): void {
    if (!this.spawnPoints.length || !this.grid) return;
    const widthMetres = (this.spawnPoints.length * this.grid.cellCm) / 100;
    this.spawnBudget += FLOW_VIEW.emitPerMetre * widthMetres * frameFraction;
    const jitter = this.grid.cellCm;
    const flowCount = this.particles.filter((p) => !p.guide && p.ttl === undefined).length;
    let room = FLOW_VIEW.maxParticles - flowCount;
    while (this.spawnBudget >= 1 && room > 0) {
      this.spawnBudget -= 1;
      room--;
      const sp = this.spawnPoints[Math.floor(Math.random() * this.spawnPoints.length)];
      const x = sp.x + (Math.random() - 0.5) * jitter;
      const y = sp.y + (Math.random() - 0.5) * jitter;
      this.particles.push({ x, y, age: 0, trail: [{ x, y }], level: 1, tint: 'flow' });
    }
    if (room <= 0) this.spawnBudget = 0;
  }

  // ------------------------------------------------------------ Streams

  /** How strongly a stream runs: fed by the chi around its source (or a default without a simulation). */
  private strength(s: ChiStream): number {
    if (!this.flowing || !this.chi) return STREAM.defaultStrength;
    const source = add(scale(add(s.fromA, s.fromB), 0.5), scale(s.dir, 6));
    const k = cellIndexAt(this.grid!, source);
    const level = k >= 0 ? this.chi[k] / SIM.inletSpeed : 0;
    return Math.max(STREAM.minStrength, Math.min(1, level));
  }

  private guidedCount(): number {
    return this.particles.filter((p) => p.guide).length;
  }

  private emitStreams(frames: number): void {
    let room = STREAM.maxGuided - this.guidedCount();
    for (const s of this.streams) {
      const strength = this.strength(s);
      const budget = (this.streamBudget.get(s.id) ?? Math.random()) + STREAM.rate[s.kind] * strength * frames;
      let left = budget;
      while (left >= 1 && room > 0) {
        left -= 1;
        room--;
        const start = add(s.fromA, scale(sub(s.fromB, s.fromA), Math.random()));
        this.particles.push(this.makeGuided(start, s, s.length, strength, []));
      }
      this.streamBudget.set(s.id, room > 0 ? left : 0);
    }
  }

  private makeGuided(start: Point, s: ChiStream, length: number, strength: number, trail: Point[]): Particle {
    const [base, extra] = STREAM.speed[s.kind];
    return {
      x: start.x,
      y: start.y,
      age: 0,
      trail: trail.length ? trail : [{ ...start }],
      // Poison arrows are cutting sha chi: orange to red depending on how close the corner is.
      // Poison arrows and mirror reflections are harmful sha chi, so both are red on the chi ramp
      // (arrows from closer corners are redder).
      level: s.kind === 'arrow' ? 0.72 + 0.3 * s.severity : s.kind === 'mirror' ? 0.95 : 0.5,
      tint: s.kind === 'coffin' ? 'coffin' : 'flow',
      guide: {
        streamId: s.id,
        kind: s.kind,
        origin: { ...start },
        dir: s.dir,
        length,
        travelled: 0,
        speed: base + extra * strength,
        phase: Math.random() * Math.PI * 2,
      },
    };
  }

  /** Move along the stream; at the end, splash (arrows) and hand the particle back to the flow. */
  private moveGuided(p: Particle, frames: number, alive: Particle[]): boolean {
    const g = p.guide!;
    g.travelled += g.speed * frames;
    const t = Math.min(g.travelled, g.length);
    // A gentle sideways wobble that fades out near both ends.
    const side = { x: -g.dir.y, y: g.dir.x };
    const envelope = Math.sin((Math.PI * t) / Math.max(1, g.length));
    const wobble = Math.sin(g.phase + t * 0.15) * STREAM.wobbleCm * envelope;
    const pos = add(add(g.origin, scale(g.dir, t)), scale(side, wobble));
    p.x = pos.x;
    p.y = pos.y;
    p.age++;
    this.pushTrail(p);
    if (g.travelled < g.length) return true;

    // Reached the end of the stream.
    if (g.kind === 'arrow') this.splash(p, alive);
    if (g.kind !== 'coffin' && this.flowing) {
      // Step back out of the bed into open floor and rejoin the room's flow.
      const back = sub(p, scale(g.dir, this.grid!.cellCm));
      const k = cellIndexAt(this.grid!, back);
      if (k >= 0 && this.grid!.floor[k]) {
        p.x = back.x;
        p.y = back.y;
        p.guide = undefined;
        p.tint = 'flow';
        p.age = 0;
        return true;
      }
    }
    return false; // in Edit mode (or out of the door) it simply fades away
  }

  /** A few short-lived sparks where a poison arrow hits. */
  private splash(p: Particle, alive: Particle[]): void {
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = 0.6 + Math.random() * 0.8;
      alive.push({
        x: p.x, y: p.y, age: 0, trail: [{ x: p.x, y: p.y }], level: p.level, tint: 'flow',
        ttl: 10 + Math.floor(Math.random() * 8), spark: { x: Math.cos(a) * speed, y: Math.sin(a) * speed },
      });
    }
  }

  private moveSpark(p: Particle, frames: number): boolean {
    p.x += p.spark!.x * frames;
    p.y += p.spark!.y * frames;
    p.spark = scale(p.spark!, 0.88); // slow down
    p.ttl! -= frames;
    this.pushTrail(p);
    return p.ttl! > 0;
  }

  /** A flow particle passing close to a sharp corner or a mirror may get caught and sent at the bed. */
  private maybeCapture(p: Particle, frames: number): void {
    if (this.guidedCount() >= STREAM.maxGuided) return;
    for (const s of this.streams) {
      if (s.kind === 'coffin') continue;
      const mid = scale(add(s.fromA, s.fromB), 0.5);
      const halfWidth = dist(s.fromA, s.fromB) / 2;
      const rel = sub(p, mid);
      const ahead = dot(rel, s.dir); // how far in front of the corner/mirror
      const across = Math.abs(dot(rel, { x: -s.dir.y, y: s.dir.x }));
      const near = ahead > -4 && ahead < STREAM.captureRadius && across < halfWidth + STREAM.captureRadius;
      if (!near || Math.random() > STREAM.captureChance * this.strength(s) * frames) continue;
      // Send it from where it is to the stream's end point.
      const target = add(add(mid, scale(s.dir, s.length)), sub(p, add(mid, scale(s.dir, ahead))));
      const length = dist(p, target);
      if (length < 10) continue;
      const caught = this.makeGuided({ x: p.x, y: p.y }, { ...s, dir: normalize(sub(target, p)) }, length, this.strength(s), p.trail);
      Object.assign(p, caught);
      return;
    }
  }

  private pushTrail(p: Particle): void {
    p.trail.push({ x: p.x, y: p.y });
    if (p.trail.length > FLOW_VIEW.trailLength) p.trail.shift();
  }
}
