/**
 * The report panel: What's working, Issues (most severe first) and How to
 * improve, plus the bagua map. Clicking an item highlights its cause on
 * the plan; "Try this fix" opens a ghost preview.
 */
import type { Editor } from '../editor/editor';
import type { Store } from '../editor/store';
import { baguaZones } from '../rules/bagua';
import { CATEGORY_LABELS } from '../rules/config';
import type { RuleResult, Status } from '../rules/types';
import { h } from '../ui/dom';
import type { FixPreview } from './fixPreview';
import type { ReportModel } from './reportModel';

/** Icons so status never relies on colour alone. */
const ICON: Record<Status, string> = { bad: '✕', warn: '!', info: 'i', good: '✓' };
const STATUS_WORD: Record<Status, string> = { bad: 'Problem', warn: 'Worth a look', info: 'Tip', good: 'Working' };

interface PanelDeps {
  store: Store;
  editor: Editor;
  model: ReportModel;
  preview: FixPreview;
  onSnapshot: () => void;
  onCompare: () => void;
}

export function buildReportPanel(root: HTMLElement, deps: PanelDeps): void {
  const { store, editor, model, preview } = deps;
  /** The report item currently highlighted on the plan (kept across re-renders). */
  let activeId: string | null = null;
  let showBagua = false;
  let baguaOpen = false; // remember whether the <details> section is expanded

  const setActive = (r: RuleResult | null) => {
    activeId = r && r.id !== activeId ? r.id : null;
    const current = model.report.results.find((x) => x.id === activeId);
    editor.setHighlight(current ? current.highlight : null, current?.status);
    render();
  };

  // Clicking on the plan or editing clears the highlight.
  store.subscribe((kind) => {
    if (kind === 'selection' && store.selectedId && activeId) {
      activeId = null;
      editor.setHighlight(null);
      render();
    }
  });
  preview.onChange = (open) => {
    if (open) activeId = null;
    render();
  };
  model.subscribe(() => {
    // Keep the highlight if the same item still exists (its shapes may have moved).
    const current = model.report.results.find((x) => x.id === activeId);
    if (!current) activeId = null;
    editor.setHighlight(current ? current.highlight : null, current?.status);
    if (showBagua) editor.setBagua(baguaZones(store.layout));
    render();
  });

  function fixButton(r: RuleResult): HTMLElement | null {
    if (!r.fix) return null;
    const gain = model.gains.get(r.id);
    const label = gain && gain > 0 ? `Try this fix (+${gain})` : 'Try this fix';
    return h('button', {
      type: 'button', class: 'btn btn-small btn-fix',
      onclick: (e: Event) => {
        e.stopPropagation();
        preview.show(r);
      },
    }, label);
  }

  function itemRow(r: RuleResult): HTMLElement {
    const open = r.id === activeId;
    const impact = r.scoreImpact !== 0 && r.category !== 'bagua'
      ? `${r.scoreImpact > 0 ? '+' : ''}${r.scoreImpact} · ${CATEGORY_LABELS[r.category]}`
      : CATEGORY_LABELS[r.category];
    return h('li', { class: `report-item status-${r.status}${open ? ' open' : ''}` },
      h('button', {
        type: 'button', class: 'report-item-head', 'aria-expanded': String(open),
        title: r.highlight.length ? 'Show on the plan' : undefined,
        onclick: () => setActive(r),
      },
        h('span', { class: 'status-icon', 'aria-label': STATUS_WORD[r.status] }, ICON[r.status]),
        h('span', { class: 'report-item-text' },
          h('span', { class: 'report-item-message' }, r.message),
          h('span', { class: 'report-item-meta' }, impact),
        ),
      ),
      open
        ? h('div', { class: 'report-item-body' },
            h('p', {}, r.explanation),
            r.highlight.length ? h('p', { class: 'field-hint' }, 'Highlighted on the plan.') : null,
            fixButton(r),
          )
        : null,
    );
  }

  function section(title: string, items: RuleResult[], empty: string): HTMLElement {
    return h('section', { class: 'report-section' },
      h('h3', {}, `${title} (${items.length})`),
      items.length ? h('ul', { class: 'report-list' }, items.map(itemRow)) : h('p', { class: 'field-hint' }, empty),
    );
  }

  function improveSection(results: RuleResult[]): HTMLElement {
    // Every distinct fix, biggest gain first, then the free tips. Some rules share one fix
    // object between several issues (e.g. "move the bed"), so de-duplicate by the object itself.
    const seen = new Set<unknown>();
    const fixes = results
      .filter((r) => r.fix && (r.status === 'bad' || r.status === 'warn'))
      .filter((r) => (seen.has(r.fix) ? false : (seen.add(r.fix), true)))
      .sort((a, b) => (model.gains.get(b.id) ?? 0) - (model.gains.get(a.id) ?? 0));
    const tips = results.filter((r) => r.status === 'info' && r.category !== 'bagua');
    return h('section', { class: 'report-section' },
      h('h3', {}, 'How to improve'),
      fixes.length
        ? h('ul', { class: 'improve-list' }, fixes.map((r) => {
            const gain = model.gains.get(r.id);
            return h('li', {},
              h('span', {}, r.fix!.label, h('span', { class: 'report-item-meta' }, ` for “${r.message}”`)),
              h('button', { type: 'button', class: 'btn btn-small btn-fix', onclick: () => preview.show(r) },
                gain && gain > 0 ? `Try (+${gain})` : 'Try'),
            );
          }))
        : h('p', { class: 'field-hint' }, 'No one-click fixes needed.'),
      tips.length ? h('ul', { class: 'tip-list' }, tips.map((t) => h('li', {}, h('strong', {}, t.message.replace(/^Tip: /, '')), ' ', t.explanation))) : null,
    );
  }

  function render(): void {
    const results = model.report.results;
    const issues = results.filter((r) => r.status === 'bad' || r.status === 'warn');
    const working = results.filter((r) => r.status === 'good' && r.category !== 'bagua');
    const bagua = results.filter((r) => r.category === 'bagua');

    const baguaToggle = h('input', { type: 'checkbox', checked: showBagua });
    baguaToggle.addEventListener('change', () => {
      showBagua = baguaToggle.checked;
      editor.setBagua(showBagua ? baguaZones(store.layout) : null);
    });

    const details = h('details', { class: 'report-section bagua-details', open: baguaOpen },
      h('summary', {}, 'Bagua map (for information)'),
      h('label', { class: 'checkbox' }, baguaToggle, 'Show the bagua grid on the plan'),
      h('ul', { class: 'report-list' }, bagua.map(itemRow)),
    );
    details.addEventListener('toggle', () => (baguaOpen = details.open));

    const parts: (HTMLElement | null)[] = [
      h('div', { class: 'report-actions' },
        h('button', { type: 'button', class: 'btn btn-small', onclick: deps.onSnapshot, title: 'Remember this layout and score to compare against later' },
          model.snapshot ? '📌 Update “before”' : '📌 Save as “before”'),
        model.snapshot
          ? h('button', { type: 'button', class: 'btn btn-small', onclick: deps.onCompare }, 'Compare before/after')
          : null,
      ),
      section('Issues', issues, 'No issues: lovely.'),
      section('What’s working', working, 'Nothing yet. Start with the bed.'),
      improveSection(results),
      details,
      model.report.usedSimulation
        ? null
        : h('p', { class: 'hint' }, 'Tip: run Simulate until it settles to add rushing and stagnant chi to the report.'),
    ];
    root.replaceChildren(...parts.filter((p): p is HTMLElement => p !== null));
  }

  render();
}
