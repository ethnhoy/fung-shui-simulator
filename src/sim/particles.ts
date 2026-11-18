/**
 * Particles with fading trails, shown in Simulate mode.
 *
 * Every particle is chi from the door, drifting with the solver's velocity
 * field like smoke in a wind tunnel. Problem streams from the rule engine
 * (poison arrows from sharp corners, mirrors reflecting onto the bed) act on
 * that same flow:
 *
 *   1. FLOW       a normal particle, carried by the velocity field.
 *   2. PUSHED     it drifted into a corner's aim or a mirror's reflection, so on
 *                 top of the flow it is pushed towards the bed and turns red
 *                 (cutting sha chi). Its path still bends with the flow.
 *   3. DISPERSING it hit the bed and bounced off, fanning out into the room and
 *                 fading back to the normal flow colour, then becomes FLOW again.
 *
 * A corner or mirror in very still air would catch almost nothing, so it also
 * releases a small trickle of its own, in proportion to the chi around it.
 *
 * The coffin line is different: chi drains straight from the foot of the bed
 * out of the door, so those particles follow a fixed path (GUIDED).
 *
 * Positions are in room centimetres; "frames" are animation frames at 1× speed.
 */
import type { Point } from '../model/types';
import { add, dist, dot, normalize, rotate, scale, sub } from '../geometry/vec';
import { FLOW_VIEW, SIM } from '../rules/config';
import { sampleVelocity } from './field';
import { cellIndexAt } from './rasterise';
import { Cell, type RasterGrid } from './types';

export type StreamKind = 'arrow' | 'mirror' | 'coffin';

/** A problem that acts on the chi flow. */
export interface ChiStream {
  id: string;
  kind: StreamKind;
  /** Where it starts: a corner point (fromA = fromB) or a mirror's face (fromA–fromB). */
  fromA: Point;
  fromB: Point;
  /** Unit direction it aims, and how far it reaches (cm). */
  dir: Point;
  length: number;
  /** 0..1: how bad the problem is (closer, more direct corners are more severe). */
  severity: number;
}

/** Colour family: most particles use the chi colour ramp; the coffin line has its own tint. */
export type Tint = 'flow' | 'coffin';

interface Guide {
  streamId: string;
  origin: Point;
  dir: Point;
  length: number;
  travelled: number;
  speed: number;
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
  /** Being pushed at the bed by a corner or mirror. */
  pushed?: { streamId: string; kind: StreamKind; push: number; framesLeft: number; level: number };
  /** Bounced off the bed and spreading back into the room. */
  dispersing?: { kick: Point; framesLeft: number; fromLevel: number };
  /** Coffin-line particles follow a fixed path out of the door. */
  guide?: Guide;
  /** After bouncing off the bed a particle can't be caught again until this age (no ping-pong). */
  catchableFromAge?: number;
  /** How many frames in a row it has been sitting in still air. */
  stillFrames?: number;
}

