/**
 * Left-hand panel in Simulate mode: play controls, display toggles, the
 * legend, and live statistics.
 */
import type { SimController, SimStatus } from '../sim/controller';
import { CHI_COLOURS, chiCssGradient } from '../sim/renderer';
import type { ChiClass, ClassMix } from '../sim/types';
import { h } from './dom';

/** Legend swatch backgrounds: colour plus the same pattern used on the heatmap. */
const SWATCH_STYLE: Record<ChiClass, string> = {
  sha: `background: repeating-linear-gradient(-45deg, ${CHI_COLOURS.sha.css} 0 3px, #f1c2b8 3px 6px)`,
  sheng: `background: ${CHI_COLOURS.sheng.css}`,
  si: `background: radial-gradient(circle, #3c5069 1.2px, transparent 1.6px) 0 0 / 6px 6px, #c5d0db`,
};
/** A text symbol per class so the legend never relies on colour alone. */
const SYMBOL: Record<ChiClass, string> = { sha: '»', sheng: '∿', si: '·' };
const DESCRIPTION: Record<ChiClass, string> = {
  sha: 'Fast, straight lines of energy. Harsh when it hits the bed.',
  sheng: 'Gentle, meandering flow. What you want around you.',
  si: 'Air that barely moves. Feels stale; brighten it up.',
};

const pct = (x: number) => `${Math.round(x * 100)}%`;

function mixBars(mix: ClassMix): HTMLElement {
  const kinds: ChiClass[] = ['sha', 'sheng', 'si'];
  return h(
    'div',
    { class: 'mix' },
    h('div', { class: 'mix-bar', role: 'img', 'aria-label': kinds.map((k) => `${k} ${pct(mix[k])}`).join(', ') },
      kinds.map((k) => h('span', { class: 'mix-seg', style: `${SWATCH_STYLE[k]}; width:${mix[k] * 100}%` })),
    ),
    h('div', { class: 'mix-labels' }, kinds.map((k) => h('span', {}, `${SYMBOL[k]} ${k} ${pct(mix[k])}`))),
  );
}

export function buildSimPanel(root: HTMLElement, sim: SimController): void {
  const playBtn = h('button', { type: 'button', class: 'btn btn-primary' });
  playBtn.addEventListener('click', () => (sim.playing ? sim.pause() : sim.play()));
  const stepBtn = h('button', { type: 'button', class: 'btn', title: 'Advance a little while paused', onclick: () => sim.stepOnce() }, 'Step');
  const resetBtn = h('button', { type: 'button', class: 'btn', title: 'Start again from still air', onclick: () => sim.reset() }, 'Reset');

  const speedLabel = h('span', { class: 'field-hint' });
  const speed = h('input', { type: 'range', min: -2, max: 2, step: 1, value: 0, 'aria-label': 'Simulation speed' });
  const applySpeed = () => {
    const s = 2 ** Number(speed.value); // -2..2 → 0.25×..4×
    speedLabel.textContent = `${s}×`;
    sim.setSpeed(s);
  };
  speed.addEventListener('input', applySpeed);
  applySpeed();

  const toggle = (label: string, key: 'heatmap' | 'particles' | 'arrows' | 'problems') => {
    const input = h('input', { type: 'checkbox', checked: sim.options[key] });
    input.addEventListener('change', () => sim.setOptions({ [key]: input.checked }));
    return h('label', { class: 'checkbox' }, input, label);
  };

  const quality = h('select', { 'aria-label': 'Grid quality' },
    h('option', { value: 'standard' }, 'Standard (5 cm cells)'),
    h('option', { value: 'high' }, 'High (2.5 cm cells, slower)'),
  );
  quality.addEventListener('change', () => sim.setQuality(quality.value as 'standard' | 'high'));

  const statusLine = h('p', { class: 'sim-status', 'aria-live': 'polite' });
  const statsBox = h('div', { class: 'sim-stats' });

  const legend = h('div', { class: 'legend' },
    h('div', { class: 'legend-gradient', style: `background: ${chiCssGradient()}`, role: 'img', 'aria-label': 'Colour scale from still blue-grey through yellow to rushing red' }),
    h('div', { class: 'legend-scale' }, h('span', {}, 'still'), h('span', {}, 'gentle'), h('span', {}, 'rushing')),
    (['sha', 'sheng', 'si'] as ChiClass[]).map((k) =>
      h('div', { class: 'legend-row' },
        h('span', { class: 'legend-swatch', style: SWATCH_STYLE[k], 'aria-hidden': 'true' }),
        h('div', {},
          h('div', { class: 'legend-title' }, `${SYMBOL[k]} ${CHI_COLOURS[k].label}`),
          h('div', { class: 'field-hint' }, DESCRIPTION[k]),
        ),
      ),
    ),
  );

  root.replaceChildren(
    h('h2', { class: 'panel-title' }, 'Chi flow'),
    h('div', { class: 'button-row sim-controls' }, playBtn, stepBtn, resetBtn),
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Speed ', speedLabel), speed),
    statusLine,
    h('h3', {}, 'Show'),
    toggle('Chi heatmap', 'heatmap'),
    toggle('Particles & trails', 'particles'),
    toggle('Velocity arrows', 'arrows'),
    toggle('Problem chi (corners, mirrors, coffin line)', 'problems'),
    h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Quality'), quality),
    h('h3', {}, 'Legend'),
    legend,
    h('h3', {}, 'Measurements'),
    statsBox,
    h('p', { class: 'hint' }, 'You can keep moving furniture: the flow re-runs automatically. This is a visual metaphor for chi, not a real airflow model.'),
  );

  const render = (s: SimStatus) => {
    playBtn.textContent = sim.playing ? '❚❚ Pause' : '▶ Play';
    if (s.unstable) statusLine.textContent = 'The simulation became unstable. Try Reset.';
    else if (s.mode === 'doorClosed' || s.mode === 'noDoor') statusLine.textContent = 'No flow: see the message on the plan.';
    else if (s.settled) statusLine.textContent = `Settled after ${s.step.toLocaleString()} steps.`;
    else if (!sim.playing) statusLine.textContent = `Paused at step ${s.step.toLocaleString()}.`;
    else statusLine.textContent = `Flowing… step ${s.step.toLocaleString()}`;

    const st = s.stats;
    if (!st) {
      const blocked = s.mode === 'doorClosed' || s.mode === 'noDoor';
      statsBox.replaceChildren(h('p', { class: 'field-hint' }, blocked ? 'No measurements while chi can’t get in.' : 'Waiting for the flow…'));
      return;
    }
    const biggest = st.stagnantRegions[0];
    // replaceChildren doesn't accept null, so build the list and drop the empty entries.
    const parts: (HTMLElement | null)[] = [
      h('div', { class: 'field-label' }, 'Open floor'),
      mixBars(st.floor),
      st.bed ? h('div', { class: 'field-label' }, 'Around the bed') : null,
      st.bed ? mixBars(st.bed) : null,
      h('p', { class: 'field-hint' },
        st.stagnantRegions.length
          ? `${st.stagnantRegions.length} stagnant area${st.stagnantRegions.length > 1 ? 's' : ''} over 0.5 m² (largest ${(biggest.areaCm2 / 10000).toFixed(1)} m²${biggest.inCorner ? ', in a corner' : ''}).`
          : 'No large stagnant areas.',
      ),
      st.settled ? null : h('p', { class: 'field-hint' }, 'Still settling. Numbers will firm up shortly.'),
    ];
    statsBox.replaceChildren(...parts.filter((p): p is HTMLElement => p !== null));
  };
  sim.subscribe(render);
}
