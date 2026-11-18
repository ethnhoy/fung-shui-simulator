import { describe, expect, it } from 'vitest';
import { roomPolygon } from '../../src/geometry/room';
import { buildContext } from '../../src/rules/context';
import { poisonArrowsRule, protrudingWallCorners } from '../../src/rules/poisonArrows';
import type { Layout } from '../../src/model/types';
import { bedAgainstTop, item, room } from './helpers';

const run = (l: Layout) => poisonArrowsRule(buildContext(l));

describe('poison arrows', () => {
  it('flags a sharp corner aimed at the bed, worse when closer', () => {
    // A dresser down-right of the bed: its back-left corner points diagonally up-left at the bed.
    const near = run(room([bedAgainstTop(), item('dresser', 280, 280, 0)])).find((r) => r.id.startsWith('arrows.corner'));
    const far = run(room([bedAgainstTop(), item('dresser', 330, 330, 0)])).find((r) => r.id.startsWith('arrows.corner'));
    expect(near).toBeDefined();
    expect(far).toBeDefined();
    expect(near!.scoreImpact).toBeLessThan(far!.scoreImpact);
  });

  it('ignores corners that point elsewhere and rounded furniture', () => {
    const results = run(room([bedAgainstTop(), item('dresser', 330, 330, 45, { sharpCorners: false })]));
    expect(results.map((r) => r.id)).toEqual(['arrows.clear']);
  });

  it('finds the corner an L-shaped room pushes into the room', () => {
    const l = room([]);
    l.room = { ...l.room, shape: 'lshape' };
    const corners = protrudingWallCorners(roomPolygon(l.room));
    expect(corners).toHaveLength(1);
    // Top-right notch of 120 × 120: the inner corner is at (280, 120), pointing down-left.
    expect(corners[0].at).toEqual({ x: 280, y: 120 });
    expect(corners[0].dir.x).toBeLessThan(0);
    expect(corners[0].dir.y).toBeGreaterThan(0);
  });

  it('offers a plant fix that is placed between the corner and the bed', () => {
    const l = room([bedAgainstTop(), item('dresser', 280, 280, 0)]);
    const r = run(l).find((x) => x.id.startsWith('arrows.corner'))!;
    const fixed = r.fix!.apply(l);
    expect(fixed.furniture.filter((f) => f.type === 'plant')).toHaveLength(1);
  });

  it('warns about open shelves next to the bed and can swap them for a cabinet', () => {
    const l = room([bedAgainstTop(200), item('bookshelf', 320, 15, 0, { id: 'shelf', sharpCorners: false })]);
    const r = run(l).find((x) => x.id === 'arrows.bookshelf.shelf')!;
    expect(r.status).toBe('warn');
    expect(r.fix!.apply(l).furniture.find((f) => f.id === 'shelf')!.type).toBe('cabinet');
  });

  it('warns about nightstands taller than the mattress', () => {
    const l = room([bedAgainstTop(200), item('nightstand', 95, 20, 0, { heightCm: 80, sharpCorners: false })]);
    expect(run(l).some((r) => r.id.startsWith('arrows.nightstand'))).toBe(true);
  });
});
