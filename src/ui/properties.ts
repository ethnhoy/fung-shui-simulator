/**
 * The right-hand panel. It shows the room's settings when nothing is
 * selected, or the selected item's settings otherwise. It is rebuilt from
 * scratch whenever the store changes (simple, and plenty fast here).
 */
import type { Store } from '../editor/store';
import { heightClass, CATALOG, displayName } from '../model/catalog';
import { setFurnitureVariant, setMainEntrance, setRoom, updateFurniture, updateOpening } from '../model/layoutOps';
import { ELEMENTS, type Corner, type Furniture, type Opening, type Room, type Solidity } from '../model/types';
import { formatLength, fromInputValue, toInputValue, unitSuffix, type UnitSystem } from '../geometry/units';
import { deleteSelected, duplicateSelected, rotateSelected } from './actions';
import { h } from './dom';

interface Ctx {
  store: Store;
  units: UnitSystem;
}

// ---------------------------------------------------------------- Field builders

function field(label: string, control: HTMLElement, hint?: string): HTMLElement {
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), control, hint ? h('span', { class: 'field-hint' }, hint) : null);
}

/** A number input showing a cm value in the current units; calls onCommit with cm. */
function lengthInput(ctx: Ctx, key: string, cm: number, onCommit: (cm: number) => void, min = 1): HTMLElement {
  const input = h('input', {
    type: 'number', 'data-field': key, value: toInputValue(cm, ctx.units),
    min: toInputValue(min, ctx.units), step: ctx.units === 'metric' ? 1 : 0.5,
  });
  // 'change' fires when the user presses Enter or leaves the box, not on every keystroke.
  input.addEventListener('change', () => {
    const v = parseFloat(input.value);
    if (Number.isFinite(v) && v > 0) onCommit(fromInputValue(v, ctx.units));
  });
  return h('div', { class: 'input-unit' }, input, h('span', {}, unitSuffix(ctx.units)));
}

function numberInput(key: string, value: number, onCommit: (v: number) => void, suffix: string, step = 1): HTMLElement {
  const input = h('input', { type: 'number', 'data-field': key, value, step });
  input.addEventListener('change', () => {
    const v = parseFloat(input.value);
    if (Number.isFinite(v)) onCommit(v);
  });
  return h('div', { class: 'input-unit' }, input, h('span', {}, suffix));
}

function select<T extends string>(key: string, value: T, options: [T, string][], onChange: (v: T) => void): HTMLElement {
  const el = h('select', { 'data-field': key }, options.map(([v, label]) => h('option', { value: v, selected: v === value }, label)));
  el.addEventListener('change', () => onChange(el.value as T));
  return el;
}

function checkbox(key: string, label: string, checked: boolean, onChange: (v: boolean) => void, disabled = false): HTMLElement {
  const input = h('input', { type: 'checkbox', 'data-field': key, checked, disabled });
  input.addEventListener('change', () => onChange(input.checked));
  return h('label', { class: 'checkbox' }, input, label);
}

function textInput(key: string, value: string, placeholder: string, onCommit: (v: string) => void): HTMLElement {
  const input = h('input', { type: 'text', 'data-field': key, value, placeholder, maxlength: 40 });
  input.addEventListener('change', () => onCommit(input.value));
  return input;
}

const button = (label: string, onclick: () => void, cls = 'btn') => h('button', { type: 'button', class: cls, onclick }, label);

// ---------------------------------------------------------------- Panels

function roomPanel(ctx: Ctx): HTMLElement[] {
  const { store } = ctx;
  const room = store.layout.room;
  const update = (patch: Partial<Room>) => store.commit(setRoom(store.layout, { ...room, ...patch }));
  const updateNotch = (patch: Partial<Room['notch']>) => update({ notch: { ...room.notch, ...patch } });

  return [
    h('h2', { class: 'panel-title' }, 'Room'),
    field('Name', textInput('name', store.layout.name, 'My bedroom', (name) => store.commit({ ...store.layout, name }))),
    field('Shape', select('shape', room.shape, [['rectangle', 'Rectangle'], ['lshape', 'L-shape']], (shape) => update({ shape }))),
    h('div', { class: 'field-row' },
      field('Width', lengthInput(ctx, 'width', room.width, (width) => update({ width }))),
      field('Depth', lengthInput(ctx, 'depth', room.depth, (depth) => update({ depth }))),
    ),
    room.shape === 'lshape'
      ? h('div', { class: 'subsection' },
          field('Cut-out corner', select<Corner>('notchCorner', room.notch.corner, [
            ['top-left', 'Top left'], ['top-right', 'Top right'], ['bottom-right', 'Bottom right'], ['bottom-left', 'Bottom left'],
          ], (corner) => updateNotch({ corner }))),
          h('div', { class: 'field-row' },
            field('Cut-out width', lengthInput(ctx, 'notchWidth', room.notch.width, (width) => updateNotch({ width }))),
            field('Cut-out depth', lengthInput(ctx, 'notchDepth', room.notch.depth, (depth) => updateNotch({ depth }))),
          ),
        )
      : null,
    field('Wall thickness', lengthInput(ctx, 'wallThickness', room.wallThickness, (wallThickness) => update({ wallThickness }))),
    h('p', { class: 'hint' }, 'Drag the round handles on the walls to resize. Click any item to edit it.'),
  ].filter(Boolean) as HTMLElement[];
}

