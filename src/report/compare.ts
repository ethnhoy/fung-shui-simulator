/**
 * Before/after: save a snapshot (layout, report and a picture of the plan),
 * then compare it side by side with the current state.
 */
import type { Editor } from '../editor/editor';
import type { Report } from '../rules/types';
import { h } from '../ui/dom';
import type { ReportModel } from './reportModel';

/** Picture of the plan: the flow canvas (if showing) with the editor drawn on top. */
export function capturePlan(editor: Editor, flowCanvas: HTMLCanvasElement): string {
  const plan = editor.toCanvas();
  const out = document.createElement('canvas');
  out.width = plan.width;
  out.height = plan.height;
  const ctx = out.getContext('2d')!;
  ctx.fillStyle = '#f6f1ea';
  ctx.fillRect(0, 0, out.width, out.height);
  // The flow canvas is drawn at device resolution; scale it to the editor's size.
  if (flowCanvas.width > 0) ctx.drawImage(flowCanvas, 0, 0, out.width, out.height);
  ctx.drawImage(plan, 0, 0);
  return out.toDataURL('image/png');
}

function column(title: string, image: string, report: Report, other: Report | null): HTMLElement {
  return h('div', { class: 'compare-col' },
    h('h3', {}, title),
    h('img', { src: image, alt: `${title}: the room plan`, class: 'compare-img' }),
    h('div', { class: 'compare-score' },
      h('span', { class: 'compare-number' }, String(report.overall)),
      h('span', {}, report.label),
      report.usedSimulation ? null : h('span', { class: 'field-hint' }, ' (without simulation)'),
    ),
    h('ul', { class: 'compare-cats' },
      report.categories.filter((c) => c.weight > 0).map((c) => {
        const prev = other?.categories.find((x) => x.id === c.id)?.score;
        const delta = prev === undefined ? 0 : c.score - prev;
        return h('li', {},
          h('span', {}, c.label),
          h('span', { class: 'compare-cat-score' },
            String(c.score),
            delta !== 0 ? h('span', { class: delta > 0 ? 'delta up' : 'delta down' }, ` ${delta > 0 ? '▲' : '▼'}${Math.abs(delta)}`) : null,
          ),
        );
      }),
    ),
  );
}

export function openCompare(model: ReportModel, currentImage: string): void {
  const snap = model.snapshot;
  if (!snap) return;
  const close = () => {
    backdrop.remove();
    window.removeEventListener('keydown', onKey);
  };
  const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
  const diff = model.report.overall - snap.report.overall;
  const backdrop = h('div', { class: 'modal-backdrop', onclick: (e: Event) => e.target === backdrop && close() },
    h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Before and after' },
      h('div', { class: 'modal-head' },
        h('h2', {}, 'Before and after'),
        h('span', { class: diff > 0 ? 'delta up' : diff < 0 ? 'delta down' : 'field-hint' },
          diff === 0 ? 'Same score' : `${diff > 0 ? '▲ +' : '▼ '}${diff} points`),
        h('button', { type: 'button', class: 'btn btn-small', onclick: close, 'aria-label': 'Close' }, 'Close'),
      ),
      h('div', { class: 'compare-grid' },
        column(`Before (${snap.takenAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`, snap.image, snap.report, null),
        column('Now', currentImage, model.report, snap.report),
      ),
      h('p', { class: 'field-hint' }, 'Tip: save the “before” in Simulate mode to include the chi flow in the picture.'),
    ),
  );
  document.body.append(backdrop);
  window.addEventListener('keydown', onKey);
}
