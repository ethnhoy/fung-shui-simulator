/**
 * App entry point: creates the store, the editor and the panels, and
 * wires up keyboard shortcuts. This is the "main()" of the web app.
 */
import './ui/styles.css';
import { Editor } from './editor/editor';
import { Store } from './editor/store';
import type { UnitSystem } from './geometry/units';
import { loadLayout, loadPrefs, savePrefs, startAutosave } from './storage/autosave';
import { deleteSelected, duplicateSelected, nudgeSelected, rotateSelected } from './ui/actions';
import { buildPalette } from './ui/palette';
import { buildProperties } from './ui/properties';
import { buildToolbar } from './ui/toolbar';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const store = new Store(loadLayout());
const prefs = loadPrefs();
const getUnits = (): UnitSystem => prefs.units;

startAutosave(store);

const editor = new Editor($<HTMLDivElement>('canvas-host'), store, getUnits);
buildPalette($('palette'), store);
const refreshProperties = buildProperties($('properties'), store, getUnits);
buildToolbar($('toolbar'), {
  store,
  getUnits,
  setUnits: (units) => {
    prefs.units = units;
    savePrefs(prefs);
    refreshProperties();
    editor.render();
  },
});

// ---------------------------------------------------------------- Keyboard shortcuts

window.addEventListener('keydown', (e) => {
  // Don't steal keys while the user is typing in a form field.
  const t = e.target as HTMLElement;
  if (t.closest('input, select, textarea')) return;

  const mod = e.metaKey || e.ctrlKey;
  const key = e.key.toLowerCase();

  if (mod && key === 'z') {
    e.preventDefault();
    if (e.shiftKey) store.redo();
    else store.undo();
  } else if (mod && key === 'y') {
    e.preventDefault();
    store.redo();
  } else if (mod && key === 'd') {
    e.preventDefault();
    duplicateSelected(store);
  } else if (key === 'delete' || key === 'backspace') {
    e.preventDefault();
    deleteSelected(store);
  } else if (key === 'escape') {
    store.select(null);
  } else if (key === 'r' && !mod) {
    rotateSelected(store, e.shiftKey ? -90 : 90);
  } else if (key.startsWith('arrow')) {
    const step = e.shiftKey ? 1 : 5;
    const d = { arrowleft: [-step, 0], arrowright: [step, 0], arrowup: [0, -step], arrowdown: [0, step] }[key];
    if (d && store.selectedId) {
      e.preventDefault();
      nudgeSelected(store, d[0], d[1]);
    }
  }
});
