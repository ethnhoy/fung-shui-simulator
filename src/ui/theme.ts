/**
 * Colours used when drawing on the canvas. (The HTML panels use CSS
 * variables in styles.css; canvases can't read those cheaply, so the
 * drawing palette lives here.) Calm, warm and minimal.
 */
export const THEME = {
  floor: '#f4ece0',
  floorGrid: 'rgba(120, 100, 80, 0.10)',
  wall: '#5b5249',
  wallLabel: '#8a7f73',
  opening: '#fbf7f1',
  door: '#6b5d50',
  doorArc: 'rgba(107, 93, 80, 0.55)',
  window: '#6f9fb5',
  windowGlass: '#d7e8ef',
  entrance: '#c06a45',
  selection: '#c06a45',
  handle: '#ffffff',
  handleStroke: '#c06a45',
  ink: '#3a3530',
  inkSoft: '#6b625a',
  wood: { fill: '#dcc7a8', stroke: '#8a6d4b' },
  bed: { fill: '#efe3d1', stroke: '#8a6d4b', pillow: '#fffaf2', blanket: '#d8c3a5' },
  storage: { fill: '#cdb393', stroke: '#7a5f41' },
  plant: { fill: '#a9c29a', stroke: '#5f7d55', leaf: '#8fae80' },
  water: { fill: '#b9d6e2', stroke: '#4f8197' },
  mirror: { fill: '#dfeef3', stroke: '#5e8796' },
  metal: { fill: '#d3d4d6', stroke: '#6e7176' },
  tv: { fill: '#4a4744', stroke: '#2f2d2b' },
  lamp: { fill: '#f6d98b', stroke: '#b38b2c', glow: 'rgba(246, 217, 139, 0.35)' },
  rug: { fill: 'rgba(192, 106, 69, 0.14)', stroke: 'rgba(192, 106, 69, 0.55)' },
  column: { fill: '#b9b0a5', stroke: '#5b5249' },
};
