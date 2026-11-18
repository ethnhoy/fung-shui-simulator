import { describe, expect, it } from 'vitest';
import { sampleLayout } from '../../src/model/sample';
import { chiFlowRule } from '../../src/rules/chiFlow';
import { buildContext } from '../../src/rules/context';
import type { Layout } from '../../src/model/types';
import type { SimStats } from '../../src/sim/types';
import { item } from './helpers';

const run = (l: Layout, sim: SimStats | null = null) => chiFlowRule(buildContext(l, sim));

const stats = (patch: Partial<SimStats> = {}): SimStats => ({
  settled: true, step: 3000, mode: 'normal',
  floor: { sha: 0.2, sheng: 0.4, si: 0.4 },
  bed: { sha: 0, sheng: 0.5, si: 0.5 },
  stagnantRegions: [],
  ...patch,
});

describe('chi flow: straight-line rush', () => {
  it('flags the clear line from the door to the window in the sample room', () => {
    expect(run(sampleLayout()).find((r) => r.id === 'flow.rush.window-1')?.status).toBe('bad');
  });

  it('is fixed by the suggested plant', () => {
    const l = sampleLayout();
    const fixed = run(l).find((r) => r.id === 'flow.rush.window-1')!.fix!.apply(l);
    expect(run(fixed).some((r) => r.id.startsWith('flow.rush'))).toBe(false);
  });

  it('does not flag a closed window', () => {
    const l = sampleLayout();
    l.openings[1].isOpen = false;
    expect(run(l).some((r) => r.id.startsWith('flow.rush'))).toBe(false);
  });
});

describe('chi flow: simulation statistics', () => {
  it('asks for a simulation when there are no stats, and stays neutral', () => {
    const r = run(sampleLayout()).find((x) => x.id === 'flow.runSim')!;
    expect(r.status).toBe('info');
    expect(r.scoreImpact).toBe(0);
  });

  it('treats unsettled stats as not ready', () => {
    expect(run(sampleLayout(), stats({ settled: false })).some((r) => r.id === 'flow.runSim')).toBe(true);
  });

  it('warns, then flags, rushing chi around the bed', () => {
    const warn = run(sampleLayout(), stats({ bed: { sha: 0.2, sheng: 0.4, si: 0.4 } })).find((r) => r.id === 'flow.bedSha');
    const bad = run(sampleLayout(), stats({ bed: { sha: 0.5, sheng: 0.3, si: 0.2 } })).find((r) => r.id === 'flow.bedSha');
    expect(warn?.status).toBe('warn');
    expect(bad?.status).toBe('bad');
  });

  it('reports large stagnant areas with a lamp fix when there is space', () => {
    const region = { areaCm2: 8000, centroid: { x: 300, y: 250 }, bounds: { minX: 260, minY: 210, maxX: 340, maxY: 290 }, inCorner: false };
    const l = sampleLayout();
    const r = run(l, stats({ stagnantRegions: [region] })).find((x) => x.id === 'flow.stagnant.0')!;
    expect(r.status).toBe('warn');
    expect(r.fix!.apply(l).furniture.some((f) => f.type === 'lamp')).toBe(true);
  });

  it('caps the total stagnant penalty', () => {
    const region = { areaCm2: 6000, centroid: { x: 300, y: 250 }, bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 }, inCorner: true };
    const total = run(sampleLayout(), stats({ stagnantRegions: Array(8).fill(region) }))
      .filter((r) => r.id.startsWith('flow.stagnant'))
      .reduce((s, r) => s + r.scoreImpact, 0);
    expect(total).toBe(-20);
  });

  it('praises mostly-sheng floors and warns about very little sheng', () => {
    const l = sampleLayout();
    expect(run(l, stats({ floor: { sha: 0.1, sheng: 0.6, si: 0.3 } })).some((r) => r.id === 'flow.healthy')).toBe(true);
    expect(run(l, stats({ floor: { sha: 0.3, sheng: 0.1, si: 0.6 } })).some((r) => r.id === 'flow.lowSheng')).toBe(true);
  });

  it('a plant on the rush line blocks it', () => {
    const l = sampleLayout();
    l.furniture.push(item('plant', 340, 200));
    expect(run(l).some((r) => r.id.startsWith('flow.rush'))).toBe(false);
  });
});
