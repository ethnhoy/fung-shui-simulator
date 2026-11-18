import { describe, expect, it } from 'vitest';
import { sampleLayout } from '../../src/model/sample';
import { bestSpotGrid, positionScore } from '../../src/report/bestSpot';

describe('best-spot scoring', () => {
  const layout = sampleLayout();

  it('scores the bed’s current, commanding spot highly', () => {
    expect(positionScore(layout, 'bed-1', 140, 100)).toMatchObject({ blocked: false });
    expect(positionScore(layout, 'bed-1', 140, 100)!.score).toBeGreaterThanOrEqual(85);
  });

  it('scores a bed floating in the middle of the room lower', () => {
    // Centred at (280, 200) the bed touches no wall and no other furniture.
    const middle = positionScore(layout, 'bed-1', 280, 200);
    expect(middle?.blocked).toBe(false);
    expect(middle!.score).toBeLessThan(positionScore(layout, 'bed-1', 140, 100)!.score);
  });

  it('still scores spots blocked by furniture, but flags them; spots through a wall are unavailable', () => {
    expect(positionScore(layout, 'bed-1', 90, 300)).toMatchObject({ blocked: true }); // over the wardrobe
    expect(positionScore(layout, 'bed-1', 10, 100)).toBeNull(); // through the wall
  });

  it('builds a grid whose best cell is near the current bed position', () => {
    const cells = bestSpotGrid(layout, 'bed-1', 20).filter((c) => c.score !== null && !c.blocked);
    expect(cells.length).toBeGreaterThan(0);
    const best = cells.reduce((a, b) => (b.score! > a.score! ? b : a));
    expect(best.score).toBeGreaterThanOrEqual(85);
  });

  it('scores desk positions too', () => {
    expect(positionScore(layout, 'desk-1', 170, 370)).not.toBeNull();
  });
});
