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
import { buildToolbar, type AppMode } from './ui/toolbar';
import { SimController, type SimStatus } from './sim/controller';
import { buildSimPanel } from './ui/simPanel';
import { buildScoreCard } from './ui/scoreCard';
import { ReportModel } from './report/reportModel';
import { FixPreview } from './report/fixPreview';
import { buildReportPanel } from './report/reportPanel';
import { capturePlan, openCompare } from './report/compare';
import { BestSpotRunner } from './report/bestSpot';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

const store = new Store(loadLayout());
const prefs = loadPrefs();
const getUnits = (): UnitSystem => prefs.units;

startAutosave(store);

const editor = new Editor($<HTMLDivElement>('canvas-host'), store, getUnits);
buildPalette($('palette'), store);
const refreshProperties = buildProperties($('properties'), store, getUnits);
// ---------------------------------------------------------------- Simulate mode

const sim = new SimController($<HTMLCanvasElement>('flow-canvas'), store, () => editor.getView());
buildSimPanel($('sim-panel'), sim);

// ---------------------------------------------------------------- Report

const reportModel = new ReportModel(store, sim);
buildScoreCard($('score-card'), reportModel);
const fixPreview = new FixPreview($('fix-bar'), editor, store, reportModel);
const plan = () => capturePlan(editor, $<HTMLCanvasElement>('flow-canvas'));
buildReportPanel($('report-panel'), {
  store,
  editor,
  model: reportModel,
  preview: fixPreview,
  onSnapshot: () => reportModel.saveSnapshot(plan()),
  onCompare: () => openCompare(reportModel, plan()),
});

// Right panel tabs: Report / Properties. Selecting something on the plan opens Properties.
function showTab(tab: 'report' | 'properties'): void {
  $('report-panel').hidden = tab !== 'report';
  $('properties').hidden = tab !== 'properties';
  for (const b of document.querySelectorAll<HTMLButtonElement>('.panel-tabs button')) {
    const active = b.dataset.tab === tab;
    b.classList.toggle('active', active);
    b.setAttribute('aria-selected', String(active));
  }
}
for (const b of document.querySelectorAll<HTMLButtonElement>('.panel-tabs button')) {
  b.addEventListener('click', () => showTab(b.dataset.tab as 'report' | 'properties'));
}
store.subscribe((kind) => {
  if (kind === 'selection' && store.selectedId) showTab('properties');
});
const refreshTabBadge = () => {
  const n = reportModel.report.results.filter((r) => r.status === 'bad' || r.status === 'warn').length;
  $('report-tab-count').textContent = n ? String(n) : '';
};
reportModel.subscribe(refreshTabBadge);
refreshTabBadge();
showTab('report');

// Best-spot heatmap while dragging the bed or a desk.
const bestSpot = new BestSpotRunner();
editor.onFurnitureDragStart = (id) => {
  const f = store.layout.furniture.find((x) => x.id === id);
  if (!f || (f.type !== 'bed' && f.type !== 'desk')) return;
  // About 25 cells across the longest side keeps it quick in any room size.
  const step = Math.max(15, Math.round(Math.max(store.layout.room.width, store.layout.room.depth) / 25 / 5) * 5);
  bestSpot.start(store.layout, id, step, (cells, done) => editor.setBestSpot({ cells, step, done, id }));
};
editor.onFurnitureDragEnd = () => {
  bestSpot.stop();
  editor.setBestSpot(null);
};

function setMode(mode: AppMode): void {
  const simulate = mode === 'simulate';
  $('palette').hidden = simulate;
  $('sim-panel').hidden = !simulate;
  editor.setSimulateMode(simulate);
  if (simulate) sim.enter();
  else sim.exit();
  updateBanner(sim.status);
}

/** Message shown over the plan when the flow needs explaining. */
function updateBanner(s: SimStatus): void {
  const banner = $('sim-banner');
  let text = '';
  if (s.active) {
    if (s.mode === 'doorClosed') text = 'Open the door to let chi in.';
    else if (s.mode === 'noDoor') text = 'Add a door so chi has a way in.';
    else if (s.unstable) text = 'The simulation went unstable. Press Reset to try again.';
    else if (s.mode === 'split') {
      text = 'Only the door is open, so chi flows in through one half of the doorway and out through the other. Open a window for a fuller flow.';
    }
  }
  banner.textContent = text;
  banner.hidden = !text;
}
sim.subscribe(updateBanner);

buildToolbar($('toolbar'), {
  store,
  getUnits,
  setUnits: (units) => {
    prefs.units = units;
    savePrefs(prefs);
    refreshProperties();
    editor.render();
  },
  setMode,
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
    editor.setHighlight(null);
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

// Development only: expose the main objects in the browser console for debugging.
// (Vite strips this block out of production builds because import.meta.env.DEV is false there.)
if (import.meta.env.DEV) {
  Object.assign(window, { chi: { store, editor, sim, reportModel } });
}
