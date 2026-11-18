/**
 * Always-on problem markers: little pictures of what's wrong, drawn on the plan.
 *
 *  - mirror beam: a shimmer of reflected light from the mirror to the bed
 *  - poison arrow: a red "blade" from a sharp corner, with a burst where it hits
 *  - coffin line: a dark strip from the foot of the bed out through the door
 *  - zone: a shaded problem area (door swing, open shelves)
 *
 * Each marker also gets a small badge (✕ or !) that shows the issue on hover
 * and opens it in the report when clicked. Only the badges listen to the
 * mouse, so markers never get in the way of dragging furniture.
 */
import Konva from 'konva';
import type { Point } from '../model/types';
import { add, normalize, scale, sub } from '../geometry/vec';
import type { IssueMarker, RuleResult } from '../rules/types';

export interface MarkerItem {
  id: string;
  status: RuleResult['status'];
  message: string;
  marker: IssueMarker;
}

const COLOUR = { bad: '#b5402a', warn: '#b9822b' } as const;
const flat = (pts: Point[]) => pts.flatMap((p) => [p.x, p.y]);
const crisp = { strokeScaleEnabled: false } as const;

/** Where a marker's badge sits. */
function anchorOf(m: IssueMarker): Point {
  switch (m.kind) {
    case 'mirrorBeam':
      return scale(add(m.edge[0], m.edge[1]), 0.5);
    case 'poisonArrow':
      return m.from;
    case 'coffin':
      return scale(add(m.from, m.to), 0.5);
    case 'zone': {
      const c = m.points.reduce((s, p) => add(s, p), { x: 0, y: 0 });
      return scale(c, 1 / m.points.length);
    }
  }
}

/** Shapes that should animate (their dash pattern slides along). */
export type Animated = Konva.Line[];

function drawMirrorBeam(g: Konva.Group, m: Extract<IssueMarker, { kind: 'mirrorBeam' }>, animated: Animated): void {
  const [a, b] = m.edge;
  const far = scale(m.dir, m.length);
  const mid = scale(add(a, b), 0.5);
  // The beam: pale silver-blue, fading away from the mirror.
  g.add(new Konva.Line({
    points: flat([a, b, add(b, far), add(a, far)]), closed: true,
    fillLinearGradientStartPoint: mid, fillLinearGradientEndPoint: add(mid, far),
    fillLinearGradientColorStops: [0, 'rgba(120, 180, 210, 0.55)', 0.7, 'rgba(160, 205, 225, 0.25)', 1, 'rgba(190, 220, 235, 0.08)'],
  }));
  // A few glints running along the beam, like reflected light.
  const across = sub(b, a);
  for (const t of [0.2, 0.5, 0.8]) {
    const start = add(a, scale(across, t));
    const line = new Konva.Line({
      points: flat([start, add(start, far)]), stroke: 'rgba(255, 255, 255, 0.9)', strokeWidth: 1.6, ...crisp,
      dash: [3, 14], lineCap: 'round',
    });
    animated.push(line);
    g.add(line);
  }
  // Soft edges of the beam.
  for (const p of [a, b]) {
    g.add(new Konva.Line({ points: flat([p, add(p, far)]), stroke: 'rgba(80, 140, 170, 0.55)', strokeWidth: 1, ...crisp, dash: [4, 4] }));
  }
  // A highlight on the mirror itself.
  g.add(new Konva.Line({ points: flat([a, b]), stroke: '#ffffff', strokeWidth: 3, ...crisp, lineCap: 'round', opacity: 0.9 }));
}

function drawPoisonArrow(g: Konva.Group, m: Extract<IssueMarker, { kind: 'poisonArrow' }>, colour: string, px: number, animated: Animated): void {
  const dir = normalize(sub(m.to, m.from));
  const side = { x: -dir.y, y: dir.x };
  const len = Math.hypot(m.to.x - m.from.x, m.to.y - m.from.y);
  // The blade: a thin wedge, sharp at the corner and widening towards the target.
  const half = Math.max(4 * px, len * 0.06);
  g.add(new Konva.Line({
    points: flat([m.from, add(m.to, scale(side, half)), add(m.to, scale(side, -half))]), closed: true,
    fillLinearGradientStartPoint: m.from, fillLinearGradientEndPoint: m.to,
    fillLinearGradientColorStops: [0, colour + '10', 1, colour + '40'],
  }));
  // The arrow itself: dashes that slide towards the target. Closer corners are bolder.
  const arrow = new Konva.Arrow({
    points: flat([m.from, m.to]), stroke: colour, fill: colour, ...crisp,
    strokeWidth: 1.8 + 1.8 * m.severity, dash: [10, 6], lineCap: 'round',
    pointerLength: 9 * px, pointerWidth: 9 * px, opacity: 0.6 + 0.4 * m.severity,
  });
  animated.push(arrow);
  g.add(arrow);
  // Impact burst where it hits.
  g.add(new Konva.Star({
    x: m.to.x, y: m.to.y, numPoints: 7, innerRadius: 3 * px, outerRadius: (7 + 5 * m.severity) * px,
    fill: colour, opacity: 0.75,
  }));
}

