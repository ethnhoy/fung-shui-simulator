/**
 * Builds the Konva shapes for the room, its doors/windows and furniture.
 *
 * Everything is drawn in centimetres: the parent "world" group is scaled
 * so 1 unit = 1 cm. Line widths are set in screen pixels instead
 * (strokeScaleEnabled: false) so lines stay crisp at any zoom level.
 * `px` below is the size of one screen pixel in cm, for sizing things
 * like arrows and text that should look the same at every zoom.
 */
import Konva from 'konva';
import { CATALOG, displayName } from '../model/catalog';
import type { Furniture, Opening, Room } from '../model/types';
import { offsetPolygon, roomPolygon, type Wall } from '../geometry/room';
import { aabbHalfExtents } from '../geometry/rect';
import { formatLength, type UnitSystem } from '../geometry/units';
import { THEME } from '../ui/theme';

const flat = (pts: { x: number; y: number }[]): number[] => pts.flatMap((p) => [p.x, p.y]);

/** Common options for shapes: crisp pixel-width strokes. */
const crisp = { strokeScaleEnabled: false, strokeWidth: 1.5 } as const;

// ---------------------------------------------------------------- Room

/**
 * @param transparentFloor In Simulate mode the floor is left see-through so the
 *   flow canvas underneath (heatmap and particles) shows through.
 */
export function drawRoom(room: Room, px: number, units: UnitSystem, transparentFloor = false): Konva.Group {
  const g = new Konva.Group({ name: 'room', listening: false });
  const inner = roomPolygon(room);
  const outer = offsetPolygon(inner, room.wallThickness);

  if (!transparentFloor) {
    // Walls = the outer outline filled dark, with the floor drawn on top.
    g.add(new Konva.Line({ points: flat(outer), closed: true, fill: THEME.wall }));
    g.add(new Konva.Line({ points: flat(inner), closed: true, fill: THEME.floor }));
  } else {
    // Simulate mode: draw only the wall band (outer outline minus inner outline,
    // using the canvas "even-odd" fill rule) and leave the floor see-through.
    g.add(
      new Konva.Shape({
        sceneFunc: (ctx) => {
          const native = ctx._context; // the plain CanvasRenderingContext2D underneath Konva
          native.beginPath();
          for (const ring of [outer, inner]) {
            ring.forEach((p, i) => (i === 0 ? native.moveTo(p.x, p.y) : native.lineTo(p.x, p.y)));
            native.closePath();
          }
          native.fillStyle = THEME.wall;
          native.fill('evenodd');
        },
      }),
    );
  }

  // A faint 50 cm grid on the floor, clipped to the room outline.
  g.add(
    new Konva.Shape({
      sceneFunc: (ctx) => {
        ctx.save();
        ctx.beginPath();
        inner.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.closePath();
        ctx.clip();
        ctx.beginPath();
        for (let x = 50; x < room.width; x += 50) {
          ctx.moveTo(x, 0);
          ctx.lineTo(x, room.depth);
        }
        for (let y = 50; y < room.depth; y += 50) {
          ctx.moveTo(0, y);
          ctx.lineTo(room.width, y);
        }
        ctx.strokeStyle = THEME.floorGrid;
        ctx.lineWidth = px; // 1 screen pixel
        ctx.stroke();
        ctx.restore();
      },
    }),
  );

  // Overall dimensions outside the walls (top and left).
  const t = room.wallThickness;
  const fontSize = 12 * px;
  g.add(
    new Konva.Text({
      x: 0, y: -t - 20 * px, width: room.width, align: 'center',
      text: formatLength(room.width, units), fontSize, fill: THEME.wallLabel, fontFamily: 'inherit',
    }),
  );
  g.add(
    new Konva.Text({
      // Rotated -90°, the text's height extends to the right, so shift it left by a line.
      x: -t - 22 * px, y: room.depth, width: room.depth, align: 'center', rotation: -90,
      text: formatLength(room.depth, units), fontSize, fill: THEME.wallLabel,
    }),
  );
  return g;
}

