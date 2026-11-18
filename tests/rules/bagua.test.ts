import { describe, expect, it } from 'vitest';
import { baguaRule, baguaZones } from '../../src/rules/bagua';
import { buildContext } from '../../src/rules/context';
import { setRoom } from '../../src/model/layoutOps';
import { item, opening, room } from './helpers';

const zoneAt = (l: Parameters<typeof baguaZones>[0], name: string) => {
  const z = baguaZones(l).find((x) => x.name === name)!;
  const xs = z.polygon.map((p) => p.x);
  const ys = z.polygon.map((p) => p.y);
  return { cx: (Math.min(...xs) + Math.max(...xs)) / 2, cy: (Math.min(...ys) + Math.max(...ys)) / 2 };
};

describe('bagua map', () => {
  it('puts Career by the entrance and Wealth at the back-left (door on the bottom wall)', () => {
    const l = room([]);
    expect(zoneAt(l, 'Career').cy).toBeGreaterThan(300); // bottom row
    const wealth = zoneAt(l, 'Wealth');
    expect(wealth.cx).toBeLessThan(100); // left, looking in from the door
    expect(wealth.cy).toBeLessThan(100); // back
  });

  it('rotates with the entrance (door on the top wall)', () => {
    const l = room([], [opening('door', 0, 200, { isMainEntrance: true })]);
    const wealth = zoneAt(l, 'Wealth');
    // Looking in from the top, "back-left" is the bottom-right of the plan.
    expect(wealth.cx).toBeGreaterThan(300);
    expect(wealth.cy).toBeGreaterThan(300);
  });

  it('reports a missing area for an L-shaped room', () => {
    // setRoom re-attaches the door to the right wall (an L-shape numbers its walls differently).
    const base = room([]);
    const l = setRoom(base, { ...base.room, shape: 'lshape', notch: { corner: 'top-right', width: 140, depth: 140 } });
    // Top-right of the plan = back-right looking in from the bottom = Relationships.
    expect(baguaRule(buildContext(l)).some((r) => r.id === 'bagua.missing.Relationships')).toBe(true);
  });

  it('lists items in each zone and notices pairs in Relationships', () => {
    const l = room([item('nightstand', 320, 40), item('nightstand', 370, 40)]);
    const r = baguaRule(buildContext(l)).find((x) => x.id === 'bagua.zone.Relationships')!;
    expect(r.message).toMatch(/Nightstand, Nightstand/);
    expect(r.status).toBe('good');
    expect(r.scoreImpact).toBe(0);
  });
});
