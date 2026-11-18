/**
 * A compact score summary at the top of the right panel: the overall score,
 * its label, a bar per category and a count of issues. (The full report
 * with click-to-highlight and fixes arrives in milestone 4.)
 *
 * Re-scores when the layout changes, and again when a simulation settles
 * so the chi flow category includes the flow statistics.
 */
import type { Store } from '../editor/store';
import type { SimController } from '../sim/controller';
import { evaluate } from '../rules/scoring';
import type { Report } from '../rules/types';
import { h } from './dom';

const DEBOUNCE_MS = 150;

/** Icon + colour per label, so the meaning never relies on colour alone. */
const LABEL_STYLE: Record<Report['label'], { icon: string; cls: string }> = {
  Harmonious: { icon: '☯', cls: 'score-great' },
  Good: { icon: '✓', cls: 'score-good' },
  'Needs attention': { icon: '!', cls: 'score-mid' },
  Unsettled: { icon: '✕', cls: 'score-low' },
};

export function buildScoreCard(root: HTMLElement, store: Store, sim: SimController): { latest: () => Report } {
  let report = evaluate(store.layout);
  let timer: number | undefined;

  const recompute = () => {
    // Only trust sim stats from a settled run of the *current* layout (the controller clears them on every change).
    const stats = sim.status.active && sim.status.stats?.settled ? sim.status.stats : null;
    report = evaluate(store.layout, stats);
    render();
  };
  const schedule = () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(recompute, DEBOUNCE_MS);
  };

  store.subscribe((kind) => {
    if (kind !== 'selection' && kind !== 'preview') schedule();
  });
  let wasSettled = false;
  sim.subscribe((s) => {
    const settled = !!(s.active && s.stats?.settled);
    if (settled !== wasSettled) schedule();
    wasSettled = settled;
  });

  function render(): void {
    const style = LABEL_STYLE[report.label];
    const issues = report.results.filter((r) => r.status === 'bad' || r.status === 'warn').length;
    const working = report.results.filter((r) => r.status === 'good').length;
    root.replaceChildren(
      h('div', { class: `score-head ${style.cls}` },
        h('div', { class: 'score-number', 'aria-label': `Score ${report.overall} out of 100` }, String(report.overall)),
        h('div', {},
          h('div', { class: 'score-label' }, `${style.icon} ${report.label}`),
          h('div', { class: 'field-hint' }, `${issues} issue${issues === 1 ? '' : 's'} · ${working} things working`),
        ),
      ),
      h('div', { class: 'score-bars' },
        report.categories.filter((c) => c.weight > 0).map((c) =>
          h('div', { class: 'score-bar-row', title: `${c.label}: ${c.score}/100 (weight ${c.weight}%)` },
            h('span', { class: 'score-bar-label' }, c.label),
            h('span', { class: 'score-bar' }, h('span', { class: 'score-bar-fill', style: `width:${c.score}%` })),
            h('span', { class: 'score-bar-value' }, String(c.score)),
          ),
        ),
      ),
      ...(report.usedSimulation ? [] : [h('p', { class: 'field-hint' }, 'Chi flow uses the simulation: switch to Simulate to include it.')]),
    );
  }
  render();
  return { latest: () => report };
}
