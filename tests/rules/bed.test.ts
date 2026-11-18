import { describe, expect, it } from 'vitest';
import { bedRule, evaluateBedPlacement, suggestBedPosition } from '../../src/rules/bed';
import { buildContext } from '../../src/rules/context';
import { sampleLayout } from '../../src/model/sample';
import { bedAgainstTop, item, opening, room } from './helpers';

const ids = (l: Parameters<typeof buildContext>[0]) => bedRule(buildContext(l)).map((r) => r.id);
const find = (l: Parameters<typeof buildContext>[0], prefix: string) => bedRule(buildContext(l)).find((r) => r.id.startsWith(prefix));

describe('bed: commanding position', () => {
  it('praises the sample bedroom: door in view, solid wall, diagonal, matching nightstands', () => {
    const r = ids(sampleLayout());
    expect(r).toEqual(expect.arrayContaining(['bed.commanding', 'bed.solidWall', 'bed.diagonal', 'bed.matchingNightstands']));
    expect(r).not.toContain('bed.coffin');
  });

  it('flags a door behind the sleeper', () => {
    // Head against the bottom wall (the door's wall), facing up: the door is behind/beside you.
    const l = room([item('bed', 120, 300, 180, { id: 'bed' })]);
    expect(find(l, 'bed.doorHidden')?.status).toBe('bad');
    expect(find(l, 'bed.sameWall')?.status).toBe('warn');
  });

  it('warns when tall furniture blocks the view of the door', () => {
    const l = room([bedAgainstTop(), item('wardrobe', 250, 280, 0)]);
    expect(find(l, 'bed.doorBlocked')?.status).toBe('warn');
  });

  it('does not count low furniture as blocking', () => {
    const l = room([bedAgainstTop(), item('dresser', 250, 280, 0)]);
    expect(find(l, 'bed.doorBlocked')).toBeUndefined();
  });

  it('detects the coffin position (feet pointing out of the door)', () => {
    const l = room([bedAgainstTop(330)]);
    expect(find(l, 'bed.coffin')?.status).toBe('bad');
    expect(find(room([bedAgainstTop(120)]), 'bed.coffin')).toBeUndefined();
  });

  it('wants a solid wall behind the headboard', () => {
    expect(find(room([item('bed', 200, 180, 0, { id: 'bed' })]), 'bed.noWallBehind')?.status).toBe('bad');
    const withWindow = room([bedAgainstTop()], [
      opening('door', 2, 70, { isMainEntrance: true }),
      opening('window', 0, 120), // top wall, right behind the headboard
    ]);
    expect(find(withWindow, 'bed.openingBehind')?.status).toBe('bad');
  });

  it('warns when the bed is right beside a window', () => {
    // Bed's left edge at x = 20; window on the left wall at y = 100.
    const l = room([bedAgainstTop(100)], [opening('door', 2, 70, { isMainEntrance: true }), opening('window', 3, 300)]);
    expect(find(l, 'bed.besideWindow')?.status).toBe('warn');
  });

  it('flags a bed inside the door swing', () => {
    // Door centre x = 330, hinge at x = 370 (start end of a right-to-left wall); the swing reaches 80 cm into the room.
    const l = room([item('bed', 320, 290, 0, { id: 'bed', width: 90, variant: 'single' })]);
    expect(find(l, 'bed.doorSwing')?.status).toBe('bad');
  });

  it('checks clearance on both long sides of a double bed', () => {
    expect(find(room([bedAgainstTop(100)]), 'bed.sideTight')?.message).toMatch(/20 cm/);
    expect(find(room([bedAgainstTop(80)]), 'bed.sideBlocked')?.status).toBe('warn');
    expect(find(room([bedAgainstTop(200)]), 'bed.balancedAccess')?.status).toBe('good');
  });

  it('skips the side check for single beds', () => {
    const l = room([item('bed', 45, 100, 0, { id: 'bed', width: 90, variant: 'single' })]);
    expect(find(l, 'bed.side')).toBeUndefined();
  });

  it('gives a bonus only for matching nightstands', () => {
    const stands = (h2: number) => room([bedAgainstTop(200), item('nightstand', 95, 20), item('nightstand', 305, 20, 0, { heightCm: h2 })]);
    expect(find(stands(55), 'bed.matchingNightstands')?.scoreImpact).toBeGreaterThan(0);
    expect(find(stands(90), 'bed.matchingNightstands')).toBeUndefined();
  });

  it('reports a missing bed', () => {
    expect(find(room([]), 'bed.missing')?.scoreImpact).toBe(-100);
  });
});

describe('bed: better-spot suggestion', () => {
  it('finds a spot that fixes the coffin position and attaches it as a fix', () => {
    const l = room([bedAgainstTop(330)]);
    const spot = suggestBedPosition(l);
    expect(spot).not.toBeNull();
    const coffin = find(l, 'bed.coffin')!;
    expect(coffin.fix).toBeDefined();
    const fixed = coffin.fix!.apply(l);
    const after = evaluateBedPlacement(buildContext(fixed)).map((r) => r.id);
    expect(after).not.toContain('bed.coffin');
    expect(after).toContain('bed.commanding');
  });

  it('returns null when the bed is already in the best spot it can find', () => {
    expect(suggestBedPosition(sampleLayout())).toBeNull();
  });
});

describe('desk (half-weight sub-check)', () => {
  it('flags a desk where you sit with your back to the door, and the fix turns it round', () => {
    // Desk against the top wall, front facing down: the sitter faces the wall with the door behind them.
    const l = room([bedAgainstTop(), item('desk', 300, 30, 0, { id: 'desk' })]);
    const r = find(l, 'bed.deskBackToDoor')!;
    expect(r.status).toBe('bad');
    expect(find(r.fix!.apply(l), 'bed.deskCommanding')).toBeDefined();
  });
});

describe('bed markers', () => {
  it('draws the coffin line from the foot of the bed to the door', () => {
    const m = find(room([bedAgainstTop(330)]), 'bed.coffin')!.marker!;
    expect(m.kind).toBe('coffin');
    if (m.kind !== 'coffin') return;
    expect(m.from).toEqual({ x: 330, y: 200 });
    expect(m.to.y).toBeCloseTo(400);
    expect(m.strip).toHaveLength(4);
  });

  it('shades the door swing when it hits the bed', () => {
    const m = find(room([item('bed', 320, 290, 0, { id: 'bed', width: 90, variant: 'single' })]), 'bed.doorSwing')!.marker!;
    expect(m.kind).toBe('zone');
  });
});

