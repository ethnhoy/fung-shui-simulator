import { describe, expect, it } from 'vitest';
import { buildContext } from '../../src/rules/context';
import { elementsRule, tallyElements } from '../../src/rules/elements';
import type { Layout } from '../../src/model/types';
import { bedAgainstTop, item, room } from './helpers';

const run = (l: Layout) => elementsRule(buildContext(l));
const balanced = () => room([
  bedAgainstTop(), // Wood
  item('lamp', 300, 50), // Fire
  item('rug', 200, 300, 0, { width: 100, depth: 80 }), // Earth
  item('mirror', 397.5, 200, 90), // Metal
  item('waterFeature', 350, 350), // Water
]);

describe('five elements and yin/yang', () => {
  it('tallies elements by count and area', () => {
    const t = tallyElements(buildContext(balanced()));
    expect(t.count).toEqual({ Wood: 1, Fire: 1, Earth: 1, Metal: 1, Water: 1 });
    expect(t.share.Wood).toBeGreaterThan(t.share.Fire); // the bed is much bigger than the lamp
  });

  it('is good when all five are present', () => {
    expect(run(balanced()).some((r) => r.id === 'elements.allFive' && r.status === 'good')).toBe(true);
  });

  it('warns when two or more elements are missing', () => {
    expect(run(room([bedAgainstTop(), item('wardrobe', 300, 30)])).find((r) => r.id === 'elements.missing')?.message).toMatch(/Fire.*Earth.*Metal.*Water/);
  });

  it('warns when one element dominates and suggests the element that tempers it', () => {
    const r = run(room([bedAgainstTop(), item('wardrobe', 300, 30), item('lamp', 300, 300)])).find((x) => x.id === 'elements.dominant')!;
    expect(r.message).toMatch(/Wood dominates/);
    expect(r.explanation).toMatch(/Metal tempers Wood/);
  });

  it('warns about a TV (yang) and offers to move it out', () => {
    const l = room([bedAgainstTop(), item('tv', 200, 395, 180, { id: 'tv' })]);
    const r = run(l).find((x) => x.id === 'elements.tv.tv')!;
    expect(r.status).toBe('warn');
    expect(r.fix!.apply(l).furniture.some((f) => f.id === 'tv')).toBe(false);
  });

  it('notes too many large plants, and praises a yin room', () => {
    const plants = [1, 2, 3, 4].map((i) => item('plant', 60 * i, 350, 0, { variant: 'large' }));
    expect(run(room([bedAgainstTop(), ...plants])).some((r) => r.id === 'elements.plants')).toBe(true);
    expect(run(balanced()).some((r) => r.id === 'elements.yin')).toBe(true);
  });
});
