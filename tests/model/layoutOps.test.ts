import { describe, expect, it } from 'vitest';
import { openingCenter, roomWalls } from '../../src/geometry/room';
import { createFurniture } from '../../src/model/catalog';
import {
  addFurniture,
  addOpening,
  createOpening,
  removeById,
  setFurnitureVariant,
  setMainEntrance,
  setRoom,
  updateFurniture,
} from '../../src/model/layoutOps';
import { sampleLayout } from '../../src/model/sample';

describe('layout operations', () => {
  it('never modify the original layout', () => {
    const before = sampleLayout();
    const snapshot = JSON.stringify(before);
    updateFurniture(before, 'bed-1', { x: 300 });
    removeById(before, 'door-main');
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it('adds and updates furniture', () => {
    const chair = createFurniture('chair', 100, 100);
    const l = updateFurniture(addFurniture(sampleLayout(), chair), chair.id, { rotation: 45 });
    expect(l.furniture.find((f) => f.id === chair.id)?.rotation).toBe(45);
  });

  it('applies a variant size', () => {
    const l = setFurnitureVariant(sampleLayout(), 'bed-1', 'king');
    expect(l.furniture.find((f) => f.id === 'bed-1')).toMatchObject({ variant: 'king', width: 180 });
  });

  it('keeps exactly one main entrance', () => {
    let l = sampleLayout();
    const door2 = createOpening(l, 'door', 0);
    l = addOpening(l, door2);
    expect(l.openings.filter((o) => o.isMainEntrance)).toHaveLength(1);

    l = setMainEntrance(l, door2.id);
    expect(l.openings.find((o) => o.isMainEntrance)?.id).toBe(door2.id);

    // Deleting the main door promotes the other door.
    l = removeById(l, door2.id);
    expect(l.openings.find((o) => o.isMainEntrance)?.id).toBe('door-main');
  });

  it('re-attaches openings to the nearest wall when the room changes shape', () => {
    const l = sampleLayout();
    const resized = setRoom(l, { ...l.room, width: 500 });
    const walls = roomWalls(resized.room);
    const door = resized.openings.find((o) => o.id === 'door-main')!;
    // The door stays at the same x on the bottom wall even though that wall got longer.
    expect(openingCenter(walls, door).x).toBeCloseTo(350);
    expect(openingCenter(walls, door).y).toBeCloseTo(400);

    const lshape = setRoom(l, { ...l.room, shape: 'lshape' });
    expect(roomWalls(lshape.room)).toHaveLength(6);
    for (const o of lshape.openings) expect(o.wallIndex).toBeLessThan(6);
  });

  it('keeps the L-shape notch smaller than the room', () => {
    const l = setRoom(sampleLayout(), {
      ...sampleLayout().room, shape: 'lshape', notch: { corner: 'top-left', width: 5000, depth: 10 },
    });
    expect(l.room.notch.width).toBe(420 - 100);
    expect(l.room.notch.depth).toBe(50);
  });
});
