/**
 * The room editor: a Konva stage that shows the Layout and lets the user
 * drag, rotate and resize things.
 *
 * Data flows one way:
 *   store.layout  ──render()──▶  Konva shapes
 *   user drags a shape  ──▶  store.commit(new layout)  ──▶  render() again
 * The Konva shapes are never the "truth"; they are redrawn from the Layout.
 */
import Konva from 'konva';
import type { Layout, Room } from '../model/types';
import { setRoom, updateFurniture, updateOpening } from '../model/layoutOps';
import { clampOpeningOffset, nearestWallPoint, roomWalls } from '../geometry/room';
import { snapFurniturePosition } from '../geometry/snapping';
import { normalizeAngle, roundTo } from '../geometry/vec';
import type { UnitSystem } from '../geometry/units';
import { THEME } from '../ui/theme';
import { drawFurniture, drawOpening, drawRoom } from './draw';
import type { Store } from './store';

/** Screen pixels of empty space kept around the room (room for dimension labels). */
const PADDING_PX = 56;

type HandleKind = 'east' | 'south' | 'notch';

export class Editor {
  private stage: Konva.Stage;
  private layer: Konva.Layer;
  /** Everything in room coordinates (cm) lives inside this scaled group. */
  private world: Konva.Group;
  private roomGroup = new Konva.Group();
  private furnitureGroup = new Konva.Group();
  private openingGroup = new Konva.Group();
  private handleGroup = new Konva.Group();
  private transformer: Konva.Transformer;

  /** Screen pixels per cm. */
  private pxPerCm = 1;
  private fittedSize = { width: 0, depth: 0 };
  /** Set while the user drags a room-resize handle, so we don't redraw that handle mid-drag. */
  private draggingHandle = false;
  /** Holding Shift while dragging turns snapping off. */
  private shiftDown = false;

  constructor(
    private container: HTMLDivElement,
    private store: Store,
    private getUnits: () => UnitSystem,
  ) {
    this.stage = new Konva.Stage({ container, width: container.clientWidth, height: container.clientHeight });
    this.layer = new Konva.Layer();
    this.world = new Konva.Group();
    // Draw order matters: room first, then furniture, then doors/windows on the walls, then handles.
    this.world.add(this.roomGroup, this.furnitureGroup, this.openingGroup, this.handleGroup);
    this.transformer = new Konva.Transformer({
      rotateEnabled: true,
      flipEnabled: false,
      keepRatio: false,
      rotationSnaps: [0, 45, 90, 135, 180, 225, 270, 315],
      rotationSnapTolerance: 6,
      anchorSize: 9,
      anchorStroke: THEME.selection,
      borderStroke: THEME.selection,
      anchorCornerRadius: 2,
      rotateAnchorOffset: 24,
      // Stop items being squashed smaller than 10 cm.
      boundBoxFunc: (oldBox, newBox) => {
        const min = 10 * this.pxPerCm;
        return Math.abs(newBox.width) < min || Math.abs(newBox.height) < min ? oldBox : newBox;
      },
    });
    this.layer.add(this.world, this.transformer);
    this.stage.add(this.layer);

    this.bindStageEvents();
    this.store.subscribe((kind) => {
      if (kind === 'selection') this.updateSelection();
      else this.render();
    });

    // Re-fit when the browser window or panel size changes.
    new ResizeObserver(() => this.resize()).observe(container);
    window.addEventListener('keydown', (e) => (this.shiftDown = e.shiftKey));
    window.addEventListener('keyup', (e) => (this.shiftDown = e.shiftKey));
    this.resize();
  }

  /** Size of one screen pixel in cm. */
  private get px(): number {
    return 1 / this.pxPerCm;
  }

  // ------------------------------------------------------------ Layout & fit

  private resize(): void {
    this.stage.size({ width: this.container.clientWidth, height: this.container.clientHeight });
    this.fit();
    this.render();
  }

  /** Choose a zoom level so the whole room (plus walls) fits the panel, and centre it. */
  private fit(): void {
    const room = this.store.layout.room;
    const t = room.wallThickness;
    const w = this.stage.width() - PADDING_PX * 2;
    const h = this.stage.height() - PADDING_PX * 2;
    this.pxPerCm = Math.max(0.2, Math.min(w / (room.width + 2 * t), h / (room.depth + 2 * t)));
    this.world.scale({ x: this.pxPerCm, y: this.pxPerCm });
    this.world.position({
      x: (this.stage.width() - room.width * this.pxPerCm) / 2,
      y: (this.stage.height() - room.depth * this.pxPerCm) / 2,
    });
    this.fittedSize = { width: room.width, depth: room.depth };
  }

