/**
 * Checks that some JSON (from localStorage or an imported file) really is a
 * Layout before we trust it. TypeScript types disappear at runtime, so data
 * from outside the program has to be checked by hand, a bit like validating
 * user input in Java before casting it.
 */
import { CATALOG } from './catalog';
import { clampOpenings, ensureMainEntrance, sanitizeRoom } from './layoutOps';
import { ELEMENTS, type Furniture, type FurnitureType, type Layout, type Opening } from './types';

export class LayoutError extends Error {}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function num(obj: Record<string, unknown>, key: string, where: string, fallback?: number): number {
  const v = obj[key];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (fallback !== undefined && v === undefined) return fallback;
  throw new LayoutError(`${where}: "${key}" should be a number.`);
}

function str<T extends string>(obj: Record<string, unknown>, key: string, allowed: readonly T[], fallback: T): T {
  const v = obj[key];
  return allowed.includes(v as T) ? (v as T) : fallback;
}

const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);

/** Parse unknown JSON into a valid Layout, or throw a LayoutError with a readable message. */
export function parseLayout(data: unknown): Layout {
  if (!isObj(data)) throw new LayoutError('File is not a Fung Shui layout (expected a JSON object).');
  if (data.version !== 1) throw new LayoutError(`Unsupported layout version: ${String(data.version)}.`);
  if (!isObj(data.room)) throw new LayoutError('Layout is missing "room".');
  if (!Array.isArray(data.openings) || !Array.isArray(data.furniture)) {
    throw new LayoutError('Layout needs "openings" and "furniture" lists.');
  }

  const r = data.room;
  const notch = isObj(r.notch) ? r.notch : {};
  const room = sanitizeRoom({
    shape: str(r, 'shape', ['rectangle', 'lshape'] as const, 'rectangle'),
    width: num(r, 'width', 'room'),
    depth: num(r, 'depth', 'room'),
    wallThickness: num(r, 'wallThickness', 'room', 15),
    notch: {
      corner: str(notch, 'corner', ['top-left', 'top-right', 'bottom-right', 'bottom-left'] as const, 'top-right'),
      width: num(notch, 'width', 'room.notch', 120),
      depth: num(notch, 'depth', 'room.notch', 120),
    },
  });

  const openings: Opening[] = data.openings.map((o, i) => {
    if (!isObj(o)) throw new LayoutError(`Opening ${i + 1} is not an object.`);
    const where = `Opening ${i + 1}`;
    return {
      id: typeof o.id === 'string' ? o.id : `opening-${i}`,
      kind: str(o, 'kind', ['door', 'window'] as const, 'door'),
      wallIndex: Math.round(num(o, 'wallIndex', where)),
      offset: num(o, 'offset', where),
      width: num(o, 'width', where),
      isOpen: bool(o.isOpen, true),
      isMainEntrance: bool(o.isMainEntrance, false),
      hinge: str(o, 'hinge', ['start', 'end'] as const, 'start'),
      swingsInward: bool(o.swingsInward, true),
    };
  });

  const types = Object.keys(CATALOG) as FurnitureType[];
  const furniture: Furniture[] = data.furniture.map((f, i) => {
    if (!isObj(f)) throw new LayoutError(`Furniture item ${i + 1} is not an object.`);
    const where = `Furniture item ${i + 1}`;
    if (!types.includes(f.type as FurnitureType)) throw new LayoutError(`${where}: unknown type "${String(f.type)}".`);
    const entry = CATALOG[f.type as FurnitureType];
    return {
      id: typeof f.id === 'string' ? f.id : `item-${i}`,
      type: entry.type,
      variant: typeof f.variant === 'string' ? f.variant : '',
      label: typeof f.label === 'string' ? f.label : '',
      x: num(f, 'x', where),
      y: num(f, 'y', where),
      width: Math.max(1, num(f, 'width', where, entry.width)),
      depth: Math.max(1, num(f, 'depth', where, entry.depth)),
      rotation: num(f, 'rotation', where, 0),
      heightCm: num(f, 'heightCm', where, entry.heightCm),
      solidity: str(f, 'solidity', ['solid', 'porous', 'none'] as const, entry.solidity),
      element: str(f, 'element', ELEMENTS, entry.element),
      sharpCorners: bool(f.sharpCorners, entry.sharpCorners),
    };
  });

  const layout: Layout = {
    version: 1,
    name: typeof data.name === 'string' ? data.name : 'My bedroom',
    room,
    openings,
    furniture,
  };
  return ensureMainEntrance(clampOpenings(layout));
}
