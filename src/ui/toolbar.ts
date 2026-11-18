/**
 * Top toolbar: mode switch, undo/redo, units, import/export, reset.
 */
import type { Store } from '../editor/store';
import type { UnitSystem } from '../geometry/units';
import { sampleLayout } from '../model/sample';
import { exportLayout, importLayoutFile } from '../storage/importExport';
import { h, toast } from './dom';

export type AppMode = 'edit' | 'simulate';

interface ToolbarOptions {
  store: Store;
  getUnits: () => UnitSystem;
  setUnits: (u: UnitSystem) => void;
  setMode: (m: AppMode) => void;
}

export function buildToolbar(root: HTMLElement, { store, getUnits, setUnits, setMode }: ToolbarOptions): void {
  const isMac = navigator.platform.toLowerCase().includes('mac');
  const mod = isMac ? '⌘' : 'Ctrl+';

  const undoBtn = h('button', { type: 'button', class: 'btn', title: `Undo (${mod}Z)`, onclick: () => store.undo() }, '↶ Undo');
  const redoBtn = h('button', { type: 'button', class: 'btn', title: `Redo (${mod}⇧Z)`, onclick: () => store.redo() }, '↷ Redo');

  const unitsBtn = h('button', { type: 'button', class: 'btn', title: 'Switch between metric and imperial' });
  const refreshUnits = () => (unitsBtn.textContent = getUnits() === 'metric' ? 'Units: cm' : 'Units: ft/in');
  unitsBtn.addEventListener('click', () => {
    setUnits(getUnits() === 'metric' ? 'imperial' : 'metric');
    refreshUnits();
  });

  // A hidden <input type="file"> does the actual file picking.
  const fileInput = h('input', { type: 'file', accept: '.json,application/json', hidden: true });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    try {
      store.replace(await importLayoutFile(file));
      toast(`Imported “${store.layout.name}”.`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Import failed.', 'error');
    }
  });

  // Edit / Simulate switch. Both modes allow moving furniture; Simulate adds the chi flow.
  const modeButtons = (['edit', 'simulate'] as AppMode[]).map((m) => {
    const btn = h('button', { type: 'button', class: 'mode', role: 'tab', 'data-mode': m }, m === 'edit' ? 'Edit' : 'Simulate');
    btn.addEventListener('click', () => selectMode(m));
    return btn;
  });
  const selectMode = (m: AppMode) => {
    for (const b of modeButtons) {
      const active = b.dataset.mode === m;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', String(active));
    }
    setMode(m);
  };
  const modeSwitch = h('div', { class: 'mode-switch', role: 'tablist', 'aria-label': 'Mode' }, modeButtons);
  modeButtons[0].classList.add('active');

  const refreshHistory = () => {
    undoBtn.disabled = !store.canUndo;
    redoBtn.disabled = !store.canRedo;
  };
  store.subscribe(refreshHistory);
  refreshHistory();
  refreshUnits();

  root.replaceChildren(
    h('div', { class: 'brand' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, '◐'), 'Chi Flow'),
    modeSwitch,
    h('div', { class: 'toolbar-spacer' }),
    undoBtn,
    redoBtn,
    h('span', { class: 'toolbar-sep' }),
    unitsBtn,
    h('span', { class: 'toolbar-sep' }),
    h('button', { type: 'button', class: 'btn', onclick: () => fileInput.click(), title: 'Load a layout from a .json file' }, 'Import'),
    h('button', { type: 'button', class: 'btn', onclick: () => exportLayout(store.layout), title: 'Download this layout as .json' }, 'Export'),
    h('button', {
      type: 'button', class: 'btn', title: 'Replace the room with the sample bedroom (undoable)',
      onclick: () => {
        store.replace(sampleLayout());
        toast('Loaded the sample bedroom. Press Undo to go back.');
      },
    }, 'Sample room'),
    fileInput,
  );
}
