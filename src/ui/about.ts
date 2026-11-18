/**
 * The About panel: what feng shui is, how the app models chi, and the disclaimer.
 */
import { h } from './dom';

export const DISCLAIMER =
  'Feng shui is a traditional practice; this tool is for design inspiration, not a scientific or medical claim.';

export function openAbout(): void {
  const close = () => {
    backdrop.remove();
    window.removeEventListener('keydown', onKey);
    opener?.focus();
  };
  const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
  const opener = document.activeElement as HTMLElement | null;

  const closeBtn = h('button', { type: 'button', class: 'btn btn-small', onclick: close }, 'Close');
  const backdrop = h('div', { class: 'modal-backdrop', onclick: (e: Event) => e.target === backdrop && close() },
    h('div', { class: 'modal about', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'about-title' },
      h('div', { class: 'modal-head' }, h('h2', { id: 'about-title' }, 'About Chi Flow'), closeBtn),

      h('h3', {}, 'What is feng shui?'),
      h('p', {},
        'Feng shui (“wind and water”) is a traditional Chinese practice of arranging spaces so that ',
        h('em', {}, 'chi'), ', life energy, flows gently through them. ',
        'Chi Flow uses the Western (BTB, form school) approach: it looks at the shape of the room, ',
        'where the door is, and how the furniture is arranged, rather than compass directions.'),

      h('h3', {}, 'How chi is modelled'),
      h('p', {},
        'Your bedroom is turned into a grid of 5 cm cells and a ',
        h('strong', {}, 'Lattice Boltzmann'),
        ' fluid solver (D2Q9) runs in a background thread. Chi is pushed in through the main door by gentle pressure, ',
        'like air in a wind tunnel, flows around furniture and leaves through open windows and doors. Because it is ',
        'pressure-driven, anything in its path slows the whole stream down. Chi also spreads from moving air into the ',
        'still space around it (but not through walls or furniture). The colours run from blue-grey (still) through ',
        'yellow to red (rushing), and each spot is classed as:'),
      h('ul', {},
        h('li', {}, h('strong', {}, 'Sha chi'), ': fast and straight, “rushing”'),
        h('li', {}, h('strong', {}, 'Sheng chi'), ': gentle and meandering, healthy'),
        h('li', {}, h('strong', {}, 'Si chi'), ': barely moving, stagnant'),
      ),
      h('p', {},
        'The simulation is a ', h('strong', {}, 'visual metaphor'),
        ', not a model of real airflow: there are no temperatures, draughts or ventilation rates here.'),

      h('h3', {}, 'How the score works'),
      h('p', {},
        'A rule engine checks the bed’s commanding position (35%), poison arrows from sharp corners (15%), mirrors (10%), ',
        'chi flow (20%), clutter and clearance (10%), and the five elements and yin/yang (10%). The bagua map is shown for information.'),

      h('p', { class: 'disclaimer' }, DISCLAIMER),
      h('p', { class: 'field-hint' }, 'Built with TypeScript, Vite, Konva and Canvas 2D. Your room is stored only in this browser.'),
    ),
  );
  document.body.append(backdrop);
  window.addEventListener('keydown', onKey);
  closeBtn.focus();
}
