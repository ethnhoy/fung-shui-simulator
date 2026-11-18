import { describe, expect, it } from 'vitest';
import { SIM } from '../../src/rules/config';
import { ParticleSystem, type ChiStream } from '../../src/sim/particles';
import { Cell, type RasterGrid } from '../../src/sim/types';

/**
 * A 200 × 200 cm open room on a 5 cm grid (one ring of wall cells), with a
 * solid "bed" block at x 120..180, y 40..160 and a uniform flow (ux, uy) in lattice units.
 */
function room(ux0 = 0, uy0 = 0) {
  const cellCm = 5;
  const nx = 42;
  const ny = 42;
  const n = nx * ny;
  const cells = new Uint8Array(n);
  const floor = new Uint8Array(n);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const x = -5 + (i + 0.5) * cellCm;
      const y = -5 + (j + 0.5) * cellCm;
      const wall = i === 0 || j === 0 || i === nx - 1 || j === ny - 1;
      const bed = x > 120 && x < 180 && y > 40 && y < 160;
      cells[j * nx + i] = wall || bed ? Cell.SOLID : Cell.FLUID;
      floor[j * nx + i] = wall || bed ? 0 : 1;
    }
  }
  const grid: RasterGrid = {
    nx, ny, cellCm, originX: -5, originY: -5, cells, neighbor: new Int32Array(n).fill(-1), floor,
    bedZone: new Uint8Array(n), inletVelocity: { x: 0, y: 0 }, mode: 'normal', roomCorners: [],
  };
  const ux = new Float32Array(n).map((_, k) => (floor[k] ? ux0 : 0));
  const uy = new Float32Array(n).map((_, k) => (floor[k] ? uy0 : 0));
  const chi = new Float32Array(n).map((_, k) => (floor[k] ? Math.hypot(ux0, uy0) : 0));
  const ps = new ParticleSystem();
  ps.setGrid(grid);
  ps.setField(ux, uy);
  ps.setChi(chi);
  return ps;
}

/** A corner at (40, 100) aiming right (+x) at the bed's left side at x = 120. */
const arrow: ChiStream = {
  id: 'arrow', kind: 'arrow', fromA: { x: 40, y: 100 }, fromB: { x: 40, y: 100 }, dir: { x: 1, y: 0 }, length: 80, severity: 0.8,
};

const pushed = (ps: ParticleSystem) => ps.particles.filter((p) => p.pushed);
const dispersing = (ps: ParticleSystem) => ps.particles.filter((p) => p.dispersing);
const steps = 22; // lattice steps per frame at 1× speed