function drawCoffin(g: Konva.Group, m: Extract<IssueMarker, { kind: 'coffin' }>, colour: string, px: number, animated: Animated): void {
  g.add(new Konva.Line({
    points: flat(m.strip), closed: true, fill: 'rgba(58, 45, 40, 0.12)',
    stroke: 'rgba(58, 45, 40, 0.55)', strokeWidth: 1.2, ...crisp, dash: [6, 4],
  }));
  const arrow = new Konva.Arrow({
    points: flat([m.from, m.to]), stroke: colour, fill: colour, strokeWidth: 2, ...crisp,
    dash: [8, 8], pointerLength: 9 * px, pointerWidth: 9 * px, opacity: 0.85,
  });
  animated.push(arrow);
  g.add(arrow);
}

function drawZone(g: Konva.Group, m: Extract<IssueMarker, { kind: 'zone' }>, colour: string): void {
  g.add(new Konva.Line({
    points: flat(m.points), closed: true, fill: colour + '26', stroke: colour, strokeWidth: 1.8, ...crisp, dash: [6, 4],
  }));
}

/** A small round badge with an icon; shows the message on hover and reports clicks. */
function drawBadge(
  item: MarkerItem, at: Point, px: number, tooltip: Konva.Label, onClick: (id: string) => void,
): Konva.Group {
  const colour = COLOUR[item.status === 'bad' ? 'bad' : 'warn'];
  const badge = new Konva.Group({ x: at.x, y: at.y, listening: true });
  badge.add(new Konva.Circle({ radius: 9 * px, fill: colour, stroke: '#fff', strokeWidth: 2, ...crisp, shadowColor: 'rgba(0,0,0,0.25)', shadowBlur: 4 }));
  badge.add(new Konva.Text({
    text: item.status === 'bad' ? '✕' : '!', fontSize: 11 * px, fontStyle: 'bold', fill: '#fff',
    width: 18 * px, height: 18 * px, offsetX: 9 * px, offsetY: 9 * px, align: 'center', verticalAlign: 'middle', listening: false,
  }));
  badge.on('mouseenter', () => {
    const stage = badge.getStage();
    if (stage) stage.container().style.cursor = 'pointer';
    (tooltip.getText() as Konva.Text).text(item.message);
    const abs = badge.getAbsolutePosition();
    // Show it to the right of the badge, or to the left if it would run off the canvas.
    const stageWidth = stage?.width() ?? Infinity;
    const w = tooltip.width();
    const x = abs.x + 14 + w > stageWidth - 4 ? abs.x - 14 - w : abs.x + 14;
    tooltip.position({ x: Math.max(4, x), y: abs.y - 12 });
    tooltip.visible(true);
    tooltip.getLayer()?.batchDraw();
  });
  badge.on('mouseleave', () => {
    const stage = badge.getStage();
    if (stage) stage.container().style.cursor = 'default';
    tooltip.visible(false);
    tooltip.getLayer()?.batchDraw();
  });
  badge.on('click tap', () => onClick(item.id));
  return badge;
}

/** Build all markers. Returns the group (in room cm) and the shapes to animate. */
export function drawMarkers(
  items: MarkerItem[], px: number, tooltip: Konva.Label, onClick: (id: string) => void,
): { group: Konva.Group; animated: Animated } {
  const group = new Konva.Group();
  const shapes = new Konva.Group({ listening: false });
  const badges = new Konva.Group();
  const animated: Animated = [];
  group.add(shapes, badges);
  for (const item of items) {
    const colour = COLOUR[item.status === 'bad' ? 'bad' : 'warn'];
    const m = item.marker;
    if (m.kind === 'mirrorBeam') drawMirrorBeam(shapes, m, animated);
    else if (m.kind === 'poisonArrow') drawPoisonArrow(shapes, m, colour, px, animated);
    else if (m.kind === 'coffin') drawCoffin(shapes, m, colour, px, animated);
    else drawZone(shapes, m, colour);
    badges.add(drawBadge(item, anchorOf(m), px, tooltip, onClick));
  }
  return { group, animated };
}
