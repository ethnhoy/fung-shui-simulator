/**
 * The furniture catalog: default size, height, element and so on for each
 * furniture type. New items are created from these defaults and the user
 * can then edit them in the properties panel.
 */
import type { Element, Furniture, FurnitureType, HeightClass, Solidity } from './types';

export interface CatalogVariant {
  id: string;
  label: string;
  width: number;
  depth: number;
  heightCm: number;
}

export interface CatalogEntry {
  type: FurnitureType;
  label: string;
  /** Palette group, purely for organising the UI. */
  group: 'Sleep' | 'Storage' | 'Work' | 'Decor';
  width: number;
  depth: number;
  heightCm: number;
  solidity: Solidity;
  element: Element;
  sharpCorners: boolean;
  /** True if the item has a meaningful front (shown with a small arrow). */
  hasFront: boolean;
  variants?: CatalogVariant[];
  defaultVariant?: string;
}

export const CATALOG: Record<FurnitureType, CatalogEntry> = {
  bed: {
    type: 'bed', label: 'Bed', group: 'Sleep',
    width: 160, depth: 200, heightCm: 55,
    solidity: 'solid', element: 'Wood', sharpCorners: false, hasFront: true,
    variants: [
      { id: 'single', label: 'Single', width: 90, depth: 200, heightCm: 55 },
      { id: 'double', label: 'Double', width: 140, depth: 200, heightCm: 55 },
      { id: 'queen', label: 'Queen', width: 160, depth: 200, heightCm: 55 },
      { id: 'king', label: 'King', width: 180, depth: 200, heightCm: 55 },
    ],
    defaultVariant: 'queen',
  },
  nightstand: {
    type: 'nightstand', label: 'Nightstand', group: 'Sleep',
    width: 45, depth: 40, heightCm: 55,
    solidity: 'solid', element: 'Wood', sharpCorners: true, hasFront: false,
  },
  rug: {
    type: 'rug', label: 'Rug', group: 'Decor',
    width: 200, depth: 140, heightCm: 1,
    solidity: 'none', element: 'Earth', sharpCorners: false, hasFront: false,
  },
  wardrobe: {
    type: 'wardrobe', label: 'Wardrobe', group: 'Storage',
    width: 100, depth: 60, heightCm: 200,
    solidity: 'solid', element: 'Wood', sharpCorners: true, hasFront: true,
  },
  dresser: {
    type: 'dresser', label: 'Dresser', group: 'Storage',
    width: 100, depth: 50, heightCm: 80,
    solidity: 'solid', element: 'Wood', sharpCorners: true, hasFront: true,
  },
  bookshelf: {
    type: 'bookshelf', label: 'Open bookshelf', group: 'Storage',
    width: 80, depth: 30, heightCm: 180,
    solidity: 'solid', element: 'Wood', sharpCorners: true, hasFront: true,
  },
  cabinet: {
    type: 'cabinet', label: 'Closed cabinet', group: 'Storage',
    width: 80, depth: 40, heightCm: 90,
    solidity: 'solid', element: 'Wood', sharpCorners: true, hasFront: true,
  },
  desk: {
    type: 'desk', label: 'Desk', group: 'Work',
    width: 120, depth: 60, heightCm: 75,
    solidity: 'solid', element: 'Wood', sharpCorners: true, hasFront: true,
  },
  chair: {
    // A chair is mostly legs and air, so chi passes through it (porous).
    type: 'chair', label: 'Chair', group: 'Work',
    width: 50, depth: 50, heightCm: 90,
    solidity: 'porous', element: 'Wood', sharpCorners: false, hasFront: true,
  },
  tv: {
    // Electronics are "yang" and usually counted as Fire.
    type: 'tv', label: 'TV', group: 'Work',
    width: 120, depth: 10, heightCm: 110,
    solidity: 'solid', element: 'Fire', sharpCorners: true, hasFront: true,
  },
  mirror: {
    type: 'mirror', label: 'Mirror', group: 'Decor',
    width: 60, depth: 5, heightCm: 150,
    solidity: 'solid', element: 'Metal', sharpCorners: false, hasFront: true,
  },
  plant: {
    type: 'plant', label: 'Plant', group: 'Decor',
    width: 50, depth: 50, heightCm: 150,
    solidity: 'porous', element: 'Wood', sharpCorners: false, hasFront: false,
    variants: [
      { id: 'small', label: 'Small', width: 30, depth: 30, heightCm: 50 },
      { id: 'large', label: 'Large', width: 50, depth: 50, heightCm: 150 },
    ],
    defaultVariant: 'large',
  },
  lamp: {
    type: 'lamp', label: 'Lamp', group: 'Decor',
    width: 35, depth: 35, heightCm: 150,
    solidity: 'porous', element: 'Fire', sharpCorners: false, hasFront: false,
  },
  waterFeature: {
    type: 'waterFeature', label: 'Water feature', group: 'Decor',
    width: 40, depth: 40, heightCm: 80,
    solidity: 'solid', element: 'Water', sharpCorners: false, hasFront: false,
  },
  column: {
    type: 'column', label: 'Column', group: 'Storage',
    width: 30, depth: 30, heightCm: 250,
    solidity: 'solid', element: 'Earth', sharpCorners: true, hasFront: false,
  },
};

/** Height-class thresholds (cm). Below LOW_MAX is low, below MEDIUM_MAX is medium, else tall. */
export const HEIGHT_CLASS_THRESHOLDS = { lowMax: 70, mediumMax: 160 };

/** Derive low/medium/tall from a height in cm. */
export function heightClass(heightCm: number): HeightClass {
  if (heightCm < HEIGHT_CLASS_THRESHOLDS.lowMax) return 'low';
  if (heightCm < HEIGHT_CLASS_THRESHOLDS.mediumMax) return 'medium';
  return 'tall';
}

/** Short random id like "bed-3f9a1c2e". */
export function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

/** Create a new furniture item of the given type, centred at (x, y), using catalog defaults. */
export function createFurniture(type: FurnitureType, x: number, y: number, variantId?: string): Furniture {
  const entry = CATALOG[type];
  const variant = entry.variants?.find((v) => v.id === (variantId ?? entry.defaultVariant));
  return {
    id: newId(type),
    type,
    variant: variant?.id ?? '',
    label: '',
    x,
    y,
    width: variant?.width ?? entry.width,
    depth: variant?.depth ?? entry.depth,
    rotation: 0,
    heightCm: variant?.heightCm ?? entry.heightCm,
    solidity: entry.solidity,
    element: entry.element,
    sharpCorners: entry.sharpCorners,
  };
}

/** Display name: the user's label if set, otherwise e.g. "Queen bed" or "Wardrobe". */
export function displayName(f: Furniture): string {
  if (f.label.trim()) return f.label.trim();
  const entry = CATALOG[f.type];
  const variant = entry.variants?.find((v) => v.id === f.variant);
  return variant ? `${variant.label} ${entry.label.toLowerCase()}` : entry.label;
}