describe('chi pushed at the bed by problems', () => {
  it('shows nothing outside Simulate mode', () => {
    const ps = new ParticleSystem();
    ps.setStreams([arrow]);
    for (let f = 0; f < 50; f++) ps.update(steps, 1);
    expect(ps.particles).toHaveLength(0);
  });

  it('a corner releases red chi that heads for the bed', () => {
    const ps = room();
    ps.setStreams([arrow]);
    // In still air the corner only trickles (about one particle every 18 frames), so wait for one.
    for (let f = 0; f < 100 && pushed(ps).length === 0; f++) ps.update(steps, 1);
    const p = pushed(ps);
    expect(p.length).toBeGreaterThan(0);
    for (const q of p) {
      expect(q.level).toBeGreaterThanOrEqual(0.75); // red end of the chi ramp
      expect(q.x).toBeGreaterThan(40); // moving from the corner towards the bed
    }
  });

  it('pushed chi still bends with the flow instead of moving in a ruler-straight line', () => {
    // Flow drifts downwards (+y) while the corner pushes right.
    const ps = room(0, SIM.inletSpeed * 0.3);
    ps.setStreams([arrow]);
    let bent = false;
    for (let f = 0; f < 150 && !bent; f++) {
      ps.update(steps, 1);
      bent = pushed(ps).some((q) => q.y > 103);
    }
    expect(bent).toBe(true);
  });

  it('hitting the bed, it bounces off and disperses into the room, fading back to the flow colour', () => {
    const ps = room();
    ps.setStreams([arrow]);
    let sawDispersal = false;
    for (let f = 0; f < 120; f++) {
      ps.update(steps, 1);
      const d = dispersing(ps);
      if (d.length) {
        sawDispersal = true;
        // Bounced back out of the bed, never inside it.
        expect(d.every((q) => !(q.x > 120 && q.x < 180 && q.y > 40 && q.y < 160))).toBe(true);
      }
    }
    expect(sawDispersal).toBe(true);
  });

  it('after dispersing, particles join the flow, or fade away if the air is still', () => {
    const run = (speed: number) => {
      const ps = room(0, speed);
      ps.setStreams([arrow]);
      // Most particles recovered (back to normal flow) at any moment during the run.
      let most = 0;
      for (let f = 0; f < 200; f++) {
        ps.update(steps, 1);
        most = Math.max(most, ps.particles.filter((q) => q.catchableFromAge !== undefined && !q.dispersing && !q.pushed).length);
      }
      return most;
    };
    expect(run(SIM.inletSpeed * 0.3)).toBeGreaterThan(0); // moving air: they carry on with the flow
    expect(run(0)).toBe(0); // still air: they settle and disappear rather than piling up
  });

  it('a stream is fed by the flow: more chi around the corner, more pushed particles', () => {
    const count = (speed: number) => {
      const ps = room(0, speed);
      ps.setStreams([arrow]);
      for (let f = 0; f < 40; f++) ps.update(steps, 1);
      return pushed(ps).length + dispersing(ps).length;
    };
    expect(count(SIM.inletSpeed)).toBeGreaterThan(count(0));
  });

  it('flow particles that drift into a corner’s aim get pushed at the bed', () => {
    // Still air keeps the test particle inside the aim; catching is random, so give it time.
    const ps = room();
    // No trickle needed: place an ordinary flow particle just in front of the corner.
    ps.setStreams([{ ...arrow, id: 'catch' }]);
    ps.particles.push({ x: 60, y: 99, age: 0, trail: [{ x: 60, y: 99 }], level: 0.2, tint: 'flow' });
    // Catching is random per frame; while it sits inside the aim it is caught within a few frames.
    const tracked = ps.particles[ps.particles.length - 1];
    // (8% a frame: over 110 frames a miss is under 1 in 10,000; still-air particles only fade after 120.)
    for (let f = 0; f < 110 && !tracked.pushed; f++) ps.update(steps, 1);
    expect(tracked.pushed).toBeDefined();
  });

  it('a mirror pushes chi straight out from its face', () => {
    const ps = room();
    const mirror: ChiStream = {
      id: 'mirror', kind: 'mirror', fromA: { x: 40, y: 80 }, fromB: { x: 40, y: 120 }, dir: { x: 1, y: 0 }, length: 80, severity: 1,
    };
    ps.setStreams([mirror]);
    for (let f = 0; f < 15; f++) ps.update(steps, 1);
    const p = pushed(ps);
    expect(p.length).toBeGreaterThan(0);
    expect(p.every((q) => q.y >= 78 && q.y <= 122)).toBe(true); // stays within the reflection
  });

  it('removing a problem lets its pushed particles rejoin the normal flow', () => {
    const ps = room();
    ps.setStreams([arrow]);
    for (let f = 0; f < 15; f++) ps.update(steps, 1);
    ps.setStreams([]);
    expect(pushed(ps)).toHaveLength(0);
  });
});

describe('no ping-pong', () => {
  it('a particle that just bounced off the bed is not caught again straight away', () => {
    const ps = room(0, SIM.inletSpeed * 0.3);
    ps.setStreams([arrow]);
    // While particles bounce and recover, none of them is caught again before its cooldown ends.
    let seen = 0;
    for (let f = 0; f < 200; f++) {
      ps.update(steps, 1);
      const recovered = ps.particles.filter((q) => q.catchableFromAge !== undefined && !q.dispersing);
      seen += recovered.length;
      expect(recovered.every((q) => !q.pushed || q.age >= q.catchableFromAge!)).toBe(true);
    }
    expect(seen).toBeGreaterThan(0);
  });
});

describe('still air', () => {
  it('flow particles that stop moving fade away instead of piling up', () => {
    const ps = room(); // no flow at all
    ps.particles.push({ x: 60, y: 60, age: 0, trail: [{ x: 60, y: 60 }], level: 0, tint: 'flow' });
    for (let f = 0; f < 200; f++) ps.update(steps, 1);
    expect(ps.particles.some((q) => q.trail[0].x === 60 && !q.pushed)).toBe(false);
  });
});
