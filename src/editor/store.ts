/**
 * The app's single source of truth: the current Layout, what's selected,
 * and the undo/redo history.
 *
 * Other parts of the app *subscribe* to the store (the observer pattern,
 * like Java's listeners) and redraw whenever it changes.
 *
 * Undo/redo works by keeping old Layouts. Because Layouts are never edited
 * in place, keeping a reference to the old one is enough: no copying needed.
 */
import type { Layout } from '../model/types';

export type ChangeKind = 'commit' | 'preview' | 'selection' | 'history' | 'replace';
export type Listener = (kind: ChangeKind) => void;

const MAX_HISTORY = 100;

export class Store {
  private _layout: Layout;
  private _selectedId: string | null = null;
  private undoStack: Layout[] = [];
  private redoStack: Layout[] = [];
  /** Layout at the start of a drag, so the whole drag becomes one undo step. */
  private gestureBase: Layout | null = null;
  private listeners = new Set<Listener>();

  constructor(initial: Layout) {
    this._layout = initial;
  }

  get layout(): Layout {
    return this._layout;
  }

  get selectedId(): string | null {
    return this._selectedId;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(kind: ChangeKind): void {
    for (const fn of this.listeners) fn(kind);
  }

  /** Apply a change and record it as one undoable step. */
  commit(next: Layout): void {
    const base = this.gestureBase ?? this._layout;
    this.gestureBase = null;
    if (next === base) return;
    this.undoStack.push(base);
    if (this.undoStack.length > MAX_HISTORY) this.undoStack.shift();
    this.redoStack = [];
    this._layout = next;
    this.dropMissingSelection();
    this.emit('commit');
  }

  /**
   * Show a temporary change (e.g. while dragging) without adding history.
   * The first preview remembers the starting layout; the next commit()
   * then records the whole gesture as a single undo step.
   */
  preview(next: Layout): void {
    if (!this.gestureBase) this.gestureBase = this._layout;
    this._layout = next;
    this.emit('preview');
  }

  /** Abandon a preview and go back to where the gesture started. */
  cancelPreview(): void {
    if (!this.gestureBase) return;
    this._layout = this.gestureBase;
    this.gestureBase = null;
    this.emit('preview');
  }

  /** Replace the whole layout (import, reset to sample). Still undoable. */
  replace(next: Layout): void {
    this.commit(next);
    this._selectedId = null;
    this.emit('replace');
  }

  select(id: string | null): void {
    if (id === this._selectedId) return;
    this._selectedId = id;
    this.emit('selection');
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(): void {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(this._layout);
    this._layout = prev;
    this.gestureBase = null;
    this.dropMissingSelection();
    this.emit('history');
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(this._layout);
    this._layout = next;
    this.gestureBase = null;
    this.dropMissingSelection();
    this.emit('history');
  }

  /** If the selected item no longer exists (deleted, undone), clear the selection. */
  private dropMissingSelection(): void {
    const id = this._selectedId;
    if (!id) return;
    const exists = this._layout.furniture.some((f) => f.id === id) || this._layout.openings.some((o) => o.id === id);
    if (!exists) this._selectedId = null;
  }
}
