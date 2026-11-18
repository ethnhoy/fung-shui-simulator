/**
 * Compare two layouts: which furniture was added, removed or changed.
 * Used to draw a "ghost" preview of a suggested fix before applying it.
 */
import type { Furniture, Layout } from '../model/types';

export interface LayoutDiff {
  added: Furniture[];
  removed: Furniture[];
  changed: { before: Furniture; after: Furniture }[];
  /** Doors/windows or the room itself changed (we just flag it; fixes rarely do this). */
  structureChanged: boolean;
}

const same = (a: Furniture, b: Furniture) => JSON.stringify(a) === JSON.stringify(b);

export function diffLayouts(before: Layout, after: Layout): LayoutDiff {
  const beforeById = new Map(before.furniture.map((f) => [f.id, f]));
  const afterById = new Map(after.furniture.map((f) => [f.id, f]));
  return {
    added: after.furniture.filter((f) => !beforeById.has(f.id)),
    removed: before.furniture.filter((f) => !afterById.has(f.id)),
    changed: after.furniture
      .filter((f) => beforeById.has(f.id) && !same(beforeById.get(f.id)!, f))
      .map((f) => ({ before: beforeById.get(f.id)!, after: f })),
    structureChanged:
      JSON.stringify(before.room) !== JSON.stringify(after.room) ||
      JSON.stringify(before.openings) !== JSON.stringify(after.openings),
  };
}

export function isEmptyDiff(d: LayoutDiff): boolean {
  return !d.added.length && !d.removed.length && !d.changed.length && !d.structureChanged;
}
