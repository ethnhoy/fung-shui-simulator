/**
 * Top toolbar: mode switch, undo/redo, units, import/export, reset.
 */
import type { Store } from '../editor/store';
import type { UnitSystem } from '../geometry/units';
import { sampleLayout } from '../model/sample';
import { exportLayout, importLayoutFile } from '../storage/importExport';
import { shareUrl } from '../storage/share';
import { openAbout } from './about';
import { h, toast } from './dom';

export type AppMode = 'edit' | 'simulate';

interface ToolbarOptions {
  store: Store;
  getUnits: () => UnitSystem;
  setUnits: (u: UnitSystem) => void;
  setMode: (m: AppMode) => void;
}

/** Builds the toolbar. Returns a function to switch mode from code (e.g. ?mode=simulate in the URL). */
export function buildToolbar(root: HTMLElement, { store, getUnits, setUnits, setMode }: ToolbarOptions): (m: AppMode) => void {
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
    // Each mode carries a bagua trigram: ☶ 艮 mountain (stillness) for Edit, ☴ 巽 wind for Simulate.
    const btn = h('button', { type: 'button', class: 'mode', role: 'tab', 'data-mode': m },
      h('span', { class: 'trigram', 'aria-hidden': 'true' }, m === 'edit' ? '☶' : '☴'),
      m === 'edit' ? 'Edit' : 'Simulate');
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
    // The logo is a seal stamp with 气 (chi), the way a painter signs their work.
    h('div', { class: 'brand' }, h('span', { class: 'seal', 'aria-hidden': 'true' }, '气'), 'Chi Flow'),
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
    h('button', {
      type: 'button', class: 'btn', title: 'Copy a link that opens this exact room',
      onclick: async () => {
        const url = shareUrl(store.layout);
        try {
          await navigator.clipboard.writeText(url);
          toast('Share link copied to the clipboard.');
        } catch {
          // Clipboard access can be refused; fall back to a prompt the user can copy from.
          window.prompt('Copy this link:', url);
        }
      },
    }, 'Share'),
    h('span', { class: 'toolbar-sep' }),
    h('button', { type: 'button', class: 'btn', onclick: openAbout, title: 'What is this?' }, 'About'),
    fileInput,
  );
  return selectMode;
}
