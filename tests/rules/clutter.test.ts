import { describe, expect, it } from 'vitest';
import { sampleLayout } from '../../src/model/sample';
import { clutterRule, findWalkway, floorCoverage } from '../../src/rules/clutter';
import { buildContext } from '../../src/rules/context';
import { bedAgainstTop, item, room } from './helpers';

describe('clutter and clearance', () => {
  it('measures floor coverage, ignoring rugs', () => {
    const l = room([item('rug', 200, 200, 0, { width: 400, depth: 400 }), item('wardrobe', 100, 100, 0, { width: 200, depth: 200 })]);
    expect(floorCoverage(buildContext(l))).toBeCloseTo(0.25, 2);
  });

  it('warns above 55% and flags above 65% covered', () => {
    const covered = (w: number) => clutterRule(buildContext(room([item('wardrobe', w / 2, 200, 0, { width: w, depth: 400 })])))
      .find((r) => r.id === 'clutter.coverage')!.status;
    expect(covered(200)).toBe('good');
    expect(covered(240)).toBe('warn');
    expect(covered(280)).toBe('bad');
  });

  it('finds the walking path to the bed in the sample room', () => {
    const path = findWalkway(buildContext(sampleLayout()));
    expect(path).not.toBeNull();
    expect(path!.length).toBeGreaterThan(5);
  });

  it('flags a room where furniture walls off the bed', () => {
    // A row of wardrobes across the room, leaving only a 40 cm gap.
    const l = room([bedAgainstTop(200), item('wardrobe', 90, 250, 0, { width: 180 }), item('wardrobe', 310, 250, 0, { width: 140 })]);
    expect(clutterRule(buildContext(l)).find((r) => r.id === 'clutter.walkway')!.status).toBe('bad');
  });

  it('always adds the under-bed tip', () => {
    expect(clutterRule(buildContext(sampleLayout())).some((r) => r.id === 'clutter.underBed')).toBe(true);
  });
});
