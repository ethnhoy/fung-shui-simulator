import { describe, expect, it } from 'vitest';
import { Store } from '../../src/editor/store';
import { updateFurniture } from '../../src/model/layoutOps';
import { sampleLayout } from '../../src/model/sample';

const bedX = (s: Store) => s.layout.furniture.find((f) => f.id === 'bed-1')!.x;

describe('Store undo/redo', () => {
  it('undoes and redoes commits', () => {
    const s = new Store(sampleLayout());
    s.commit(updateFurniture(s.layout, 'bed-1', { x: 200 }));
    s.commit(updateFurniture(s.layout, 'bed-1', { x: 250 }));
    s.undo();
    expect(bedX(s)).toBe(200);
    s.undo();
    expect(bedX(s)).toBe(140);
    s.redo();
    expect(bedX(s)).toBe(200);
  });

  it('turns a whole drag (many previews) into one undo step', () => {
    const s = new Store(sampleLayout());
    for (const x of [150, 160, 170]) s.preview(updateFurniture(s.layout, 'bed-1', { x }));
    s.commit(updateFurniture(s.layout, 'bed-1', { x: 180 }));
    s.undo();
    expect(bedX(s)).toBe(140);
    expect(s.canUndo).toBe(false);
  });

  it('clears redo after a new change', () => {
    const s = new Store(sampleLayout());
    s.commit(updateFurniture(s.layout, 'bed-1', { x: 200 }));
    s.undo();
    s.commit(updateFurniture(s.layout, 'bed-1', { x: 300 }));
    expect(s.canRedo).toBe(false);
  });

  it('notifies subscribers and clears selection of deleted items', () => {
    const s = new Store(sampleLayout());
    const kinds: string[] = [];
    s.subscribe((k) => kinds.push(k));
    s.select('bed-1');
    s.commit({ ...s.layout, furniture: s.layout.furniture.filter((f) => f.id !== 'bed-1') });
    expect(s.selectedId).toBeNull();
    expect(kinds).toEqual(['selection', 'commit']);
  });
});
