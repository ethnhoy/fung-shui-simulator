/**
 * Saves the layout to the browser's localStorage (a small key/value store
 * that survives page reloads) and loads it back on the next visit.
 */
import type { Store } from '../editor/store';
import type { UnitSystem } from '../geometry/units';
import { sampleLayout } from '../model/sample';
import type { Layout } from '../model/types';
import { parseLayout } from '../model/validate';

const LAYOUT_KEY = 'chiflow.layout.v1';
const PREFS_KEY = 'chiflow.prefs.v1';

export interface Prefs {
  units: UnitSystem;
}

/** localStorage can throw (private browsing, storage full), so every access is guarded. */
function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not fatal: the app still works, it just won't remember changes.
  }
}

/** The saved layout, or the sample bedroom on a first visit (or if the save is unreadable). */
export function loadLayout(): Layout {
  const raw = safeGet(LAYOUT_KEY);
  if (!raw) return sampleLayout();
  try {
    return parseLayout(JSON.parse(raw));
  } catch (err) {
    console.warn('Saved layout was unreadable, loading the sample instead.', err);
    return sampleLayout();
  }
}

/**
 * Save after every change, but "debounced": wait until changes stop for
 * 300 ms so a burst of edits causes one write, not dozens.
 */
export function startAutosave(store: Store): void {
  let timer: number | undefined;
  store.subscribe((kind) => {
    if (kind === 'selection' || kind === 'preview') return;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => safeSet(LAYOUT_KEY, JSON.stringify(store.layout)), 300);
  });
}

export function loadPrefs(): Prefs {
  try {
    const p = JSON.parse(safeGet(PREFS_KEY) ?? '{}');
    return { units: p.units === 'imperial' ? 'imperial' : 'metric' };
  } catch {
    return { units: 'metric' };
  }
}

export function savePrefs(prefs: Prefs): void {
  safeSet(PREFS_KEY, JSON.stringify(prefs));
}
