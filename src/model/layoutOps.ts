/**
 * Pure functions that take a Layout and return a *new* Layout with one change
 * applied. Nothing here touches the screen, so it's easy to unit-test.
 *
 * (Think of these like methods on an immutable Java record that return a
 * modified copy, e.g. `layout.withFurniture(...)`.)
 */
import { clampOpeningOffset, nearestWallPoint, openingCenter, roomWalls } from '../geometry/room';
import { clamp, roundTo } from '../geometry/vec';
import { CATALOG, newId } from './catalog';
import type { Furniture, Layout, Opening, OpeningKind, Room } from './types';

/** Deep copy. structuredClone is built into browsers and Node. */
export const cloneLayout = (l: Layout): Layout => structuredClone(l);

export function addFurniture(l: Layout, f: Furniture): Layout {
  return { ...l, furniture: [...l.furniture, f] };
}

export function updateFurniture(l: Layout, id: string, patch: Partial<Furniture>): Layout {
  return { ...l, furniture: l.furniture.map((f) => (f.id === id ? { ...f, ...patch, id } : f)) };
}

/** Change a bed/plant size variant and apply that variant's default dimensions. */
export function setFurnitureVariant(l: Layout, id: string, variantId: string): Layout {
  const f = l.furniture.find((x) => x.id === id);
  if (!f) return l;
  const v = CATALOG[f.type].variants?.find((x) => x.id === variantId);
  if (!v) return l;
  return updateFurniture(l, id, { variant: v.id, width: v.width, depth: v.depth, heightCm: v.heightCm });
}

export function updateOpening(l: Layout, id: string, patch: Partial<Opening>): Layout {
  let next: Layout = { ...l, openings: l.openings.map((o) => (o.id === id ? { ...o, ...patch, id } : o)) };
  // If the width changed, make sure it still fits on its wall.
  if (patch.width !== undefined || patch.wallIndex !== undefined) next = clampOpenings(next);
  return next;
}

/** Remove an item or opening by id. Keeps exactly one main entrance if any doors remain. */
export function removeById(l: Layout, id: string): Layout {
  const next: Layout = {
    ...l,
    furniture: l.furniture.filter((f) => f.id !== id),
    openings: l.openings.filter((o) => o.id !== id),
  };
  return ensureMainEntrance(next);
}

/** Make `id` the only main entrance. */
export function setMainEntrance(l: Layout, id: string): Layout {
  return {
    ...l,
    openings: l.openings.map((o) => ({ ...o, isMainEntrance: o.kind === 'door' && o.id === id })),
  };
}

/**
 * Enforce the "exactly one main entrance" rule: if no door is marked as
 * the main entrance, promote the first door. If several are, keep the first.
 */
export function ensureMainEntrance(l: Layout): Layout {
  const doors = l.openings.filter((o) => o.kind === 'door');
  if (doors.length === 0) return l;
  const main = doors.find((d) => d.isMainEntrance) ?? doors[0];
  return setMainEntrance(l, main.id);
}

/** Create a new door or window in the middle of a wall (the longest one by default). */
export function createOpening(l: Layout, kind: OpeningKind, wallIndex?: number): Opening {
  const walls = roomWalls(l.room);
  const wall = wallIndex !== undefined ? walls[wallIndex] : [...walls].sort((a, b) => b.length - a.length)[0];
  const width = kind === 'door' ? 80 : 100;
  return {
    id: newId(kind),
    kind,
    wallIndex: wall.index,
    offset: roundTo(wall.length / 2, 5),
    width: Math.min(width, wall.length),
    isOpen: true,
    isMainEntrance: false,
    hinge: 'start',
    swingsInward: true,
  };
}

export function addOpening(l: Layout, o: Opening): Layout {
  return ensureMainEntrance({ ...l, openings: [...l.openings, o] });
}

/** Keep every opening on a valid wall and fully within that wall's length. */
export function clampOpenings(l: Layout): Layout {
  const walls = roomWalls(l.room);
  return {
    ...l,
    openings: l.openings.map((o) => {
      const wall = walls[o.wallIndex] ?? walls[0];
      return { ...o, wallIndex: wall.index, offset: clampOpeningOffset(wall, o.width, o.offset) };
    }),
  };
}

/** Sensible limits so the room can't be made tiny, huge, or have a notch bigger than itself. */
export const ROOM_LIMITS = { min: 150, max: 2000, minNotch: 50, minLeg: 100, minWall: 5, maxWall: 50 };

/** Clamp room dimensions to ROOM_LIMITS. An L-shape always keeps legs at least 1 m wide. */
export function sanitizeRoom(room: Room): Room {
  const { min, max, minNotch, minLeg, minWall, maxWall } = ROOM_LIMITS;
  const width = clamp(Math.round(room.width), min, max);
  const depth = clamp(Math.round(room.depth), min, max);
  return {
    ...room,
    width,
    depth,
    wallThickness: clamp(Math.round(room.wallThickness), minWall, maxWall),
    notch: {
      corner: room.notch.corner,
      width: clamp(Math.round(room.notch.width), minNotch, width - minLeg),
      depth: clamp(Math.round(room.notch.depth), minNotch, depth - minLeg),
    },
  };
}

/**
 * Change the room's shape or size. Openings are stored relative to a wall,
 * and walls can change (an L-shape has 6, a rectangle 4), so we remember
 * where each opening was in room coordinates and re-attach it to whichever
 * new wall is nearest.
 */
export function setRoom(l: Layout, roomIn: Room): Layout {
  const room = sanitizeRoom(roomIn);
  const oldWalls = roomWalls(l.room);
  const newWalls = roomWalls(room);
  const openings = l.openings.map((o) => {
    const hit = nearestWallPoint(newWalls, openingCenter(oldWalls, o));
    const wall = newWalls[hit.wallIndex];
    return { ...o, wallIndex: hit.wallIndex, offset: clampOpeningOffset(wall, o.width, roundTo(hit.offset, 1)) };
  });
  return { ...l, room, openings };
}