// ---------------------------------------------------------------- Openings

/**
 * A door or window, drawn in the wall's own frame: local x runs along the
 * wall, local +y points into the room, and the wall body is y ∈ [-t, 0].
 */
export function drawOpening(o: Opening, wall: Wall, room: Room, px: number, selected: boolean): Konva.Group {
  const t = room.wallThickness;
  const w = o.width;
  const pos = { x: wall.start.x + wall.dir.x * o.offset, y: wall.start.y + wall.dir.y * o.offset };
  const g = new Konva.Group({ id: o.id, name: 'opening', x: pos.x, y: pos.y, rotation: wall.angle, draggable: true });

  // Invisible, slightly larger rectangle so the opening is easy to grab.
  g.add(new Konva.Rect({ x: -w / 2, y: -t - 12 * px, width: w, height: t + 24 * px, fill: 'transparent' }));
  // Cut the gap out of the wall.
  g.add(new Konva.Rect({ x: -w / 2, y: -t, width: w, height: t, fill: THEME.opening }));

  if (o.kind === 'window') {
    // Window: a frame with glass. An open window gets a dashed sash line.
    g.add(new Konva.Rect({ x: -w / 2, y: -t, width: w, height: t, fill: THEME.windowGlass, stroke: THEME.window, ...crisp }));
    g.add(
      new Konva.Line({
        points: [-w / 2, -t / 2, w / 2, -t / 2], stroke: THEME.window, ...crisp,
        dash: o.isOpen ? [6, 4] : undefined,
      }),
    );
  } else {
    // Door: the leaf (a line from the hinge) and a quarter-circle swing arc.
    const hingeX = o.hinge === 'start' ? -w / 2 : w / 2;
    const towardsOtherEnd = o.hinge === 'start' ? 1 : -1;
    const side = o.swingsInward ? 1 : -1; // +1 = into the room
    if (o.isOpen) {
      g.add(new Konva.Line({ points: [hingeX, 0, hingeX, side * w], stroke: THEME.door, ...crisp, strokeWidth: 2.5 }));
      g.add(
        new Konva.Shape({
          sceneFunc: (ctx, shape) => {
            // Angle of the closed position and of the open leaf, measured at the hinge.
            const a1 = Math.atan2(0, towardsOtherEnd);
            const a2 = Math.atan2(side, 0);
            let sweep = a2 - a1;
            while (sweep > Math.PI) sweep -= 2 * Math.PI;
            while (sweep <= -Math.PI) sweep += 2 * Math.PI;
            ctx.beginPath();
            ctx.arc(hingeX, 0, w, a1, a2, sweep < 0);
            ctx.strokeShape(shape);
          },
          stroke: THEME.doorArc, ...crisp, strokeWidth: 1, dash: [4, 3],
        }),
      );
    } else {
      g.add(new Konva.Line({ points: [-w / 2, -t / 2, w / 2, -t / 2], stroke: THEME.door, ...crisp, strokeWidth: 3 }));
    }
  }

  if (o.isMainEntrance) {
    // An arrow outside the wall pointing in: "chi enters here".
    const y0 = -t - 26 * px;
    const y1 = -t - 6 * px;
    g.add(
      new Konva.Arrow({
        points: [0, y0, 0, y1], stroke: THEME.entrance, fill: THEME.entrance, ...crisp, strokeWidth: 2,
        pointerLength: 7 * px, pointerWidth: 8 * px,
      }),
    );
  }

  // Selection outline, always present but only visible when selected.
  g.add(
    new Konva.Rect({
      name: 'selection', x: -w / 2 - 3 * px, y: -t - 3 * px, width: w + 6 * px, height: t + 6 * px,
      stroke: THEME.selection, ...crisp, strokeWidth: 2, dash: [5, 3], visible: selected, listening: false,
    }),
  );
  return g;
}

// ---------------------------------------------------------------- Furniture