  // ------------------------------------------------------------ Rendering

  /** Rebuild all shapes from the current layout. Cheap enough for a bedroom's worth of items. */
  render(): void {
    const layout = this.store.layout;
    const room = layout.room;
    // If the room size changed (and we're not mid-drag), zoom to fit again.
    if (!this.draggingHandle && (room.width !== this.fittedSize.width || room.depth !== this.fittedSize.depth)) {
      this.fit();
    }
    const walls = roomWalls(room);
    const selected = this.store.selectedId;

    this.roomGroup.destroyChildren();
    this.roomGroup.add(drawRoom(room, this.px, this.getUnits()));

    this.furnitureGroup.destroyChildren();
    // Rugs lie on the floor, so draw them underneath everything else.
    const ordered = [...layout.furniture].sort((a, b) => Number(b.type === 'rug') - Number(a.type === 'rug'));
    for (const f of ordered) this.furnitureGroup.add(this.wireFurniture(drawFurniture(f, this.px)));

    this.openingGroup.destroyChildren();
    for (const o of layout.openings) {
      const wall = walls[o.wallIndex] ?? walls[0];
      this.openingGroup.add(this.wireOpening(drawOpening(o, wall, room, this.px, o.id === selected)));
    }

    if (!this.draggingHandle) this.drawHandles(room);
    this.updateSelection();
  }

  /** Attach the transformer to the selected furniture (or detach it). */
  private updateSelection(): void {
    const id = this.store.selectedId;
    const node = id ? this.furnitureGroup.findOne<Konva.Group>('#' + id) : undefined;
    this.transformer.nodes(node ? [node] : []);
    // Openings show selection as a dashed outline. We only toggle its
    // visibility: rebuilding the node here would break a drag that is just starting.
    for (const opening of this.openingGroup.getChildren()) {
      (opening as Konva.Group).findOne('.selection')?.visible(opening.id() === id);
    }
    this.layer.batchDraw();
  }

  // ------------------------------------------------------------ Furniture interaction

  private wireFurniture(node: Konva.Group): Konva.Group {
    const id = node.id();
    node.on('mousedown touchstart', () => this.store.select(id));
    node.on('mouseenter', () => (this.stage.container().style.cursor = 'move'));
    node.on('mouseleave', () => (this.stage.container().style.cursor = 'default'));

    node.on('dragmove', () => {
      const f = this.store.layout.furniture.find((x) => x.id === id);
      if (!f || this.shiftDown) return;
      const room = this.store.layout.room;
      node.position(snapFurniturePosition(f, node.position(), roomWalls(room), room));
    });
    node.on('dragend', () => {
      const p = node.position();
      this.store.commit(updateFurniture(this.store.layout, id, { x: roundTo(p.x, 0.5), y: roundTo(p.y, 0.5) }));
    });

    // After resizing/rotating with the transformer, turn the Konva scale back into real width/depth.
    node.on('transformend', () => {
      const f = this.store.layout.furniture.find((x) => x.id === id);
      if (!f) return;
      this.store.commit(
        updateFurniture(this.store.layout, id, {
          x: roundTo(node.x(), 0.5),
          y: roundTo(node.y(), 0.5),
          width: Math.max(10, Math.round(f.width * node.scaleX())),
          depth: Math.max(5, Math.round(f.depth * node.scaleY())),
          rotation: Math.round(normalizeAngle(node.rotation())),
        }),
      );
    });
    return node;
  }

  // ------------------------------------------------------------ Door / window interaction

  private wireOpening(node: Konva.Group): Konva.Group {
    const id = node.id();
    let target: { wallIndex: number; offset: number } | null = null;
    node.on('mousedown touchstart', () => this.store.select(id));
    node.on('mouseenter', () => (this.stage.container().style.cursor = 'grab'));
    node.on('mouseleave', () => (this.stage.container().style.cursor = 'default'));

    // Doors and windows slide along the walls: each move, find the nearest
    // wall to the pointer and stick the opening onto it.
    node.on('dragmove', () => {
      const o = this.store.layout.openings.find((x) => x.id === id);
      if (!o) return;
      const walls = roomWalls(this.store.layout.room);
      const hit = nearestWallPoint(walls, node.position());
      const wall = walls[hit.wallIndex];
      const offset = clampOpeningOffset(wall, o.width, this.shiftDown ? hit.offset : roundTo(hit.offset, 5));
      node.position({ x: wall.start.x + wall.dir.x * offset, y: wall.start.y + wall.dir.y * offset });
      node.rotation(wall.angle);
      target = { wallIndex: wall.index, offset };
    });
    node.on('dragend', () => {
      if (target) this.store.commit(updateOpening(this.store.layout, id, target));
      target = null;
    });
    return node;
  }

