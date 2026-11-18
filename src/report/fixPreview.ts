/**
 * "Try this fix": show the suggested change as a ghost on the plan with a
 * small bar saying what the score would become. Apply commits it (so Undo
 * reverts it); Cancel throws it away. Editing anything cancels the preview.
 */
import type { Editor } from '../editor/editor';
import type { Store } from '../editor/store';
import type { RuleResult } from '../rules/types';
import { h } from '../ui/dom';
import { diffLayouts } from './diff';
import type { ReportModel } from './reportModel';

export class FixPreview {
  private active: { result: RuleResult; layout: import('../model/types').Layout } | null = null;
  /** Called when a preview opens or closes (the report panel uses it to clear its highlight). */
  onChange: (open: boolean) => void = () => {};

  constructor(
    private bar: HTMLElement,
    private editor: Editor,
    private store: Store,
    private model: ReportModel,
  ) {
    store.subscribe((kind) => {
      if (this.active && kind !== 'selection') this.cancel();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.active) this.cancel();
    });
  }

  get isOpen(): boolean {
    return this.active !== null;
  }

  show(result: RuleResult): void {
    const preview = this.model.previewScore(result);
    if (!preview) return;
    this.active = { result, layout: preview.layout };
    this.store.select(null);
    this.editor.setHighlight(null);
    this.editor.setGhost(diffLayouts(this.store.layout, preview.layout));

    const delta = preview.after - preview.before;
    const deltaText = delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : '±0';
    this.bar.replaceChildren(
      h('div', { class: 'fix-bar-text' },
        h('strong', {}, 'Preview: '), result.fix!.label,
        h('span', { class: `fix-bar-score ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}` },
          ` · score ${preview.before} → ${preview.after} (${deltaText})`),
      ),
      h('button', { type: 'button', class: 'btn btn-primary', onclick: () => this.apply() }, 'Apply'),
      h('button', { type: 'button', class: 'btn', onclick: () => this.cancel() }, 'Cancel'),
    );
    this.bar.hidden = false;
    this.onChange(true);
  }

  apply(): void {
    if (!this.active) return;
    const next = this.active.layout;
    this.close();
    this.store.commit(next); // one undoable step
  }

  cancel(): void {
    this.close();
  }

  private close(): void {
    if (!this.active) return;
    this.active = null;
    this.editor.setGhost(null);
    this.bar.hidden = true;
    this.onChange(false);
  }
}