/** Draw one furniture item centred on (0,0) in its own rotated frame. */
export function drawFurniture(f: Furniture, px: number): Konva.Group {
  const g = new Konva.Group({ id: f.id, name: 'furniture', x: f.x, y: f.y, rotation: f.rotation, draggable: true });
  const w = f.width;
  const d = f.depth;
  const L = -w / 2; // left edge
  const T = -d / 2; // back edge
  const radius = f.sharpCorners ? 0 : Math.min(6, w / 6, d / 6);
  const box = (fill: string, stroke: string, extra: Partial<Konva.RectConfig> = {}) =>
    new Konva.Rect({ x: L, y: T, width: w, height: d, fill, stroke, cornerRadius: radius, ...crisp, ...extra });
  const line = (points: number[], stroke: string, extra: Partial<Konva.LineConfig> = {}) =>
    new Konva.Line({ points, stroke, ...crisp, strokeWidth: 1, ...extra });
  const frontBand = (stroke: string) => line([L, d / 2 - Math.min(6, d * 0.15), w / 2, d / 2 - Math.min(6, d * 0.15)], stroke);

  switch (f.type) {
    case 'bed': {
      const c = THEME.bed;
      g.add(box(c.fill, c.stroke));
      const pillowZone = Math.min(45, d * 0.22);
      g.add(new Konva.Rect({ x: L, y: T + pillowZone, width: w, height: d - pillowZone, fill: c.blanket, cornerRadius: radius }));
      g.add(line([L, T + pillowZone + 14, w / 2, T + pillowZone + 14], c.stroke, { opacity: 0.5 }));
      const pillows = w >= 120 ? 2 : 1;
      const gap = 8;
      const pw = (w - gap * (pillows + 1)) / pillows;
      for (let i = 0; i < pillows; i++) {
        g.add(
          new Konva.Rect({
            x: L + gap + i * (pw + gap), y: T + 6, width: pw, height: pillowZone - 12,
            fill: c.pillow, stroke: c.stroke, cornerRadius: 6, ...crisp, strokeWidth: 1,
          }),
        );
      }
      break;
    }
    case 'wardrobe': {
      const c = THEME.storage;
      g.add(box(c.fill, c.stroke));
      g.add(line([0, T, 0, d / 2], c.stroke)); // two doors
      g.add(line([L + 4, 0, w / 2 - 4, 0], c.stroke, { dash: [4, 3], opacity: 0.7 })); // hanging rail
      break;
    }
    case 'bookshelf': {
      const c = THEME.storage;
      g.add(box(c.fill, c.stroke));
      // Open shelves: vertical dividers with little book spines.
      const bays = Math.max(1, Math.round(w / 40));
      for (let i = 1; i < bays; i++) g.add(line([L + (i * w) / bays, T, L + (i * w) / bays, d / 2], c.stroke));
      for (let x = L + 4; x < w / 2 - 3; x += 6) {
        g.add(new Konva.Rect({ x, y: T + 3, width: 3, height: d * 0.6, fill: c.stroke, opacity: 0.35 }));
      }
      break;
    }
    case 'cabinet': {
      const c = THEME.storage;
      g.add(box(c.fill, c.stroke));
      g.add(line([0, T + 3, 0, d / 2], c.stroke));
      g.add(frontBand(c.stroke));
      break;
    }
    case 'dresser':
    case 'nightstand':
    case 'desk': {
      const c = f.type === 'desk' ? THEME.wood : THEME.storage;
      g.add(box(c.fill, c.stroke));
      g.add(frontBand(c.stroke));
      break;
    }
    case 'chair': {
      const c = THEME.wood;
      g.add(new Konva.Rect({ x: L + 3, y: T + 3, width: w - 6, height: d - 6, fill: c.fill, stroke: c.stroke, cornerRadius: 6, ...crisp }));
      g.add(new Konva.Rect({ x: L, y: T, width: w, height: d * 0.2, fill: c.stroke, cornerRadius: 4 })); // backrest
      break;
    }
    case 'tv':
      g.add(box(THEME.tv.fill, THEME.tv.stroke));
      break;
    case 'mirror': {
      const c = THEME.mirror;
      g.add(box(c.fill, c.stroke, { strokeWidth: 2 }));
      g.add(line([L + w * 0.2, d / 2, L + w * 0.35, T], c.stroke, { opacity: 0.6 }));
      g.add(line([L + w * 0.4, d / 2, L + w * 0.55, T], c.stroke, { opacity: 0.6 }));
      break;
    }
    case 'plant': {
      const c = THEME.plant;
      g.add(new Konva.Ellipse({ radiusX: w / 2, radiusY: d / 2, fill: c.fill, stroke: c.stroke, ...crisp }));
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        g.add(
          new Konva.Ellipse({
            x: Math.cos(a) * w * 0.22, y: Math.sin(a) * d * 0.22, radiusX: w * 0.16, radiusY: d * 0.09,
            rotation: (a * 180) / Math.PI, fill: c.leaf, stroke: c.stroke, ...crisp, strokeWidth: 0.75,
          }),
        );
      }
      break;
    }
    case 'lamp': {
      const c = THEME.lamp;
      g.add(new Konva.Ellipse({ radiusX: w * 0.75, radiusY: d * 0.75, fill: c.glow }));
      g.add(new Konva.Ellipse({ radiusX: w / 2, radiusY: d / 2, fill: c.fill, stroke: c.stroke, ...crisp }));
      g.add(new Konva.Circle({ radius: Math.min(w, d) * 0.12, fill: c.stroke }));
      break;
    }
    case 'waterFeature': {
      const c = THEME.water;
      g.add(new Konva.Ellipse({ radiusX: w / 2, radiusY: d / 2, fill: c.fill, stroke: c.stroke, ...crisp }));
      g.add(new Konva.Ellipse({ radiusX: w * 0.3, radiusY: d * 0.3, stroke: c.stroke, ...crisp, strokeWidth: 1 }));
      g.add(new Konva.Ellipse({ radiusX: w * 0.12, radiusY: d * 0.12, stroke: c.stroke, ...crisp, strokeWidth: 1 }));
      break;
    }
    case 'rug': {
      const c = THEME.rug;
      g.add(box(c.fill, c.stroke, { dash: [6, 4] }));
      const inset = Math.min(10, w / 6, d / 6);
      g.add(new Konva.Rect({ x: L + inset, y: T + inset, width: w - 2 * inset, height: d - 2 * inset, stroke: c.stroke, ...crisp, strokeWidth: 1, opacity: 0.6 }));
      break;
    }
    case 'column': {
      const c = THEME.column;
      g.add(box(c.fill, c.stroke, { strokeWidth: 2 }));
      g.add(line([L, T, w / 2, d / 2], c.stroke, { opacity: 0.5 }));
      g.add(line([w / 2, T, L, d / 2], c.stroke, { opacity: 0.5 }));
      break;
    }
  }

  // Small triangle just outside the front edge for items that face somewhere.
  if (CATALOG[f.type].hasFront && f.type !== 'bed') {
    g.add(
      new Konva.Line({
        points: [-5 * px, d / 2 + 2 * px, 5 * px, d / 2 + 2 * px, 0, d / 2 + 8 * px],
        closed: true, fill: THEME.inkSoft, opacity: 0.7,
      }),
    );
  }

  // Label, counter-rotated so it always reads upright. Hidden on tiny items.
  const name = displayName(f);
  const fontSize = 11 * px;
  // The label is upright on screen, so measure the room it has on screen (the rotated footprint).
  const { hx, hy } = aabbHalfExtents(f);
  const span = hx * 2;
  const label = new Konva.Text({
    text: name, fontSize, fill: f.type === 'tv' ? '#fff' : THEME.ink,
    width: span, align: 'center', offsetX: span / 2, offsetY: fontSize / 2,
    y: f.type === 'bed' ? d * 0.12 : 0, rotation: -f.rotation, listening: false,
  });
  // Only show the label if it really fits inside the item (measured, with a little margin).
  const fits = label.measureSize(name).width < span - 6 * px && hy * 2 > fontSize * 1.4;
  if (fits && f.type !== 'rug') g.add(label);
  return g;
}
