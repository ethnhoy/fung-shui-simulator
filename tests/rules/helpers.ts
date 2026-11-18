/**
 * Small builders for rule tests: a 400 × 400 cm room with a door on the
 * bottom wall, plus furniture placed by type, position and rotation.
 */
import { createFurniture } from '../../src/model/catalog';
import type { Furniture, FurnitureType, Layout, Opening } from '../../src/model/types';

let counter = 0;

export function item(type: FurnitureType, x: number, y: number, rotation = 0, extra: Partial<Furniture> = {}): Furniture {
  return { ...createFurniture(type, x, y), id: `${type}-${++counter}`, rotation, ...extra };
}

export function opening(kind: 'door' | 'window', wallIndex: number, offset: number, extra: Partial<Opening> = {}): Opening {
  return {
    id: `${kind}-${++counter}`, kind, wallIndex, offset, width: kind === 'door' ? 80 : 100,
    isOpen: true, isMainEntrance: false, hinge: 'start', swingsInward: true, ...extra,
  };
}

/**
 * Walls of the default rectangle: 0 = top (left→right), 1 = right (top→bottom),
 * 2 = bottom (right→left), 3 = left (bottom→top).
 * The default main door is on the bottom wall, 70 cm from the bottom-right corner (centre x = 330).
 */
export function room(furniture: Furniture[], openings?: Opening[], size = { width: 400, depth: 400 }): Layout {
  return {
    version: 1,
    name: 'test',
    room: { shape: 'rectangle', ...size, wallThickness: 15, notch: { corner: 'top-right', width: 120, depth: 120 } },
    openings: openings ?? [opening('door', 2, 70, { isMainEntrance: true, id: 'door-main' })],
    furniture,
  };
}

/** A queen bed (160 × 200) with its head against the top wall at the given x. */
export const bedAgainstTop = (x = 120) => item('bed', x, 100, 0, { id: 'bed' });
