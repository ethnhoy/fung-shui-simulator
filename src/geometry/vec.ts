/**
 * Tiny 2D vector helpers. Points are plain {x, y} objects; every function
 * returns a new object instead of modifying its input.
 */
import type { Point } from '../model/types';

export const vec = (x: number, y: number): Point => ({ x, y });
export const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Point, k: number): Point => ({ x: a.x * k, y: a.y * k });
export const dot = (a: Point, b: Point): number => a.x * b.x + a.y * b.y;
/** 2D cross product (z of the 3D cross). Its sign tells you which side b is of a. */
export const cross = (a: Point, b: Point): number => a.x * b.y - a.y * b.x;
export const length = (a: Point): number => Math.hypot(a.x, a.y);
export const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

export function normalize(a: Point): Point {
  const len = length(a);
  return len === 0 ? { x: 0, y: 0 } : { x: a.x / len, y: a.y / len };
}

export const degToRad = (deg: number): number => (deg * Math.PI) / 180;
export const radToDeg = (rad: number): number => (rad * 180) / Math.PI;

/**
 * Rotate a vector clockwise by `deg` degrees.
 * Because y points *down* on screen, the usual maths rotation formula
 * turns things clockwise visually, which matches Konva and our model.
 */
export function rotate(a: Point, deg: number): Point {
  const r = degToRad(deg);
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { x: a.x * c - a.y * s, y: a.x * s + a.y * c };
}

/** Normalise an angle into [0, 360). */
export function normalizeAngle(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Round to the nearest multiple of `step` (e.g. snap 37 to 35 with step 5). */
export function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
