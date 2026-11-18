/**
 * The left-hand palette: click an item to add it to the room.
 * Each furniture button shows its default element as a character badge
 * (木 Wood, 火 Fire, 土 Earth, 金 Metal, 水 Water), so the five elements are
 * visible while you furnish the room.
 */
import type { Store } from '../editor/store';
import { CATALOG, type CatalogEntry } from '../model/catalog';
import type { Element } from '../model/types';
import { addFurnitureOfType, addOpeningOfKind } from './actions';
import { h } from './dom';

export const ELEMENT_CHAR: Record<Element, string> = { Wood: '木', Fire: '火', Earth: '土', Metal: '金', Water: '水' };

export function buildPalette(root: HTMLElement, store: Store): void {
  const button = (label: string, badge: HTMLElement, onclick: () => void, title: string, extraClass = '') =>
    h('button', { class: `palette-item${extraClass}`, type: 'button', onclick, title }, badge, label);

  const elementBadge = (e: Element) =>
    h('span', { class: `el-badge el-${e.toLowerCase()}`, 'aria-hidden': 'true' }, ELEMENT_CHAR[e]);
  const openingBadge = (char: string) => h('span', { class: 'el-badge', 'aria-hidden': 'true' }, char);

  const section = (title: string, items: HTMLElement[]) =>
    h('section', { class: 'palette-section' }, h('h3', {}, title), h('div', { class: 'palette-grid' }, items));

  const groups: CatalogEntry['group'][] = ['Sleep', 'Storage', 'Work', 'Decor'];

  root.replaceChildren(
    h('h2', { class: 'panel-title' }, 'Add to room'),
    section('Doors & windows', [
      button('Door', openingBadge('门'), () => addOpeningOfKind(store, 'door'), 'Add a door', ' is-opening'),
      button('Window', openingBadge('窗'), () => addOpeningOfKind(store, 'window'), 'Add a window', ' is-opening'),
    ]),
    ...groups.map((g) =>
      section(
        g,
        Object.values(CATALOG)
          .filter((e) => e.group === g)
          .map((e) => button(e.label, elementBadge(e.element), () => addFurnitureOfType(store, e.type),
            `Add ${e.label.toLowerCase()} (element: ${e.element} ${ELEMENT_CHAR[e.element]})`)),
      ),
    ),
    h('p', { class: 'hint' }, 'The badge shows each item’s element: 木 Wood, 火 Fire, 土 Earth, 金 Metal, 水 Water. New items appear in the middle of the room.'),
  );
}
