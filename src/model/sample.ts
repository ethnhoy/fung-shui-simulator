/**
 * The starter bedroom that loads on first visit. It's deliberately a mix of
 * good and not-so-good choices so the report has something to talk about:
 *  + bed in the commanding position, diagonally across from the door
 *  + solid wall behind the headboard, matching nightstands
 *  - a mirror facing the bed
 *  - a desk in the bedroom (adds yang energy)
 *  - a stagnant corner by the wardrobe (shows up in the simulation)
 */
import { CATALOG } from './catalog';
import type { Furniture, FurnitureType, Layout } from './types';

/** Helper so the sample can list only what differs from catalog defaults. */
function item(id: string, type: FurnitureType, x: number, y: number, rotation = 0, variant = ''): Furniture {
  const e = CATALOG[type];
  const v = e.variants?.find((x) => x.id === variant);
  return {
    id, type, variant: v?.id ?? '', label: '', x, y, rotation,
    width: v?.width ?? e.width,
    depth: v?.depth ?? e.depth,
    heightCm: v?.heightCm ?? e.heightCm,
    solidity: e.solidity, element: e.element, sharpCorners: e.sharpCorners,
  };
}

export function sampleLayout(): Layout {
  return {
    version: 1,
    name: 'Sample bedroom',
    room: {
      shape: 'rectangle',
      width: 420,
      depth: 400,
      notch: { corner: 'top-right', width: 120, depth: 120 },
      wallThickness: 15,
    },
    openings: [
      {
        // Bottom wall (wall 2 runs right-to-left), 70 cm from the right corner.
        id: 'door-main', kind: 'door', wallIndex: 2, offset: 70, width: 80,
        isOpen: true, isMainEntrance: true, hinge: 'start', swingsInward: true,
      },
      {
        // Top wall (wall 0 runs left-to-right), to the right of the headboard,
        // so chi flows from the door up the right side of the room and out here.
        id: 'window-1', kind: 'window', wallIndex: 0, offset: 330, width: 100,
        isOpen: true, isMainEntrance: false, hinge: 'start', swingsInward: true,
      },
    ],
    furniture: [
      item('rug-1', 'rug', 140, 245),
      item('bed-1', 'bed', 140, 100, 0, 'queen'),
      item('nightstand-l', 'nightstand', 35, 20),
      item('nightstand-r', 'nightstand', 245, 20),
      item('wardrobe-1', 'wardrobe', 30, 300, 270),
      item('desk-1', 'desk', 170, 370, 180),
      item('chair-1', 'chair', 170, 315, 0),
      item('mirror-1', 'mirror', 417.5, 130, 90),
      item('plant-1', 'plant', 385, 35, 0, 'large'),
    ],
  };
}
