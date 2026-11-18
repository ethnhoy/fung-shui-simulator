/**
 * Always-on problem markers on the plan.
 *
 *  - Mirror beams, poison arrows and the coffin line become streams of chi
 *    particles (see markerStreams and the particle overlay).
 *  - Areas (door swing into the bed, open shelves) are shaded zones.
 *  - Every marker gets a small badge (✕ or !) that shows the issue on hover
 *    and opens it in the report when clicked. Only the badges listen to the
 *    mouse, so markers never get in the way of dragging furniture.
 */
import Konva from 'konva';
import type { Point } from '../model/types';
import { add, normalize, scale, sub } from '../geometry/vec';
import type { IssueMarker, RuleResult } from '../rules/types';
import type { ChiStream } from '../sim/particles';

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

function drawZone(g: Konva.Group, m: Extract<IssueMarker, { kind: 'zone' }>, colour: string): void {
  g.add(new Konva.Line({
    points: flat(m.points), closed: true, fill: colour + '26', stroke: colour, strokeWidth: 1.8, ...crisp, dash: [6, 4],
  }));
}

/**
 * Mirror beams, poison arrows and the coffin line are drawn as streams of chi
 * particles by the particle overlay. This turns markers into those streams.
 */
export function markerStreams(items: MarkerItem[]): ChiStream[] {
  const streams: ChiStream[] = [];
  for (const { id, marker: m } of items) {
    if (m.kind === 'mirrorBeam') {
      streams.push({ id, kind: 'mirror', fromA: m.edge[0], fromB: m.edge[1], dir: m.dir, length: m.length, severity: 1 });
    } else if (m.kind === 'poisonArrow') {
      const length = Math.hypot(m.to.x - m.from.x, m.to.y - m.from.y);
      streams.push({ id, kind: 'arrow', fromA: m.from, fromB: m.from, dir: normalize(sub(m.to, m.from)), length, severity: m.severity });
    } else if (m.kind === 'coffin') {
      // Chi drains from the whole foot of the bed: start across the strip's foot edge.
      const length = Math.hypot(m.to.x - m.from.x, m.to.y - m.from.y);
      streams.push({ id, kind: 'coffin', fromA: m.strip[0], fromB: m.strip[3], dir: normalize(sub(m.to, m.from)), length, severity: 1 });
    }
  }
  return streams;
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

/** Build the badges (for every marker) and the shaded zones. Returns a group in room cm. */
export function drawMarkers(
  items: MarkerItem[], px: number, tooltip: Konva.Label, onClick: (id: string) => void,
): Konva.Group {
  const group = new Konva.Group();
  const zones = new Konva.Group({ listening: false });
  const badges = new Konva.Group();
  group.add(zones, badges);
  for (const item of items) {
    if (item.marker.kind === 'zone') drawZone(zones, item.marker, COLOUR[item.status === 'bad' ? 'bad' : 'warn']);
    badges.add(drawBadge(item, anchorOf(item.marker), px, tooltip, onClick));
  }
  return group;
}
