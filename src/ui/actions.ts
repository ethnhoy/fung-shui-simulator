/**
 * User actions shared by the palette, properties panel and keyboard
 * shortcuts. Each one reads the store, builds a new Layout and commits it.
 */
import type { Store } from '../editor/store';
import { roomInteriorPoint, roomWalls } from '../geometry/room';
import { snapFurniturePosition } from '../geometry/snapping';
import { normalizeAngle } from '../geometry/vec';
import { createFurniture, newId } from '../model/catalog';
import { addFurniture, addOpening, createOpening, removeById, updateFurniture } from '../model/layoutOps';
import type { FurnitureType, OpeningKind } from '../model/types';

export function addFurnitureOfType(store: Store, type: FurnitureType): void {
  const room = store.layout.room;
  const centre = roomInteriorPoint(room);
  const f = createFurniture(type, centre.x, centre.y);
  const p = snapFurniturePosition(f, centre, roomWalls(room), room);
  const item = { ...f, ...p };
  store.commit(addFurniture(store.layout, item));
  store.select(item.id);
}

export function addOpeningOfKind(store: Store, kind: OpeningKind): void {
  const o = createOpening(store.layout, kind);
  store.commit(addOpening(store.layout, o));
  store.select(o.id);
}

export function deleteSelected(store: Store): void {
  const id = store.selectedId;
  if (id) store.commit(removeById(store.layout, id));
}

export function duplicateSelected(store: Store): void {
  const f = store.layout.furniture.find((x) => x.id === store.selectedId);
  if (!f) return;
  const copy = { ...f, id: newId(f.type), x: f.x + 20, y: f.y + 20 };
  store.commit(addFurniture(store.layout, copy));
  store.select(copy.id);
}

export function rotateSelected(store: Store, delta: number): void {
  const f = store.layout.furniture.find((x) => x.id === store.selectedId);
  if (!f) return;
  store.commit(updateFurniture(store.layout, f.id, { rotation: normalizeAngle(Math.round(f.rotation + delta)) }));
}

export function nudgeSelected(store: Store, dx: number, dy: number): void {
  const f = store.layout.furniture.find((x) => x.id === store.selectedId);
  if (!f) return;
  store.commit(updateFurniture(store.layout, f.id, { x: f.x + dx, y: f.y + dy }));
}
