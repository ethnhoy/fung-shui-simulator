import { describe, expect, it } from 'vitest';
import { sampleLayout } from '../../src/model/sample';
import { CHI, SIM } from '../../src/rules/config';
import { CLASS_CODE, classifyField, classifySpeed, computeStats, findStagnantRegions, SettleDetector } from '../../src/sim/classify';
import { cellIndexAt, rasterise } from '../../src/sim/rasterise';

const u = SIM.inletSpeed;

describe('classifySpeed', () => {
  it('uses the thresholds from config', () => {
    expect(classifySpeed(u * (CHI.shaAbove + 0.01))).toBe('sha');
    expect(classifySpeed(u * 0.3)).toBe('sheng');
    expect(classifySpeed(u * (CHI.siBelow - 0.01))).toBe('si');
  });
});

describe('stats on a synthetic field', () => {
  const grid = rasterise(sampleLayout());
  const n = grid.nx * grid.ny;

  it('reports the whole floor as stagnant when nothing moves', () => {
    const classes = classifyField(grid, new Float32Array(n), new Float32Array(n));
    const stats = computeStats(grid, classes, 0, true);
    expect(stats.floor.si).toBe(1);
    expect(stats.bed?.si).toBe(1);
    // One big connected stagnant region, which touches corners.
    expect(stats.stagnantRegions.length).toBeGreaterThanOrEqual(1);
    expect(stats.stagnantRegions[0].inCorner).toBe(true);
  });

  it('measures the chi mix around the bed', () => {
    const ux = new Float32Array(n);
    const uy = new Float32Array(n);
    // Make every bed-zone cell rush.
    grid.bedZone.forEach((v, k) => v && (ux[k] = u));
    const stats = computeStats(grid, classifyField(grid, ux, uy), 0, true);
    expect(stats.bed?.sha).toBe(1);
    expect(stats.floor.sha).toBeGreaterThan(0);
    expect(stats.floor.sha).toBeLessThan(1);
  });

  it('ignores stagnant patches smaller than 0.5 m²', () => {
    const ux = new Float32Array(n).fill(u * 0.3); // healthy everywhere...
    const uy = new Float32Array(n);
    // ...except a 50 × 50 cm patch (0.25 m²) and a 100 × 100 cm patch (1 m²).
    for (let y = 250; y < 300; y += 5) for (let x = 300; x < 350; x += 5) ux[cellIndexAt(grid, { x, y })] = 0;
    for (let y = 230; y < 330; y += 5) for (let x = 60; x < 160; x += 5) ux[cellIndexAt(grid, { x: x + 1, y: y + 1 })] = 0;
    const regions = findStagnantRegions(grid, classifyField(grid, ux, uy));
    expect(regions).toHaveLength(1);
    expect(regions[0].areaCm2).toBeCloseTo(10000, -2);
  });

  it('does not count solid furniture as floor', () => {
    const classes = classifyField(grid, new Float32Array(n), new Float32Array(n));
    expect(classes[cellIndexAt(grid, { x: 140, y: 100 })]).toBe(CLASS_CODE.none); // under the bed
  });
});

describe('SettleDetector', () => {
  it('waits for minSteps, then settles once the mean speed stops changing', () => {
    const d = new SettleDetector();
    const { sampleEvery, minSteps } = SIM.settle;
    let step = 0;
    for (; step < minSteps; step += sampleEvery) expect(d.add(step, 0.02 + step * 1e-5)).toBe(false);
    let settledAt = -1;
    for (; step < SIM.settle.maxSteps; step += sampleEvery) {
      if (d.add(step, 0.03)) {
        settledAt = step;
        break;
      }
    }
    expect(settledAt).toBeGreaterThan(minSteps);
  });

  it('gives up waiting at maxSteps', () => {
    const d = new SettleDetector();
    expect(d.add(SIM.settle.maxSteps, Math.random())).toBe(true);
  });
});
