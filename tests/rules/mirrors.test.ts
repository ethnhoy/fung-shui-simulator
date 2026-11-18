import { describe, expect, it } from 'vitest';
import { buildContext } from '../../src/rules/context';
import { mirrorsRule } from '../../src/rules/mirrors';
import type { Layout } from '../../src/model/types';
import { bedAgainstTop, item, room } from './helpers';

const run = (l: Layout) => mirrorsRule(buildContext(l));

describe('mirrors', () => {
  it('flags a mirror facing the bed, with a fix that removes it', () => {
    // On the right wall, facing left (rotation 90) towards the bed.
    const l = room([bedAgainstTop(), item('mirror', 397.5, 100, 90, { id: 'm' })]);
    const r = run(l)[0];
    expect(r.id).toBe('mirrors.facesBed.m');
    expect(r.status).toBe('bad');
    expect(r.fix!.apply(l).furniture.some((f) => f.id === 'm')).toBe(false);
  });

  it('is happy with a mirror facing away from the bed', () => {
    // On the left wall below the bed, facing right into empty floor.
    const l = room([bedAgainstTop(), item('mirror', 2.5, 320, 270, { id: 'm' })]);
    expect(run(l)[0].status).toBe('good');
  });

  it('flags a mirror hanging over the headboard', () => {
    const l = room([bedAgainstTop(), item('mirror', 120, 2.5, 0, { id: 'm' })]);
    expect(run(l)[0].id).toBe('mirrors.overBed.m');
  });

  it('is good when there are no mirrors', () => {
    expect(run(room([bedAgainstTop()]))[0].status).toBe('good');
  });
});

describe('mirror markers', () => {
  it('draws a beam from the mirror face to the bed', () => {
    const l = room([bedAgainstTop(), item('mirror', 397.5, 100, 90, { id: 'm' })]);
    const m = run(l)[0].marker!;
    expect(m.kind).toBe('mirrorBeam');
    if (m.kind !== 'mirrorBeam') return;
    // Facing left (−x) from x = 395 to the bed's right edge at x = 200.
    expect(m.dir.x).toBeCloseTo(-1);
    expect(m.length).toBeCloseTo(194.5, 1); // the ray starts 0.5 cm in front of the glass
    expect(m.edge[0].x).toBeCloseTo(395);
  });

  it('has no marker when the mirror is fine', () => {
    expect(run(room([bedAgainstTop(), item('mirror', 2.5, 320, 270)]))[0].marker).toBeUndefined();
  });
});

