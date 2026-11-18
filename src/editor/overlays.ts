/**
 * Extra layers drawn on top of the plan (all in room centimetres):
 *  - highlight: the cause of a report item (a ray, an outline, a point, a path)
 *  - ghost: a see-through preview of a suggested fix
 *  - best spot: a heatmap of how good each position would be for the bed/desk
 *  - bagua: the 3×3 bagua grid with zone names
 */
import Konva from 'konva';
import type { Point } from '../model/types';
import type { BaguaZone } from '../rules/bagua';
import type { HighlightShape, Status } from '../rules/types';
import type { LayoutDiff } from '../report/diff';
import type { SpotCell } from '../report/bestSpot';
import { THEME } from '../ui/theme';
import { drawFurniture } from './draw';
import { rectCorners } from '../geometry/rect';

const flat = (pts: Point[]) => pts.flatMap((p) => [p.x, p.y]);
const crisp = { strokeScaleEnabled: false } as const;

export const HIGHLIGHT_COLOURS: Record<Status, string> = {
  // Bright enough to read on the dark lacquer floor.
  bad: '#ef6a52',
  warn: '#e3ab4f',
  info: '#93abcb',
  good: '#8fbf7a',
};

export function drawHighlight(shapes: HighlightShape[], status: Status, px: number): Konva.Group {
  const g = new Konva.Group({ listening: false });
  const colour = HIGHLIGHT_COLOURS[status];
  for (const s of shapes) {
    switch (s.kind) {
      case 'ray':
        g.add(new Konva.Arrow({
          points: [s.from.x, s.from.y, s.to.x, s.to.y], stroke: colour, fill: colour, strokeWidth: 3, ...crisp,
          dash: [9, 5], pointerLength: 10 * px, pointerWidth: 10 * px, lineCap: 'round',
        }));
        break;
      case 'outline':
        g.add(new Konva.Line({
          points: flat(s.points), closed: true, stroke: colour, strokeWidth: 3, ...crisp, dash: [7, 4],
          fill: colour + '1a', // ~10% opacity fill
        }));
        break;
      case 'point':
        g.add(new Konva.Circle({ x: s.at.x, y: s.at.y, radius: 10 * px, stroke: colour, strokeWidth: 3, ...crisp }));
        g.add(new Konva.Circle({ x: s.at.x, y: s.at.y, radius: 3 * px, fill: colour }));
        break;
      case 'path':
        g.add(new Konva.Line({
          points: flat(s.points), stroke: colour, strokeWidth: 4, ...crisp, dash: [1, 8], lineCap: 'round', lineJoin: 'round',
        }));
        break;
    }
  }
  return g;
}

/** Ghost preview: the fixed layout's changed items drawn see-through, with arrows for moves. */
export function drawGhost(diff: LayoutDiff, px: number): Konva.Group {
  const g = new Konva.Group({ listening: false });
  const accent = THEME.selection;
  for (const { before, after } of diff.changed) {
    g.add(new Konva.Line({ points: flat(rectCorners(before)), closed: true, stroke: THEME.inkSoft, strokeWidth: 1.5, ...crisp, dash: [4, 4] }));
    const ghost = drawFurniture(after, px);
    ghost.opacity(0.6);
    ghost.listening(false);
    g.add(ghost);
    g.add(new Konva.Line({ points: flat(rectCorners(after)), closed: true, stroke: accent, strokeWidth: 2.5, ...crisp, dash: [6, 4] }));
    if (Math.hypot(after.x - before.x, after.y - before.y) > 5) {
      g.add(new Konva.Arrow({
        points: [before.x, before.y, after.x, after.y], stroke: accent, fill: accent, strokeWidth: 2, ...crisp,
        pointerLength: 9 * px, pointerWidth: 9 * px,
      }));
    }
  }
  for (const f of diff.added) {
    const ghost = drawFurniture(f, px);
    ghost.opacity(0.65);
    ghost.listening(false);
    g.add(ghost);
    g.add(new Konva.Line({ points: flat(rectCorners(f)), closed: true, stroke: accent, strokeWidth: 2.5, ...crisp, dash: [6, 4] }));
  }
  for (const f of diff.removed) {
    const c = rectCorners(f);
    g.add(new Konva.Line({ points: flat(c), closed: true, stroke: HIGHLIGHT_COLOURS.bad, strokeWidth: 2.5, ...crisp, dash: [6, 4], fill: 'rgba(29, 22, 20, 0.75)' }));
    g.add(new Konva.Line({ points: [c[0].x, c[0].y, c[2].x, c[2].y], stroke: HIGHLIGHT_COLOURS.bad, strokeWidth: 2, ...crisp }));
    g.add(new Konva.Line({ points: [c[1].x, c[1].y, c[3].x, c[3].y], stroke: HIGHLIGHT_COLOURS.bad, strokeWidth: 2, ...crisp }));
  }
  return g;
}

