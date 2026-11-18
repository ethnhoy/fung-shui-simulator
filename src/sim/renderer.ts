/**
 * Draws the chi flow on a plain Canvas 2D layer that sits *under* the Konva
 * editor: the floor, the chi-type heatmap, optional velocity arrows and the
 * tracer particles with their trails.
 *
 * Accessibility: colour alone isn't enough (red/green colour blindness), so
 * sha chi also gets diagonal hatching and si chi gets dots.
 */
import type { Point } from '../model/types';
import { SIM } from '../rules/config';
import { CLASS_CODE } from './classify';
import type { ChiClass, RasterGrid } from './types';

/** Screen transform of the editor's world: screen = origin + room_cm × scale. */
export interface ViewTransform {
  x: number;
  y: number;
  scale: number;
}

export interface RenderOptions {
  heatmap: boolean;
  particles: boolean;
  arrows: boolean;
  /** Let sharp corners, mirrors and the coffin line act on the chi particles. */
  problems: boolean;
}

/** One representative colour per class (legend swatches). */
export const CHI_COLOURS: Record<ChiClass, { css: string; label: string }> = {
  sha: { css: 'rgb(198, 66, 50)', label: 'Sha chi: rushing' },
  sheng: { css: 'rgb(222, 196, 86)', label: 'Sheng chi: healthy' },
  si: { css: 'rgb(118, 140, 163)', label: 'Si chi: stagnant' },
};
/**
 * The chi colour ramp, by chi level (fraction of the reference speed):
 * still blue-grey → soft yellow → gold → orange → red. A smooth gradient
 * instead of three flat colours, so you can see the flow speed up and slow down.
 * The class boundaries (si below 0.08, sha above 0.7) sit on this same scale.
 */
export const CHI_RAMP: [number, [number, number, number]][] = [
  [0.0, [118, 140, 163]], // still: blue-grey
  [0.08, [178, 178, 140]], // edge of stagnant: muted olive
  [0.22, [222, 196, 86]], // gentle: soft yellow
  [0.45, [226, 168, 62]], // lively: gold-amber
  [0.7, [221, 122, 58]], // edge of rushing: orange
  [1.0, [198, 66, 50]], // rushing: red
];

/** Interpolate the ramp at a chi level (0 = still, 1 = door speed). */
export function chiRgb(level: number): [number, number, number] {
  const l = Math.max(0, Math.min(CHI_RAMP[CHI_RAMP.length - 1][0], level));
  let i = 0;
  while (i < CHI_RAMP.length - 2 && l > CHI_RAMP[i + 1][0]) i++;
  const [l0, c0] = CHI_RAMP[i];
  const [l1, c1] = CHI_RAMP[i + 1];
  const t = (l - l0) / (l1 - l0);
  return [0, 1, 2].map((k) => Math.round(c0[k] + (c1[k] - c0[k]) * t)) as [number, number, number];
}

/** The same ramp as a CSS gradient, for the legend. */
export function chiCssGradient(): string {
  const max = CHI_RAMP[CHI_RAMP.length - 1][0];
  return `linear-gradient(90deg, ${CHI_RAMP.map(([l, c]) => `rgb(${c.join(',')}) ${(l / max) * 100}%`).join(', ')})`;
}

/** Particles are drawn in a handful of colour bands (one canvas path per band keeps drawing fast). */
export const PARTICLE_BANDS = [0.04, 0.15, 0.3, 0.5, 0.7, 0.9, 1.0].map((l) => {
  const [r, g, b] = chiRgb(l);
  return { upTo: l, css: `rgb(${r},${g},${b})` };
});
export const bandOf = (level: number) => {
  for (let i = 0; i < PARTICLE_BANDS.length - 1; i++) if (level < (PARTICLE_BANDS[i].upTo + PARTICLE_BANDS[i + 1].upTo) / 2) return i;
  return PARTICLE_BANDS.length - 1;
};

const FLOOR = '#f4ece0';
const HEAT_ALPHA = 0.5;

function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  return c;
}

/** Small repeating tile used as a pattern: diagonal lines for sha, dots for si. */
function patternTile(kind: 'hatch' | 'dots', colour: string): HTMLCanvasElement {
  const c = makeCanvas(8, 8);
  const ctx = c.getContext('2d')!;
  ctx.strokeStyle = ctx.fillStyle = colour;
  if (kind === 'hatch') {
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, 8);
    ctx.lineTo(8, 0);
    ctx.moveTo(-2, 2);
    ctx.lineTo(2, -2);
    ctx.moveTo(6, 10);
    ctx.lineTo(10, 6);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(4, 4, 1.1, 0, Math.PI * 2);
    ctx.fill();
  }
  return c;
}

