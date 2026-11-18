import { describe, expect, it } from 'vitest';
import { roomWalls } from '../../src/geometry/room';
import { snapFurniturePosition } from '../../src/geometry/snapping';
import type { Room } from '../../src/model/types';

const room: Room = { shape: 'rectangle', width: 400, depth: 300, wallThickness: 15, notch: { corner: 'top-right', width: 100, depth: 100 } };
const walls = roomWalls(room);
const bounds = { width: 400, depth: 300 };
const wardrobe = { width: 100, depth: 60, rotation: 0 };

describe('snapFurniturePosition', () => {
  it('rounds to the 5 cm grid away from walls', () => {
    expect(snapFurniturePosition(wardrobe, { x: 201.7, y: 148.9 }, walls, bounds)).toEqual({ x: 200, y: 150 });
  });

  it('pulls an item flush against a nearby wall', () => {
    // Back edge is at y = 38 - 30 = 8, within the 15 cm threshold of the top wall.
    expect(snapFurniturePosition(wardrobe, { x: 200, y: 38 }, walls, bounds)).toEqual({ x: 200, y: 30 });
  });

  it('uses the rotated footprint when snapping', () => {
    // At 90° the wardrobe is 60 wide, so flush to the left wall means x = 30.
    const p = snapFurniturePosition({ ...wardrobe, rotation: 90 }, { x: 40, y: 150 }, walls, bounds);
    expect(p.x).toBeCloseTo(30);
  });

  it('keeps items inside the room', () => {
    expect(snapFurniturePosition(wardrobe, { x: -100, y: 500 }, walls, bounds)).toEqual({ x: 50, y: 270 });
  });
});
