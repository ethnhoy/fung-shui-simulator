/**
 * Colours used when drawing on the canvas. (The HTML panels use CSS
 * variables in styles.css; canvases can't read those cheaply, so the
 * drawing palette lives here and mirrors them.)
 *
 * "Lacquer & Gold" (漆器金): a dark lacquered floor, near-black walls,
 * furniture in red-brown lacquered wood outlined in gold leaf, ivory text.
 */
export const THEME = {
  floor: '#2c211d',
  floorGrid: 'rgba(212, 175, 97, 0.07)',
  wall: '#0f0b0a',
  wallLabel: '#b59f86',
  opening: '#2c211d',
  door: '#d4af61',
  doorArc: 'rgba(212, 175, 97, 0.5)',
  window: '#8fb2d4',
  windowGlass: '#2b3a4c',
  entrance: '#e0553f',
  selection: '#e6c67c',
  handle: '#261c19',
  handleStroke: '#d4af61',
  ink: '#f1e6d4',
  inkSoft: '#cdb89c',
  /** Dark backing for tooltips and labels drawn on the plan. */
  tooltip: '#0f0b0a',
  wood: { fill: '#6e3f32', stroke: '#d4af61' },
  bed: { fill: '#7d4a3b', stroke: '#d4af61', pillow: '#ead9bd', blanket: '#8e5644' },
  storage: { fill: '#5a3329', stroke: '#c9a352' },
  plant: { fill: '#4f6b45', stroke: '#9cbf7f', leaf: '#6f8f5a' },
  water: { fill: '#2f4f66', stroke: '#8fb8d6' },
  mirror: { fill: '#3c4d5c', stroke: '#c9d8e2' },
  metal: { fill: '#5e5a55', stroke: '#cfc6b8' },
  tv: { fill: '#0f0b0a', stroke: '#8a7a66' },
  lamp: { fill: '#e8c26a', stroke: '#f5dc95', glow: 'rgba(232, 194, 106, 0.22)' },
  rug: { fill: 'rgba(184, 49, 47, 0.18)', stroke: 'rgba(212, 175, 97, 0.5)' },
  column: { fill: '#4a3a33', stroke: '#d4af61' },
};
