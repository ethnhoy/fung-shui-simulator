import { describe, expect, it } from 'vitest';
import { SIM } from '../../src/rules/config';
import { ParticleSystem, type ChiStream } from '../../src/sim/particles';
import { Cell, type RasterGrid } from '../../src/sim/types';

/** A 100 × 100 cm open room on a 5 cm grid (one ring of wall cells), with uniform flow to the right. */
function openGrid(speed = 0): { grid: RasterGrid; ux: Float32Array; uy: Float32Array; chi: Float32Array } {
  const nx = 22;
  const ny = 22;
  const n = nx * ny;
  const cells = new Uint8Array(n);
  const floor = new Uint8Array(n);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const edge = i === 0 || j === 0 || i === nx - 1 || j === ny - 1;
      cells[j * nx + i] = edge ? Cell.SOLID : Cell.FLUID;
      floor[j * nx + i] = edge ? 0 : 1;
    }
  }
  const grid: RasterGrid = {
    nx, ny, cellCm: 5, originX: -5, originY: -5, cells, neighbor: new Int32Array(n).fill(-1), floor,
    bedZone: new Uint8Array(n), inletVelocity: { x: 0, y: 0 }, mode: 'normal', roomCorners: [],
  };
  const ux = new Float32Array(n).map((_, k) => (floor[k] ? speed : 0));
  return { grid, ux, uy: new Float32Array(n), chi: ux.slice() };
}

const arrow: ChiStream = {
  id: 'arrow-1', kind: 'arrow', fromA: { x: 10, y: 50 }, fromB: { x: 10, y: 50 }, dir: { x: 1, y: 0 }, length: 60, severity: 0.8,
};

const guided = (ps: ParticleSystem) => ps.particles.filter((p) => p.guide);

describe('problem streams', () => {
  it('releases particles at the source that travel towards the target (Edit mode)', () => {
    const ps = new ParticleSystem();
    ps.setStreams([arrow]);
    for (let f = 0; f < 15; f++) ps.update(0, 1);
    const g = guided(ps);
    expect(g.length).toBeGreaterThan(0);
    for (const p of g) {
      expect(p.x).toBeGreaterThan(10); // moved along +x from the corner
      expect(p.x).toBeLessThanOrEqual(70.01);
      expect(Math.abs(p.y - 50)).toBeLessThan(3); // only a gentle wobble sideways
      expect(p.trail.length).toBeGreaterThan(1); // they leave trails
    }
  });

  it('poison-arrow particles are coloured as rushing chi, worse corners redder', () => {
    const ps = new ParticleSystem();
    ps.setStreams([arrow, { ...arrow, id: 'mild', severity: 0 }]);
    for (let f = 0; f < 40; f++) ps.update(0, 1);
    const level = (id: string) => guided(ps).find((p) => p.guide!.streamId === id)!.level;
    expect(level('arrow-1')).toBeGreaterThan(level('mild'));
    expect(level('mild')).toBeGreaterThanOrEqual(0.7);
  });

  it('in Edit mode, particles fade out at the end; arrows splash a few sparks', () => {
    const ps = new ParticleSystem();
    ps.setStreams([arrow]);
    let sparks = 0;
    for (let f = 0; f < 200; f++) {
      ps.update(0, 1);
      sparks = Math.max(sparks, ps.particles.filter((p) => p.ttl !== undefined).length);
      // Stream particles stop at the end (x = 70); sparks splash a little way around it.
      expect(guided(ps).every((p) => p.x <= 70.01)).toBe(true);
      expect(ps.particles.filter((p) => p.ttl !== undefined).every((p) => Math.hypot(p.x - 70, p.y - 50) < 20)).toBe(true);
    }
    expect(sparks).toBeGreaterThan(0);
  });

  it('removes particles of streams that disappear', () => {
    const ps = new ParticleSystem();
    ps.setStreams([arrow]);
    for (let f = 0; f < 20; f++) ps.update(0, 1);
    ps.setStreams([]);
    expect(guided(ps)).toHaveLength(0);
  });

  it('is fed by the flow: stronger where there is more chi at the source', () => {
    const count = (speed: number) => {
      const { grid, ux, uy, chi } = openGrid(speed);
      const ps = new ParticleSystem();
      ps.setGrid(grid);
      ps.setField(ux, uy);
      ps.setChi(chi);
      ps.setStreams([arrow]);
      for (let f = 0; f < 60; f++) ps.update(0, 1);
      return guided(ps).length;
    };
    expect(count(SIM.inletSpeed)).toBeGreaterThan(count(0));
  });

  it('in Simulate mode, particles reaching the end rejoin the flow', () => {
    const { grid, ux, uy, chi } = openGrid(SIM.inletSpeed * 0.3);
    const ps = new ParticleSystem();
    ps.setGrid(grid);
    ps.setField(ux, uy);
    ps.setChi(chi);
    ps.setStreams([{ ...arrow, length: 30 }]);
    let rejoined = false;
    for (let f = 0; f < 120 && !rejoined; f++) {
      ps.update(0, 1);
      rejoined = ps.particles.some((p) => !p.guide && p.ttl === undefined && p.tint === 'flow');
    }
    expect(rejoined).toBe(true);
  });

  it('catches flow particles passing close to a sharp corner', () => {
    const { grid, ux, uy, chi } = openGrid(SIM.inletSpeed);
    const ps = new ParticleSystem();
    ps.setGrid(grid);
    ps.setField(ux, uy);
    ps.setChi(chi);
    // A stream pointing down (+y) from a corner at (40, 20); flow particles drift right past it.
    ps.setStreams([{ ...arrow, id: 'down', fromA: { x: 40, y: 20 }, fromB: { x: 40, y: 20 }, dir: { x: 0, y: 1 }, length: 60, severity: 1 }]);
    let caught = false;
    for (let run = 0; run < 40 && !caught; run++) {
      ps.particles.push({ x: 38, y: 24, age: 0, trail: [{ x: 38, y: 24 }], level: 1, tint: 'flow' });
      for (let f = 0; f < 3; f++) ps.update(1, 1);
      caught = ps.particles.some((p) => p.guide && p.trail.length > 2 && Math.abs(p.guide.dir.x) < 0.5);
    }
    expect(caught).toBe(true);
  });
});
