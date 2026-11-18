/**
 * A compact score summary at the top of the right panel: the overall score,
 * its label, a bar per category and a count of issues. It reads from the
 * shared ReportModel, so the score is only calculated once per change.
 */
import type { ReportModel } from '../report/reportModel';
import type { Report } from '../rules/types';
import { h } from './dom';

/** Icon + colour per label, so the meaning never relies on colour alone. */
const LABEL_STYLE: Record<Report['label'], { icon: string; cls: string }> = {
  Harmonious: { icon: '☯', cls: 'score-great' },
  Good: { icon: '✓', cls: 'score-good' },
  'Needs attention': { icon: '!', cls: 'score-mid' },
  Unsettled: { icon: '✕', cls: 'score-low' },
};

export function buildScoreCard(root: HTMLElement, model: ReportModel): void {
  function render(): void {
    const report = model.report;
    const style = LABEL_STYLE[report.label];
    const issues = report.results.filter((r) => r.status === 'bad' || r.status === 'warn').length;
    const working = report.results.filter((r) => r.status === 'good' && r.category !== 'bagua').length;
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
    );
  }
  model.subscribe(render);
  render();
}