/** Tuning, per animation frame at 1× speed. */
const STREAM = {
  /** Own trickle released at the source, particles per frame at full strength. */
  trickle: { arrow: 0.22, mirror: 0.3, coffin: 0.3 },
  /** How much of the flow still moves pushed chi (the rest is replaced by the push). */
  pushedFlowShare: 0.4,
  /** Push towards the bed (cm per frame) on top of the flow, at full strength. */
  push: { arrow: 2.2, mirror: 1.6 },
  /** Coffin-line speed, base + extra × strength (cm per frame). */
  coffinSpeed: [0.8, 0.6] as [number, number],
  /** Even in still air a problem keeps a faint trickle so it stays visible. */
  minStrength: 0.25,
  /** A corner's aim is a cone this wide (half-angle, degrees) for catching passing chi. */
  catchHalfAngleDeg: 18,
  /**
   * Chance per frame that a flow particle inside a corner's aim or a mirror's reflection
   * gets caught. Particles spend several frames crossing a zone, so about half get caught.
   */
  catchChance: 0.08,
  /** Pushed particles give up after this many frames if they never reach the bed. */
  maxPushFrames: 240,
  /** Dispersal: how long, how fast, and how many extra particles splash off the bed. */
  disperseFrames: 30,
  disperseSpeed: 1.8,
  disperseDecay: 0.9,
  splashExtra: 1,
  /** After dispersing, particles in air slower than this chi level (fraction of door speed) fade away. */
  settleBelowLevel: 0.12,
  /** Flow particles in still air (below this level) for this many frames fade away rather than piling up. */
  stillLevel: 0.05,
  maxStillFrames: 120,
  /** Frames after bouncing off the bed before a particle can be caught by a problem again. */
  catchCooldown: 200,
  maxPushed: 200,
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

  /** Is there a flow field to follow? (Simulate mode, once the solver has sent a frame.) */
  private get flowing(): boolean {
    return !!(this.grid && this.ux && this.uy);
  }

  get hasStreams(): boolean {
    return this.streams.length > 0;
  }

  /** Start following a new grid (null = not simulating). All particles are cleared. */
  setGrid(grid: RasterGrid | null): void {
    this.grid = grid;
    this.ux = this.uy = this.chi = null;
    this.particles = [];
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

  /** The spread-out chi field: colours particles like the heatmap and sets how strong each stream is. */
  setChi(chi: Float32Array): void {
    this.chi = chi;
  }

  /** Replace the problem streams. Particles tied to streams that no longer exist go back to normal flow. */
  setStreams(streams: ChiStream[]): void {
    this.streams = streams;
    const ids = new Set(streams.map((s) => s.id));
    this.particles = this.particles.filter((p) => !p.guide || ids.has(p.guide.streamId));
    for (const p of this.particles) if (p.pushed && !ids.has(p.pushed.streamId)) p.pushed = undefined;
    for (const id of [...this.streamBudget.keys()]) if (!ids.has(id)) this.streamBudget.delete(id);
  }

  clear(): void {
    this.particles = [];
  }

  /** Advance one animation frame: `steps` lattice steps of flow, `frames` frames of pushing (both scale with speed). */
  update(steps: number, frames: number): void {
    if (!this.flowing || steps <= 0) return;
    this.emitFlow(steps / FLOW_VIEW.stepsPerFrame);
    this.emitStreams(frames);
    const alive: Particle[] = [];
    for (const p of this.particles) {
      const keep = p.guide ? this.moveGuided(p, frames) : this.move(p, steps, frames, alive);
      if (keep) alive.push(p);
    }
    this.particles = alive;
  }

  // ------------------------------------------------------------ Moving with the flow (plus push / dispersal)

  private move(p: Particle, steps: number, frames: number, alive: Particle[]): boolean {
    const grid = this.grid!;
    const ux = this.ux!;
    const uy = this.uy!;
    const cell = grid.cellCm;

    const v0 = sampleVelocity(grid, ux, uy, p);
    // Pushed chi still bends with the flow, but only partly, so the flow can't sweep it past the bed.
    const flowSteps = p.pushed ? steps * STREAM.pushedFlowShare : steps;

    // Extra motion on top of the flow for this frame (cm).
    let extra = { x: 0, y: 0 };
    if (p.pushed) {
      const s = this.streams.find((x) => x.id === p.pushed!.streamId);
      // The push is a base speed plus the local flow speed: in fast air it pushes harder.
      const flowCmPerFrame = Math.hypot(v0.x, v0.y) * cell * steps;
      if (s) extra = scale(this.pushDirection(s, p), p.pushed.push * frames + flowCmPerFrame);
    } else if (p.dispersing) {
      extra = scale(p.dispersing.kick, frames);
    }

    // Move in sub-steps so nothing jumps more than half a cell (it would skip through walls).
    const travelCells = Math.hypot(v0.x, v0.y) * flowSteps + Math.hypot(extra.x, extra.y) / cell;
    const subSteps = Math.max(1, Math.ceil(travelCells / 0.5));
    const h = flowSteps / subSteps;
    for (let s = 0; s < subSteps; s++) {
      // Midpoint method (RK2) for the flow, plus an equal share of the extra motion.
      const a = sampleVelocity(grid, ux, uy, p);
      const mid = { x: p.x + a.x * cell * h * 0.5, y: p.y + a.y * cell * h * 0.5 };
      const b = sampleVelocity(grid, ux, uy, mid);
      const next = { x: p.x + b.x * cell * h + extra.x / subSteps, y: p.y + b.y * cell * h + extra.y / subSteps };
      const k = cellIndexAt(grid, next);
      const type = k < 0 ? Cell.SOLID : grid.cells[k];
      if (type === Cell.OUTLET) return false; // left through a window or door
      if (type === Cell.SOLID) {
        // A pushed particle hitting the bed (or anything in its way) bounces off and disperses.
        if (p.pushed) {
          this.disperse(p, alive);
          break;
        }
        if (p.dispersing) {
          p.dispersing.kick = { x: 0, y: 0 }; // bumped into something while spreading: just stop the kick
          break;
        }
        return false; // a normal particle drifting into a wall or furniture
      }
      p.x = next.x;
      p.y = next.y;
    }

    p.age++;
    if (p.age > FLOW_VIEW.maxAge) return false;
    const flowLevel = this.levelAt(p);

    if (p.pushed) {
      p.pushed.framesLeft -= frames;
      p.level = p.pushed.level;
      if (p.pushed.framesLeft <= 0) p.pushed = undefined; // never reached the bed: rejoin the flow
    } else if (p.dispersing) {
      const d = p.dispersing;
      d.framesLeft -= frames;
      d.kick = scale(d.kick, Math.pow(STREAM.disperseDecay, frames));
      // Fade from the red of the arrow back to the flow's own colour.
      const t = Math.max(0, d.framesLeft) / STREAM.disperseFrames;
      p.level = flowLevel + (d.fromLevel - flowLevel) * t;
      if (d.framesLeft <= 0) {
        p.dispersing = undefined;
        // Bounced into still air with no flow to join: let it settle and fade away instead of piling up.
        if (flowLevel < STREAM.settleBelowLevel) return false;
      }
    } else {
      p.level = flowLevel;
      // Chi that has come to a standstill (e.g. no way out of the room) settles and fades away.
      p.stillFrames = flowLevel < STREAM.stillLevel ? (p.stillFrames ?? 0) + frames : 0;
      if (p.stillFrames > STREAM.maxStillFrames) return false;
      this.maybeCatch(p);
    }
    this.pushTrail(p);
    return true;
  }

  /** Chi level at a point: the spread-out chi field, or local speed if there's no field yet. */
  private levelAt(p: Point): number {
    const grid = this.grid!;
    const v = sampleVelocity(grid, this.ux!, this.uy!, p);
    const k = cellIndexAt(grid, p);
    const value = this.chi && k >= 0 ? Math.max(this.chi[k], Math.hypot(v.x, v.y)) : Math.hypot(v.x, v.y);
    return value / SIM.inletSpeed;
  }

  /** Which way a stream pushes a particle: corners aim at the point they hit; mirrors reflect straight out. */
  private pushDirection(s: ChiStream, p: Point): Point {
    if (s.kind === 'mirror') return s.dir;
    // Aim a little past the point where the corner's line meets the bed, so particles
    // actually touch the bed instead of hovering at its surface.
    const target = add(s.fromA, scale(s.dir, s.length + 10));
    return normalize(sub(target, p));
  }

  /** Bounce off the bed: this particle and a couple of extras fan out back into the room. */
  private disperse(p: Particle, alive: Particle[]): void {
    const s = this.streams.find((x) => x.id === p.pushed!.streamId);
    const back = s ? scale(this.pushDirection(s, p), -1) : { x: 0, y: -1 };
    const fromLevel = p.pushed!.level;
    p.pushed = undefined;
    const kick = () => {
      // Back the way it came, spread over a wide fan (±80°), at a slightly random speed.
      const angle = (Math.random() - 0.5) * 160;
      return scale(rotate(back, angle), STREAM.disperseSpeed * (0.6 + Math.random() * 0.6));
    };
    p.dispersing = { kick: kick(), framesLeft: STREAM.disperseFrames, fromLevel };
    p.catchableFromAge = p.age + STREAM.catchCooldown;
    if (this.pushedCount() + STREAM.splashExtra > STREAM.maxPushed * 1.5) return;
    for (let i = 0; i < STREAM.splashExtra; i++) {
      alive.push({
        x: p.x, y: p.y, age: 0, trail: [{ x: p.x, y: p.y }], level: fromLevel, tint: 'flow',
        dispersing: { kick: kick(), framesLeft: STREAM.disperseFrames * 0.7, fromLevel },
        catchableFromAge: STREAM.catchCooldown,
      });
    }
  }

  /** A flow particle that drifts into a corner's aim or a mirror's reflection gets pushed at the bed. */
  private maybeCatch(p: Particle): void {
    if (p.catchableFromAge !== undefined && p.age < p.catchableFromAge) return;
    if (this.pushedCount() >= STREAM.maxPushed) return;
    for (const s of this.streams) {
      if (s.kind === 'coffin' || !this.inZone(s, p)) continue;
      if (Math.random() < STREAM.catchChance) this.push(p, s);
      return;
    }
  }

  private inZone(s: ChiStream, p: Point): boolean {
    if (s.kind === 'mirror') {
      // Inside the mirror's reflection: in front of the glass, within its width.
      const mid = scale(add(s.fromA, s.fromB), 0.5);
      const rel = sub(p, mid);
      const ahead = dot(rel, s.dir);
      const across = Math.abs(dot(rel, { x: -s.dir.y, y: s.dir.x }));
      return ahead > 2 && ahead < s.length - 5 && across < dist(s.fromA, s.fromB) / 2;
    }
    // Inside the corner's aim: a narrow cone from the corner, short of the bed.
    const rel = sub(p, s.fromA);
    const ahead = dot(rel, s.dir);
    if (ahead < 3 || ahead > s.length - 5) return false;
    const cos = ahead / Math.hypot(rel.x, rel.y);
    return cos > Math.cos((STREAM.catchHalfAngleDeg * Math.PI) / 180);
  }

  private push(p: Particle, s: ChiStream): void {
    const strength = this.strength(s);
    p.pushed = {
      streamId: s.id,
      kind: s.kind,
      push: STREAM.push[s.kind as 'arrow' | 'mirror'] * (0.5 + 0.5 * strength),
      framesLeft: STREAM.maxPushFrames,
      // Cutting chi is red; closer, more direct corners are redder.
      level: s.kind === 'arrow' ? 0.75 + 0.3 * s.severity : 0.95,
    };
    p.dispersing = undefined;
  }

  private pushedCount(): number {
    let n = 0;
    for (const p of this.particles) if (p.pushed || p.dispersing) n++;
    return n;
  }

  // ------------------------------------------------------------ Emission

  /** Release new flow particles at the door, in proportion to the doorway width. */
  private emitFlow(frameFraction: number): void {
    if (!this.spawnPoints.length || !this.grid) return;
    const widthMetres = (this.spawnPoints.length * this.grid.cellCm) / 100;
    this.spawnBudget += FLOW_VIEW.emitPerMetre * widthMetres * frameFraction;
    const jitter = this.grid.cellCm;
    let room = FLOW_VIEW.maxParticles - this.particles.length;
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

  /** How strongly a problem acts: fed by the chi around its source. */
  private strength(s: ChiStream): number {
    if (!this.chi) return STREAM.minStrength;
    const source = add(scale(add(s.fromA, s.fromB), 0.5), scale(s.dir, 6));
    const k = cellIndexAt(this.grid!, source);
    const level = k >= 0 ? this.chi[k] / SIM.inletSpeed : 0;
    return Math.max(STREAM.minStrength, Math.min(1, level));
  }

  /** Each problem's own trickle (and the coffin line), in proportion to its strength. */
  private emitStreams(frames: number): void {
    for (const s of this.streams) {
      const strength = this.strength(s);
      let budget = (this.streamBudget.get(s.id) ?? Math.random()) + STREAM.trickle[s.kind] * strength * frames;
      while (budget >= 1) {
        budget -= 1;
        if (this.pushedCount() >= STREAM.maxPushed) {
          budget = 0;
          break;
        }
        const start = add(s.fromA, scale(sub(s.fromB, s.fromA), Math.random()));
        const p: Particle = { x: start.x, y: start.y, age: 0, trail: [{ ...start }], level: 1, tint: 'flow' };
        if (s.kind === 'coffin') {
          const [base, extra] = STREAM.coffinSpeed;
          p.tint = 'coffin';
          p.level = 0.5;
          p.guide = { streamId: s.id, origin: { ...start }, dir: s.dir, length: s.length, travelled: 0, speed: base + extra * strength };
        } else {
          // Start just in front of the corner/mirror so it doesn't begin inside the furniture.
          const nudged = add(start, scale(s.dir, 2));
          p.x = nudged.x;
          p.y = nudged.y;
          p.trail = [{ ...nudged }];
          this.push(p, s);
        }
        this.particles.push(p);
      }
      this.streamBudget.set(s.id, budget);
    }
  }

  // ------------------------------------------------------------ Coffin line

  /** Chi draining from the foot of the bed straight out of the door. */
  private moveGuided(p: Particle, frames: number): boolean {
    const g = p.guide!;
    g.travelled += g.speed * frames;
    const pos = add(g.origin, scale(g.dir, Math.min(g.travelled, g.length)));
    p.x = pos.x;
    p.y = pos.y;
    p.age++;
    this.pushTrail(p);
    return g.travelled < g.length;
  }

  private pushTrail(p: Particle): void {
    p.trail.push({ x: p.x, y: p.y });
    if (p.trail.length > FLOW_VIEW.trailLength) p.trail.shift();
  }
}