export class FlowRenderer {
  private ctx: CanvasRenderingContext2D;
  private dpr = 1;
  /** Cached heatmap at screen size; rebuilt only when the field or the view changes. */
  private heatLayer: HTMLCanvasElement | null = null;
  private heatKey = '';
  private classes: Uint8Array | null = null;
  private chi: Float32Array | null = null;
  private classesVersion = 0;

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
  }

  /** Match the canvas to its CSS size, at full device resolution so it stays sharp on retina screens. */
  resize(): void {
    this.dpr = window.devicePixelRatio || 1;
    const w = Math.round(this.canvas.clientWidth * this.dpr);
    const h = Math.round(this.canvas.clientHeight * this.dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      this.heatKey = '';
    }
  }

  /** New chi field and the classes derived from it (classes drive the hatching/dots patterns). */
  setChi(chi: Float32Array, classes: Uint8Array): void {
    this.chi = chi;
    this.classes = classes;
    this.classesVersion++;
  }

  clear(): void {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  draw(
    grid: RasterGrid | null,
    view: ViewTransform,
    roomPoly: Point[],
    field: { ux: Float32Array; uy: Float32Array } | null,
    opts: RenderOptions,
  ): void {
    this.resize();
    const ctx = this.ctx;
    this.clear();
    // From here on, draw in room centimetres.
    ctx.setTransform(this.dpr * view.scale, 0, 0, this.dpr * view.scale, this.dpr * view.x, this.dpr * view.y);

    ctx.save();
    ctx.beginPath();
    roomPoly.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.fillStyle = FLOOR;
    ctx.fill();
    ctx.clip(); // nothing below spills outside the room

    if (grid && opts.heatmap && this.classes && this.chi) this.drawHeatmap(grid, view);
    if (grid && opts.arrows && field) this.drawArrows(grid, field, view.scale);
    ctx.restore();
  }

  private drawHeatmap(grid: RasterGrid, view: ViewTransform): void {
    const key = `${this.classesVersion}|${view.x}|${view.y}|${view.scale}|${this.canvas.width}x${this.canvas.height}`;
    if (key !== this.heatKey) {
      this.heatLayer = this.buildHeatLayer(grid, view);
      this.heatKey = key;
    }
    // The cached layer is in screen pixels, so draw it without the room transform.
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.heatLayer!, 0, 0);
    ctx.restore();
  }

  private buildHeatLayer(grid: RasterGrid, view: ViewTransform): HTMLCanvasElement {
    const classes = this.classes!;
    const { nx, ny } = grid;
    // 1. Colour image, one pixel per grid cell.
    const colour = makeCanvas(nx, ny);
    const sha = makeCanvas(nx, ny);
    const si = makeCanvas(nx, ny);
    const img = new ImageData(nx, ny);
    const shaImg = new ImageData(nx, ny);
    const siImg = new ImageData(nx, ny);
    for (let k = 0; k < classes.length; k++) {
      const c = classes[k];
      if (c === CLASS_CODE.none) continue;
      const rgb = chiRgb(this.chi![k] / SIM.inletSpeed);
      img.data.set([rgb[0], rgb[1], rgb[2], 255], k * 4);
      if (c === CLASS_CODE.sha) shaImg.data[k * 4 + 3] = 255;
      if (c === CLASS_CODE.si) siImg.data[k * 4 + 3] = 255;
    }
    colour.getContext('2d')!.putImageData(img, 0, 0);
    sha.getContext('2d')!.putImageData(shaImg, 0, 0);
    si.getContext('2d')!.putImageData(siImg, 0, 0);

    // 2. Stretch it over the room on a screen-sized canvas. Smoothing blends cell edges softly.
    const layer = makeCanvas(this.canvas.width, this.canvas.height);
    const lctx = layer.getContext('2d')!;
    const s = this.dpr * view.scale;
    const dx = this.dpr * (view.x + grid.originX * view.scale);
    const dy = this.dpr * (view.y + grid.originY * view.scale);
    const dw = nx * grid.cellCm * s;
    const dh = ny * grid.cellCm * s;
    lctx.imageSmoothingEnabled = true;
    lctx.globalAlpha = HEAT_ALPHA;
    lctx.drawImage(colour, dx, dy, dw, dh);
    lctx.globalAlpha = 1;

    // 3. Patterns: fill a canvas with the pattern, then keep it only where the mask is set.
    const overlay = (mask: HTMLCanvasElement, tile: HTMLCanvasElement) => {
      const tmp = makeCanvas(layer.width, layer.height);
      const t = tmp.getContext('2d')!;
      t.fillStyle = t.createPattern(tile, 'repeat')!;
      t.fillRect(0, 0, tmp.width, tmp.height);
      t.globalCompositeOperation = 'destination-in';
      t.imageSmoothingEnabled = true;
      t.drawImage(mask, dx, dy, dw, dh);
      lctx.drawImage(tmp, 0, 0);
    };
    overlay(sha, patternTile('hatch', 'rgba(150, 45, 30, 0.45)'));
    overlay(si, patternTile('dots', 'rgba(60, 80, 105, 0.45)'));
    return layer;
  }

  private drawArrows(grid: RasterGrid, field: { ux: Float32Array; uy: Float32Array }, scale: number): void {
    const ctx = this.ctx;
    const every = Math.max(2, Math.round(20 / grid.cellCm)); // one arrow per ~20 cm
    const maxLen = 18; // cm at full inlet speed
    ctx.strokeStyle = 'rgba(58, 53, 48, 0.55)';
    ctx.lineWidth = 1.1 / scale;
    ctx.beginPath();
    for (let j = 0; j < grid.ny; j += every) {
      for (let i = 0; i < grid.nx; i += every) {
        const k = j * grid.nx + i;
        if (!grid.floor[k]) continue;
        const vx = field.ux[k];
        const vy = field.uy[k];
        const speed = Math.hypot(vx, vy);
        if (speed < SIM.inletSpeed * 0.03) continue;
        const len = Math.min(1, speed / SIM.inletSpeed) * maxLen;
        const ux = vx / speed;
        const uy = vy / speed;
        const x0 = grid.originX + (i + 0.5) * grid.cellCm - (ux * len) / 2;
        const y0 = grid.originY + (j + 0.5) * grid.cellCm - (uy * len) / 2;
        const x1 = x0 + ux * len;
        const y1 = y0 + uy * len;
        const head = Math.min(5, len * 0.4);
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        // Arrow head: two short lines angled back from the tip.
        ctx.moveTo(x1, y1);
        ctx.lineTo(x1 - head * (ux - uy * 0.5), y1 - head * (uy + ux * 0.5));
        ctx.moveTo(x1, y1);
        ctx.lineTo(x1 - head * (ux + uy * 0.5), y1 - head * (uy - ux * 0.5));
      }
    }
    ctx.stroke();
  }



}
