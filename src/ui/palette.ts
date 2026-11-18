/**
 * The left-hand palette: click an item to add it to the room.
 */
import type { Store } from '../editor/store';
import { CATALOG, type CatalogEntry } from '../model/catalog';
import { THEME } from './theme';
import { addFurnitureOfType, addOpeningOfKind } from './actions';
import { h } from './dom';

/** Colour swatch shown next to each palette entry (matches how it's drawn on the plan). */
function swatchColour(e: CatalogEntry): string {
  switch (e.type) {
    case 'bed': return THEME.bed.blanket;
    case 'plant': return THEME.plant.fill;
    case 'mirror': return THEME.mirror.fill;
    case 'waterFeature': return THEME.water.fill;
    case 'lamp': return THEME.lamp.fill;
    case 'tv': return THEME.tv.fill;
    case 'rug': return '#ecd3c5';
    case 'column': return THEME.column.fill;
    case 'desk':
    case 'chair': return THEME.wood.fill;
    default: return THEME.storage.fill;
  }
}

export function buildPalette(root: HTMLElement, store: Store): void {
  const button = (label: string, colour: string, onclick: () => void, round = false) =>
    h(
      'button',
      { class: 'palette-item', type: 'button', onclick, title: `Add ${label.toLowerCase()}` },
      h('span', { class: `swatch${round ? ' swatch-round' : ''}`, style: `background:${colour}` }),
      label,
    );

  const section = (title: string, items: HTMLElement[]) =>
    h('section', { class: 'palette-section' }, h('h3', {}, title), h('div', { class: 'palette-grid' }, items));

  const groups: CatalogEntry['group'][] = ['Sleep', 'Storage', 'Work', 'Decor'];
  const roundTypes = new Set(['plant', 'lamp', 'waterFeature']);

  root.replaceChildren(
    h('h2', { class: 'panel-title' }, 'Add to room'),
    section('Doors & windows', [
      button('Door', THEME.door, () => addOpeningOfKind(store, 'door')),
      button('Window', THEME.windowGlass, () => addOpeningOfKind(store, 'window')),
    ]),
    ...groups.map((g) =>
      section(
        g,
        Object.values(CATALOG)
          .filter((e) => e.group === g)
          .map((e) => button(e.label, swatchColour(e), () => addFurnitureOfType(store, e.type), roundTypes.has(e.type))),
      ),
    ),
    h('p', { class: 'hint' }, 'New items appear in the middle of the room. Drag them into place.'),
  );
}
