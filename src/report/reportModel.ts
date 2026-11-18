/**
 * Holds the current feng shui Report and keeps it up to date. The score
 * card and the report panel both subscribe to it.
 *
 * It also estimates how many points each suggested fix would gain (by
 * evaluating the fixed layout), and keeps a "before" snapshot for the
 * before/after comparison.
 */
import type { Store } from '../editor/store';
import type { Layout } from '../model/types';
import { evaluate } from '../rules/scoring';
import type { Report, RuleResult } from '../rules/types';
import type { SimController } from '../sim/controller';

const DEBOUNCE_MS = 150;

export interface Snapshot {
  layout: Layout;
  report: Report;
  /** PNG data URL of the plan (with the flow, if it was showing). */
  image: string;
  takenAt: Date;
}

export class ReportModel {
  report: Report;
  /** Estimated overall-score gain per result id (only for results with a fix). */
  gains = new Map<string, number>();
  snapshot: Snapshot | null = null;
  private listeners = new Set<() => void>();
  private timer: number | undefined;
  private gainTimer: number | undefined;

  constructor(
    private store: Store,
    private sim: SimController,
  ) {
    this.report = evaluate(store.layout);
    store.subscribe((kind) => {
      if (kind !== 'selection' && kind !== 'preview') this.schedule();
    });
    let wasSettled = false;
    sim.subscribe((s) => {
      const settled = !!(s.active && s.stats?.settled);
      if (settled !== wasSettled) this.schedule();
      wasSettled = settled;
    });
    this.computeGains();
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  /** Sim stats are only trusted from a settled run of the current layout. */
  private stats() {
    return this.sim.status.active && this.sim.status.stats?.settled ? this.sim.status.stats : null;
  }

  private schedule(): void {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.report = evaluate(this.store.layout, this.stats());
      this.gains.clear();
      this.emit();
      this.computeGains();
    }, DEBOUNCE_MS);
  }

  /**
   * Work out each fix's effect on the score, one fix per tick so the page
   * stays responsive. Both sides are scored without sim stats so the
   * comparison is like-for-like.
   */
  private computeGains(): void {
    window.clearTimeout(this.gainTimer);
    const layout = this.store.layout;
    const base = evaluate(layout).overall;
    const queue = this.report.results.filter((r) => r.fix);
    const step = () => {
      const r = queue.shift();
      if (!r || this.store.layout !== layout) return; // finished, or the layout changed under us
      this.gains.set(r.id, evaluate(r.fix!.apply(layout)).overall - base);
      if (queue.length === 0) this.emit();
      this.gainTimer = window.setTimeout(step, 0);
    };
    this.gainTimer = window.setTimeout(step, 0);
  }

  /** Score the layout a fix would produce (for the preview bar). */
  previewScore(result: RuleResult): { before: number; after: number; layout: Layout } | null {
    if (!result.fix) return null;
    const layout = result.fix.apply(this.store.layout);
    return { before: evaluate(this.store.layout).overall, after: evaluate(layout).overall, layout };
  }

  saveSnapshot(image: string): void {
    this.snapshot = { layout: this.store.layout, report: this.report, image, takenAt: new Date() };
    this.emit();
  }

  clearSnapshot(): void {
    this.snapshot = null;
    this.emit();
  }
}
