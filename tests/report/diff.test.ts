import { describe, expect, it } from 'vitest';
import { createFurniture } from '../../src/model/catalog';
import { addFurniture, removeById, updateFurniture, updateOpening } from '../../src/model/layoutOps';
import { sampleLayout } from '../../src/model/sample';
import { diffLayouts, isEmptyDiff } from '../../src/report/diff';

describe('diffLayouts', () => {
  const base = sampleLayout();

  it('finds nothing when nothing changed', () => {
    expect(isEmptyDiff(diffLayouts(base, sampleLayout()))).toBe(true);
  });

  it('finds added, removed and moved furniture', () => {
    const plant = createFurniture('plant', 300, 200);
    const after = updateFurniture(removeById(addFurniture(base, plant), 'mirror-1'), 'bed-1', { x: 200 });
    const d = diffLayouts(base, after);
    expect(d.added.map((f) => f.id)).toEqual([plant.id]);
    expect(d.removed.map((f) => f.id)).toEqual(['mirror-1']);
    expect(d.changed.map((c) => [c.before.x, c.after.x])).toEqual([[140, 200]]);
    expect(d.structureChanged).toBe(false);
  });

  it('flags changes to doors and windows', () => {
    expect(diffLayouts(base, updateOpening(base, 'window-1', { isOpen: false })).structureChanged).toBe(true);
  });
});