  // ------------------------------------------------------------ Room resize handles

  private handlePositions(room: Room): Record<HandleKind, { x: number; y: number } | null> {
    const walls = roomWalls(room);
    const t = room.wallThickness;
    // The right-most vertical wall and bottom-most horizontal wall get a handle at their midpoint,
    // placed just *outside* the wall so it never covers a door or window.
    const east = walls.filter((w) => Math.abs(w.dir.x) < 1e-6 && w.start.x === room.width)[0];
    const south = walls.filter((w) => Math.abs(w.dir.y) < 1e-6 && w.start.y === room.depth)[0];
    const mid = (w: (typeof walls)[number]) => ({ x: (w.start.x + w.end.x) / 2, y: (w.start.y + w.end.y) / 2 });
    let notch = null;
    if (room.shape === 'lshape') {
      const { corner, width: nw, depth: nd } = room.notch;
      notch = {
        x: corner.endsWith('left') ? nw : room.width - nw,
        y: corner.startsWith('top') ? nd : room.depth - nd,
      };
    }
    return {
      east: east ? { x: mid(east).x + this.handleGap(t), y: mid(east).y } : null,
      south: south ? { x: mid(south).x, y: mid(south).y + this.handleGap(t) } : null,
      notch,
    };
  }

  /** Distance (cm) from the room's inner edge to an edge handle: wall thickness plus a small gap. */
  private handleGap(wallThickness: number): number {
    return wallThickness + 12 * this.px;
  }

  private drawHandles(room: Room): void {
    this.handleGroup.destroyChildren();
    const positions = this.handlePositions(room);
    for (const kind of ['east', 'south', 'notch'] as HandleKind[]) {
      const p = positions[kind];
      if (!p) continue;
      const handle = new Konva.Circle({
        x: p.x, y: p.y, radius: 7 * this.px, fill: THEME.handle, stroke: THEME.handleStroke,
        strokeWidth: 2, strokeScaleEnabled: false, draggable: true, name: 'handle',
      });
      this.wireHandle(handle, kind);
      this.handleGroup.add(handle);
    }
  }

  private wireHandle(handle: Konva.Circle, kind: HandleKind): void {
    let startLayout: Layout | null = null;
    const cursor = kind === 'east' ? 'ew-resize' : kind === 'south' ? 'ns-resize' : 'move';
    handle.on('mouseenter', () => (this.stage.container().style.cursor = cursor));
    handle.on('mouseleave', () => (this.stage.container().style.cursor = 'default'));
    handle.on('dragstart', () => {
      this.draggingHandle = true;
      startLayout = this.store.layout;
      this.store.select(null);
    });
    handle.on('dragmove', () => {
      if (!startLayout) return;
      const r = startLayout.room;
      const p = handle.position();
      const snap = (v: number) => roundTo(v, 5);
      let next: Room = r;
      if (kind === 'east') next = { ...r, width: snap(p.x - this.handleGap(r.wallThickness)) };
      if (kind === 'south') next = { ...r, depth: snap(p.y - this.handleGap(r.wallThickness)) };
      if (kind === 'notch') {
        const c = r.notch.corner;
        next = {
          ...r,
          notch: {
            corner: c,
            width: snap(c.endsWith('left') ? p.x : r.width - p.x),
            depth: snap(c.startsWith('top') ? p.y : r.depth - p.y),
          },
        };
      }
      // Always derive from the layout at drag start, so openings don't drift.
      this.store.preview(setRoom(startLayout, next));
      // Keep the handle where the (clamped) room edge actually is.
      const pos = this.handlePositions(this.store.layout.room)[kind];
      if (pos) {
        if (kind === 'east') handle.position({ x: pos.x, y: p.y });
        else if (kind === 'south') handle.position({ x: p.x, y: pos.y });
        else handle.position(pos);
      }
    });
    handle.on('dragend', () => {
      this.draggingHandle = false;
      this.store.commit(this.store.layout);
      startLayout = null;
    });
  }

  // ------------------------------------------------------------ Stage-level events

  private bindStageEvents(): void {
    // Clicking empty space clears the selection.
    this.stage.on('mousedown touchstart', (e) => {
      const target = e.target;
      const onItem = target.findAncestor('.furniture') || target.findAncestor('.opening') || target.hasName('handle');
      const onTransformer = target.getParent()?.className === 'Transformer';
      if (!onItem && !onTransformer) this.store.select(null);
    });
  }
}