/** Map a 0..100 score to a colour: muted red (poor) → amber → sage green (great). */
export function scoreColour(score: number): string {
  const stops: [number, [number, number, number]][] = [
    [40, [201, 105, 79]],
    [70, [224, 184, 90]],
    [100, [111, 154, 90]],
  ];
  const s = Math.max(stops[0][0], Math.min(100, score));
  let i = 0;
  while (i < stops.length - 2 && s > stops[i + 1][0]) i++;
  const [s0, c0] = stops[i];
  const [s1, c1] = stops[i + 1];
  const t = (s - s0) / (s1 - s0);
  const mix = c0.map((v, k) => Math.round(v + (c1[k] - v) * t));
  return `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`;
}

/** Best-spot heatmap: one soft square per candidate position, plus a star on the best one(s). */
export function drawBestSpot(cells: SpotCell[], step: number, px: number, done: boolean): Konva.Group {
  const g = new Konva.Group({ listening: false });
  g.add(new Konva.Shape({
    sceneFunc: (ctx) => {
      const native = ctx._context;
      for (const c of cells) {
        if (c.score === null) continue;
        // Spots where other furniture is in the way are drawn faint.
        native.globalAlpha = c.blocked ? 0.18 : 0.5;
        native.fillStyle = scoreColour(c.score);
        native.fillRect(c.x - step / 2, c.y - step / 2, step, step);
      }
      native.globalAlpha = 1;
    },
  }));
  if (done) {
    // Stars mark the best spots you could actually move to right now.
    const scored = cells.filter((c) => c.score !== null && !c.blocked);
    const top = Math.max(...scored.map((c) => c.score!));
    for (const c of scored.filter((x) => x.score === top).slice(0, 6)) {
      g.add(new Konva.Star({
        x: c.x, y: c.y, numPoints: 5, innerRadius: 4 * px, outerRadius: 9 * px,
        fill: '#e6c67c', stroke: '#0f0b0a', strokeWidth: 1.5, ...crisp,
      }));
    }
  }
  return g;
}

/**
 * The bagua grid. `part` lets the editor draw the tinted grid *under* the
 * furniture and the zone names *on top*, so the names are never hidden.
 */
export function drawBagua(zones: BaguaZone[], px: number, part: 'grid' | 'labels'): Konva.Group {
  const g = new Konva.Group({ listening: false });
  const fontSize = 11 * px;
  for (const z of zones) {
    if (part === 'grid') {
      g.add(new Konva.Line({
      points: flat(z.polygon), closed: true, stroke: 'rgba(212, 175, 97, 0.55)', strokeWidth: 1.2, ...crisp, dash: [5, 4],
      fill: (z.row + z.col) % 2 === 0 ? 'rgba(212, 175, 97, 0.07)' : 'rgba(212, 175, 97, 0.02)',
      }));
      continue;
    }
    const xs = z.polygon.map((p) => p.x);
    const ys = z.polygon.map((p) => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys);
    const label = new Konva.Label({ x: (minX + maxX) / 2, y: minY + 6 * px, opacity: 0.92 });
    label.add(new Konva.Tag({ fill: '#261c19', stroke: 'rgba(212, 175, 97, 0.5)', strokeWidth: 0.6 * px, cornerRadius: 3 * px, pointerDirection: 'none' }));
    label.add(new Konva.Text({
      text: z.insideFraction < 0.5 ? `${z.name} (missing)` : z.name,
      fontSize, fill: '#e6c67c', fontStyle: 'bold', padding: 2 * px,
    }));
    label.offsetX(label.width() / 2); // centre it horizontally in the zone
    g.add(label);
  }
  return g;
}
