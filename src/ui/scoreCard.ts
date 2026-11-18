/**
 * A compact score summary at the top of the right panel: the overall score,
 * its label, a bar per category and a count of issues. It reads from the
 * shared ReportModel, so the score is only calculated once per change.
 */
import type { ReportModel } from '../report/reportModel';
import type { Report } from '../rules/types';
import { h } from './dom';

/** Icon + colour per label, so the meaning never relies on colour alone. */
const LABEL_STYLE: Record<Report['label'], { icon: string; char: string; cls: string }> = {
  // 和 harmony, 良 good, 慎 take care, 乱 disorder
  Harmonious: { icon: '☯', char: '和', cls: 'score-great' },
  Good: { icon: '✓', char: '良', cls: 'score-good' },
  'Needs attention': { icon: '!', char: '慎', cls: 'score-mid' },
  Unsettled: { icon: '✕', char: '乱', cls: 'score-low' },
};

/** A character for each score category: 床 bed, 箭 arrow, 镜 mirror, 气 chi, 净 tidy, 行 the five elements (五行). */
const CATEGORY_CHAR: Record<string, string> = { bed: '床', arrows: '箭', mirrors: '镜', flow: '气', clutter: '净', elements: '行' };

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
          h('div', { class: 'score-label' },
            h('span', { class: 'score-char', 'aria-hidden': 'true' }, style.char),
            `${style.icon} ${report.label}`),
          h('div', { class: 'field-hint' }, `${issues} issue${issues === 1 ? '' : 's'} · ${working} things working`),
        ),
      ),
      h('div', { class: 'score-bars' },
        report.categories.filter((c) => c.weight > 0).map((c) =>
          h('div', { class: 'score-bar-row', title: `${c.label}: ${c.score}/100 (weight ${c.weight}%)` },
            h('span', { class: 'score-bar-char', 'aria-hidden': 'true' }, CATEGORY_CHAR[c.id] ?? ''),
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