function furniturePanel(ctx: Ctx, f: Furniture): HTMLElement[] {
  const { store } = ctx;
  const entry = CATALOG[f.type];
  const update = (patch: Partial<Furniture>) => store.commit(updateFurniture(store.layout, f.id, patch));
  const hc = heightClass(f.heightCm);
  const heightHint = { low: 'Low', medium: 'Medium', tall: 'Tall: blocks line of sight' }[hc];

  return [
    h('h2', { class: 'panel-title' }, displayName(f)),
    field('Label', textInput('label', f.label, entry.label, (label) => update({ label }))),
    entry.variants
      ? field('Size', select('variant', f.variant, entry.variants.map((v) => [v.id, v.label] as [string, string]),
          (v) => store.commit(setFurnitureVariant(store.layout, f.id, v))))
      : null,
    h('div', { class: 'field-row' },
      field('Width', lengthInput(ctx, 'fwidth', f.width, (width) => update({ width }))),
      field('Depth', lengthInput(ctx, 'fdepth', f.depth, (depth) => update({ depth }))),
    ),
    field('Height', lengthInput(ctx, 'heightCm', f.heightCm, (heightCm) => update({ heightCm })), heightHint),
    field('Rotation',
      h('div', { class: 'rotate-row' },
        numberInput('rotation', f.rotation, (r) => update({ rotation: ((Math.round(r) % 360) + 360) % 360 }), '°'),
        button('↺ 90°', () => rotateSelected(store, -90), 'btn btn-small'),
        button('↻ 90°', () => rotateSelected(store, 90), 'btn btn-small'),
      ),
      entry.hasFront ? 'The small arrow shows which way it faces.' : undefined,
    ),
    h('div', { class: 'subsection' },
      h('h3', {}, 'Feng shui'),
      field('Element', select('element', f.element, ELEMENTS.map((e) => [e, e] as [string, string]), (element) => update({ element: element as Furniture['element'] }))),
      field('Effect on chi', select<Solidity>('solidity', f.solidity, [
        ['solid', 'Solid: blocks chi'], ['porous', 'Porous: slows chi'], ['none', 'None: chi flows over'],
      ], (solidity) => update({ solidity }))),
      checkbox('sharpCorners', 'Sharp corners (can create “poison arrows”)', f.sharpCorners, (sharpCorners) => update({ sharpCorners })),
    ),
    h('div', { class: 'button-row' },
      button('Duplicate', () => duplicateSelected(store)),
      button('Delete', () => deleteSelected(store), 'btn btn-danger'),
    ),
    h('p', { class: 'hint' }, `Position: ${formatLength(f.x, ctx.units)}, ${formatLength(f.y, ctx.units)} from the top-left corner.`),
  ].filter(Boolean) as HTMLElement[];
}

function openingPanel(ctx: Ctx, o: Opening): HTMLElement[] {
  const { store } = ctx;
  const update = (patch: Partial<Opening>) => store.commit(updateOpening(store.layout, o.id, patch));
  const isDoor = o.kind === 'door';
  return [
    h('h2', { class: 'panel-title' }, isDoor ? (o.isMainEntrance ? 'Main door' : 'Door') : 'Window'),
    field('Width', lengthInput(ctx, 'owidth', o.width, (width) => update({ width }), 30)),
    checkbox('isOpen', isDoor ? 'Door is open' : 'Window is open', o.isOpen, (isOpen) => update({ isOpen })),
    isDoor
      ? h('div', { class: 'subsection' },
          checkbox('main', 'Main entrance (where chi enters)', o.isMainEntrance,
            () => store.commit(setMainEntrance(store.layout, o.id)), o.isMainEntrance),
          o.isMainEntrance ? h('p', { class: 'field-hint' }, 'To change this, tick it on another door.') : null,
          checkbox('swingsInward', 'Swings into the room', o.swingsInward, (swingsInward) => update({ swingsInward })),
          button('Flip hinge side', () => update({ hinge: o.hinge === 'start' ? 'end' : 'start' })),
        )
      : null,
    h('div', { class: 'button-row' }, button('Delete', () => deleteSelected(store), 'btn btn-danger')),
    h('p', { class: 'hint' }, `Drag it along the walls to move it. It can jump to another wall.`),
  ].filter(Boolean) as HTMLElement[];
}

// ---------------------------------------------------------------- Wiring

export function buildProperties(root: HTMLElement, store: Store, getUnits: () => UnitSystem): () => void {
  const render = () => {
    // Remember which field had focus so Tab-ing between fields survives the rebuild.
    const focused = (document.activeElement as HTMLElement | null)?.dataset?.field;
    const ctx: Ctx = { store, units: getUnits() };
    const id = store.selectedId;
    const f = store.layout.furniture.find((x) => x.id === id);
    const o = store.layout.openings.find((x) => x.id === id);
    root.replaceChildren(...(f ? furniturePanel(ctx, f) : o ? openingPanel(ctx, o) : roomPanel(ctx)));
    if (focused) root.querySelector<HTMLElement>(`[data-field="${focused}"]`)?.focus();
  };
  store.subscribe(render);
  render();
  return render;
}
