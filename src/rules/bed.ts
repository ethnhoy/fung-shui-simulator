/**
 * Rule 1: the bed's "commanding position" (weight 35), plus the optional
 * desk check (half weight, same category).
 *
 * The idea: lying in bed you should be able to see the door without
 * being in line with it, with a solid wall behind your head, and
 * room to get in and out on both sides.
 */
import { heightClass } from '../model/catalog';
import { localToRoom, rectCorners, facingVector } from '../geometry/rect';
import {
  angleBetween,
  pointInPoly,
  pointSegmentDistance,
  polygonDistance,
  polygonsOverlap,
  raySegment,
  segmentHitsPolygon,
  segmentsIntersect,
} from '../geometry/raycast';
import type { Wall } from '../geometry/room';
import { add, dot, normalize, normalizeAngle, radToDeg, rotate, scale, sub } from '../geometry/vec';
import { updateFurniture } from '../model/layoutOps';
import type { Furniture, Layout, Point } from '../model/types';
import { RULES } from './config';
import { bedGeometry, buildContext, doorGeometry, type BedGeometry, type DoorGeometry, type RuleContext } from './context';
import type { HighlightShape, RuleResult } from './types';

const C = RULES.bed;
const P = C.penalty;

function result(r: Omit<RuleResult, 'category'>): RuleResult {
  return { category: 'bed', ...r };
}

/** The wall the bed's head end is pushed against (if any), and where along it the headboard spans. */
export function headWall(ctx: RuleContext, bed: BedGeometry): { wall: Wall; from: number; to: number } | null {
  const f = bed.f;
  const left = localToRoom(f, { x: -f.width / 2, y: -f.depth / 2 });
  const right = localToRoom(f, { x: f.width / 2, y: -f.depth / 2 });
  for (const wall of ctx.walls) {
    // The wall must face the same way the sleeper faces, and touch the head end.
    if (dot(wall.inward, bed.facing) < 0.9) continue;
    if (pointSegmentDistance(bed.headCentre, wall.start, wall.end) > C.wallContactCm) continue;
    const t1 = dot(sub(left, wall.start), wall.dir);
    const t2 = dot(sub(right, wall.start), wall.dir);
    return { wall, from: Math.min(t1, t2), to: Math.max(t1, t2) };
  }
  return null;
}

/** Door swing area (quarter circle) as a polygon, or null if the door swings outward. */
export function doorSwingPolygon(door: DoorGeometry): Point[] | null {
  const o = door.opening;
  if (!o.swingsInward) return null;
  const towardsOther = normalize(sub(o.hinge === 'start' ? door.b : door.a, door.hinge));
  const inward = door.wall.inward;
  const pts: Point[] = [door.hinge];
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * (Math.PI / 2);
    pts.push(add(door.hinge, add(scale(towardsOther, Math.cos(a) * o.width), scale(inward, Math.sin(a) * o.width))));
  }
  return pts;
}

/** The strip of floor just inside the door that people walk through. */
export function walkwayPolygon(door: DoorGeometry): Point[] {
  const n = scale(door.wall.inward, C.walkwayDepthCm);
  return [door.a, door.b, add(door.b, n), add(door.a, n)];
}

/** Smallest clear distance beside one long side of the bed (side = -1 or +1 in the bed's own x). */
function sideClearance(ctx: RuleContext, bed: BedGeometry, side: -1 | 1): { dist: number; from: Point; to: Point } {
  const f = bed.f;
  const dir = rotate({ x: side, y: 0 }, f.rotation);
  let best = { dist: Infinity, from: bed.footCentre, to: bed.footCentre };
  for (let y = -f.depth / 2 + C.sideIgnoreNearHeadCm; y <= f.depth / 2 - 5; y += 10) {
    const edge = localToRoom(f, { x: (side * f.width) / 2, y });
    // Start the ray 1 cm *inside* the bed so a wall the bed touches is still found.
    const hit = ctx.castRay(add(edge, scale(dir, -1)), dir, 300, [f.id]);
    const clear = Math.max(0, hit.dist - 1);
    if (clear < best.dist) best = { dist: clear, from: edge, to: hit.point };
  }
  return best;
}

/** Nightstands sitting beside the head end on each side (sleeper's left = bed's +x). */
function nightstandsBeside(ctx: RuleContext, bed: BedGeometry): { left?: Furniture; right?: Furniture } {
  const f = bed.f;
  const out: { left?: Furniture; right?: Furniture } = {};
  for (const n of ctx.layout.furniture) {
    if (n.type !== 'nightstand') continue;
    const local = rotate(sub({ x: n.x, y: n.y }, { x: f.x, y: f.y }), -f.rotation);
    const besideHead = local.y > -f.depth / 2 - 15 && local.y < -f.depth / 2 + 80;
    const gap = Math.abs(local.x) - f.width / 2;
    if (!besideHead || gap < -5 || gap > 70) continue;
    if (local.x > 0) out.left ??= n;
    else out.right ??= n;
  }
  return out;
}

/**
 * Evaluate the bed's placement (no fixes attached). Used both for the report
 * and to score candidate positions when looking for a better spot.
 */
export function evaluateBedPlacement(ctx: RuleContext): RuleResult[] {
  const bed = ctx.bed;
  if (!bed) {
    return [result({
      id: 'bed.missing', status: 'bad', scoreImpact: -100,
      message: 'There’s no bed yet',
      explanation: 'The bed is the heart of a bedroom’s feng shui. Add one from the palette to get a full reading.',
      highlight: [],
    })];
  }
  const out: RuleResult[] = [];
  const bedOutline: HighlightShape = { kind: 'outline', points: bed.poly };
  const door = ctx.mainDoor;

  // --- Line of sight to the door (commanding position).
  if (door) {
    const toDoor = sub(door.centre, bed.pillow);
    const angle = angleBetween(bed.facing, toDoor);
    // Stop the sight line just inside the room so the door's own wall doesn't count as blocking.
    const target = add(door.centre, scale(door.wall.inward, 2));
    const ray: HighlightShape = { kind: 'ray', from: bed.pillow, to: door.centre };
    const wallInWay = ctx.walls.some((w) => w.index !== door.wall.index && segmentsIntersect(bed.pillow, target, w.start, w.end));
    const blockers = ctx.obstacles.filter(
      (o) => o.f.id !== bed.f.id && heightClass(o.f.heightCm) === 'tall' && segmentHitsPolygon(bed.pillow, target, o.poly),
    );
    if (angle > C.fieldOfViewDeg / 2 || wallInWay) {
      out.push(result({
        id: 'bed.doorHidden', status: 'bad', scoreImpact: P.doorHidden,
        message: 'You can’t see the door from the bed',
        explanation: wallInWay
          ? 'A wall corner hides the door from where your head rests. Feng shui’s “commanding position” means seeing who enters without turning, which helps you feel safe enough to rest.'
          : `The door is ${Math.round(angle)}° away from where you face lying down, so you’d have to twist to see it. Feng shui’s “commanding position” means seeing who enters without turning, which helps you feel safe enough to rest.`,
        highlight: [ray, bedOutline],
      }));
    } else if (blockers.length) {
      out.push(result({
        id: 'bed.doorBlocked', status: 'warn', scoreImpact: P.doorBlocked,
        message: `The ${blockers[0].f.type} blocks your view of the door`,
        explanation: 'The door is in the right direction, but tall furniture stands between you and it. A clear sight line lets you see who comes in.',
        highlight: [ray, ...blockers.map((b) => ({ kind: 'outline' as const, points: b.poly }))],
      }));
    } else {
      out.push(result({
        id: 'bed.commanding', status: 'good', scoreImpact: 0,
        message: 'You can see the door from the bed',
        explanation: 'This is the “commanding position”: you can see who enters without turning your head.',
        highlight: [ray],
      }));
    }

    // --- Coffin position: feet pointing straight out of the door.
    const t = raySegment(bed.footCentre, bed.facing, door.a, door.b);
    if (t !== null) {
      out.push(result({
        id: 'bed.coffin', status: 'bad', scoreImpact: P.coffin,
        message: 'Your feet point straight out of the door (“coffin position”)',
        explanation: 'Traditionally the dead were carried out feet first, so lying in line with the door is considered draining. Turn or shift the bed so it isn’t aligned with the doorway.',
        highlight: [{ kind: 'ray', from: bed.footCentre, to: add(bed.footCentre, scale(bed.facing, t)) }, bedOutline],
      }));
    }
  }

  // --- Solid wall behind the headboard.
  const hw = headWall(ctx, bed);
  if (!hw) {
    out.push(result({
      id: 'bed.noWallBehind', status: 'bad', scoreImpact: P.noWallBehind,
      message: 'The headboard isn’t against a wall',
      explanation: 'A solid wall behind your head gives support (like a mountain at your back). A floating bed feels unsettled.',
      highlight: [bedOutline],
    }));
  } else {
    const behind = ctx.layout.openings.filter(
      (o) => o.wallIndex === hw.wall.index && o.offset + o.width / 2 > hw.from && o.offset - o.width / 2 < hw.to,
    );
    if (behind.length) {
      const what = behind[0].kind === 'window' ? 'a window' : 'a door';
      out.push(result({
        id: 'bed.openingBehind', status: 'bad', scoreImpact: P.openingBehind,
        message: `There’s ${what} behind the headboard`,
        explanation: 'An opening behind your head means no solid support while you sleep, and chi (and draughts) rush past your head.',
        highlight: [bedOutline, ...behind.map((o) => {
          const g = doorGeometry(ctx.walls, o);
          return { kind: 'ray' as const, from: g.a, to: g.b };
        })],
      }));
    } else {
      out.push(result({
        id: 'bed.solidWall', status: 'good', scoreImpact: 0,
        message: 'Solid wall behind the headboard',
        explanation: 'A solid wall behind your head gives a feeling of support, like a mountain at your back.',
        highlight: [{ kind: 'ray', from: localToRoom(bed.f, { x: -bed.f.width / 2, y: -bed.f.depth / 2 }), to: localToRoom(bed.f, { x: bed.f.width / 2, y: -bed.f.depth / 2 }) }],
      }));
    }
  }

  // --- Diagonal from the door / same wall as the door.
  if (door) {
    const cx = ctx.layout.room.width / 2;
    const cy = ctx.layout.room.depth / 2;
    const diagonal = (door.centre.x - cx) * (bed.f.x - cx) < 0 && (door.centre.y - cy) * (bed.f.y - cy) < 0;
    if (hw && hw.wall.index === door.wall.index) {
      out.push(result({
        id: 'bed.sameWall', status: 'warn', scoreImpact: P.sameWallAsDoor,
        message: 'The bed is on the same wall as the door',
        explanation: 'From here the door is beside you rather than in view. The strongest spot is usually diagonally across the room from the door.',
        highlight: [bedOutline, { kind: 'ray', from: door.a, to: door.b }],
      }));
    } else if (diagonal) {
      out.push(result({
        id: 'bed.diagonal', status: 'good', scoreImpact: 0,
        message: 'The bed is diagonally across from the door',
        explanation: 'This is the classic commanding spot: as far from the door as possible while still facing it.',
        highlight: [{ kind: 'ray', from: bed.pillow, to: door.centre }],
      }));
    }
  }

  // --- Windows right beside the bed.
  for (const o of ctx.layout.openings) {
    if (o.kind !== 'window' || (hw && o.wallIndex === hw.wall.index)) continue;
    const g = doorGeometry(ctx.walls, o);
    if (polygonDistance(bed.poly, [g.a, g.b]) <= C.windowNearCm) {
      out.push(result({
        id: `bed.besideWindow.${o.id}`, status: 'warn', scoreImpact: P.besideWindow,
        message: 'The bed is right beside a window',
        explanation: 'Sleeping next to a window exposes you to draughts and fast-moving chi. Heavy curtains at night help.',
        highlight: [bedOutline, { kind: 'ray', from: g.a, to: g.b }],
      }));
    }
  }

  // --- Door swing and walkway (all doors that swing in).
  let inSwing = false;
  for (const o of ctx.layout.openings) {
    if (o.kind !== 'door') continue;
    const g = doorGeometry(ctx.walls, o);
    const swing = doorSwingPolygon(g);
    if (swing && polygonsOverlap(swing, bed.poly)) {
      inSwing = true;
      out.push(result({
        id: `bed.doorSwing.${o.id}`, status: 'bad', scoreImpact: P.inDoorSwing,
        message: 'The door swings into the bed',
        explanation: 'The door can’t open fully and chi bumps straight into the bed. Leave the door’s swing area clear.',
        highlight: [{ kind: 'outline', points: swing }, bedOutline],
      }));
    }
  }
  if (door && !inSwing && polygonsOverlap(walkwayPolygon(door), bed.poly)) {
    out.push(result({
      id: 'bed.walkway', status: 'warn', scoreImpact: P.inWalkway,
      message: 'The bed sits in the walkway from the door',
      explanation: 'You walk straight into the bed when you enter, and chi from the door hits it head on.',
      highlight: [{ kind: 'outline', points: walkwayPolygon(door) }, bedOutline],
    }));
  }

  // --- Balanced access on both sides (double beds and up).
  if (bed.f.width >= C.doubleMinWidthCm) {
    const sides = ([1, -1] as const).map((s) => ({ name: s === 1 ? 'left' : 'right', ...sideClearance(ctx, bed, s) }));
    const worst = sides.reduce((a, b) => (b.dist < a.dist ? b : a));
    if (worst.dist < 5) {
      out.push(result({
        id: 'bed.sideBlocked', status: 'warn', scoreImpact: P.sideAgainstWall,
        message: `The ${worst.name} side of the bed (as you lie in it) is pushed against something`,
        explanation: 'A double bed should be reachable from both sides, so both partners feel equally supported and welcome.',
        highlight: [bedOutline, { kind: 'ray', from: worst.from, to: worst.to }],
      }));
    } else if (Math.round(worst.dist) < C.sideClearanceCm) {
      // (Rounded so exactly 60 cm, measured as 59.9 by the ray, still passes.)
      out.push(result({
        id: 'bed.sideTight', status: 'warn', scoreImpact: P.tightSide,
        message: `Only ${Math.round(worst.dist)} cm of space on the ${worst.name} side of the bed`,
        explanation: `Aim for at least ${C.sideClearanceCm} cm on both sides so getting in and out is easy and chi can circulate.`,
        highlight: [{ kind: 'ray', from: worst.from, to: worst.to }],
      }));
    } else {
      out.push(result({
        id: 'bed.balancedAccess', status: 'good', scoreImpact: 0,
        message: 'Easy access on both sides of the bed',
        explanation: 'Both sides have room to get in and out, a sign of balance in a shared bed.',
        highlight: sides.map((s) => ({ kind: 'ray' as const, from: s.from, to: s.to })),
      }));
    }

    const stands = nightstandsBeside(ctx, bed);
    if (stands.left && stands.right) {
      const tol = C.nightstandMatchToleranceCm;
      const match = Math.abs(stands.left.width - stands.right.width) <= tol && Math.abs(stands.left.heightCm - stands.right.heightCm) <= tol;
      if (match) {
        out.push(result({
          id: 'bed.matchingNightstands', status: 'good', scoreImpact: C.bonus.matchingNightstands,
          message: 'Matching nightstands on both sides',
          explanation: 'Pairs symbolise balance and partnership.',
          highlight: [stands.left, stands.right].map((n) => ({ kind: 'outline' as const, points: rectCorners(n) })),
        }));
      }
    }
  }
  return out;
}

/** The desk check (half weight): sitting at the desk you should see the door, not have your back to it. */
export function evaluateDesks(ctx: RuleContext): RuleResult[] {
  const door = ctx.mainDoor;
  if (!door) return [];
  const out: RuleResult[] = [];
  for (const d of ctx.layout.furniture.filter((f) => f.type === 'desk')) {
    // You sit in front of the desk's front edge, facing back towards it.
    const front = facingVector(d);
    const seat = add({ x: d.x, y: d.y }, scale(front, d.depth / 2 + 35));
    const angle = angleBetween(scale(front, -1), sub(door.centre, seat));
    const ray: HighlightShape = { kind: 'ray', from: seat, to: door.centre };
    if (angle > 110) {
      out.push(result({
        id: `bed.deskBackToDoor.${d.id}`, status: 'bad', scoreImpact: C.desk.backToDoor,
        message: 'Your back is to the door at the desk',
        explanation: 'Working with your back to the door leaves you feeling exposed. Turn the desk so you can see the door while you sit.',
        highlight: [ray, { kind: 'outline', points: rectCorners(d) }],
        fix: rotateDeskFix(ctx, d, door),
      }));
    } else if (angle > C.fieldOfViewDeg / 2) {
      out.push(result({
        id: `bed.deskDoorToSide.${d.id}`, status: 'warn', scoreImpact: C.desk.doorToSide,
        message: 'The door is off to the side when you sit at the desk',
        explanation: 'You can glimpse the door but not easily. Facing it more directly helps you settle into work.',
        highlight: [ray, { kind: 'outline', points: rectCorners(d) }],
      }));
    } else {
      out.push(result({
        id: `bed.deskCommanding.${d.id}`, status: 'good', scoreImpact: 0,
        message: 'You can see the door from the desk',
        explanation: 'The desk is in a commanding position too.',
        highlight: [ray],
      }));
    }
  }
  return out;
}

/**
 * Turn the desk so the sitter faces the door. If the chair would then end up
 * in a wall, slide the desk away from that wall until there's room to sit.
 */
function rotateDeskFix(ctx: RuleContext, d: Furniture, door: DoorGeometry) {
  // The desk's front should point away from the door, so the person sitting at it faces the door.
  const away = sub({ x: d.x, y: d.y }, door.centre);
  const rotation = normalizeAngle(Math.round((radToDeg(Math.atan2(away.y, away.x)) - 90) / 90) * 90);
  const front = facingVector({ rotation });
  let centre = { x: d.x, y: d.y };
  for (let shift = 0; shift <= 150; shift += 5) {
    centre = add({ x: d.x, y: d.y }, scale(front, -shift));
    const seat = add(centre, scale(front, d.depth / 2 + 35));
    const seatClear = pointInPoly(seat, ctx.poly) && ctx.walls.every((w) => pointSegmentDistance(seat, w.start, w.end) >= 30);
    const deskInside = rectCorners({ ...d, ...centre, rotation }).every((c) => pointInPoly(c, ctx.poly));
    if (seatClear && deskInside) break;
  }
  return {
    label: 'Turn the desk to face the door',
    apply: (l: Layout) => updateFurniture(l, d.id, { rotation, x: Math.round(centre.x), y: Math.round(centre.y) }),
  };
}

// ---------------------------------------------------------------- Best spot search

/** Sum of a placement's penalties/bonuses: 100 is perfect. */
export function placementScore(results: RuleResult[]): number {
  return 100 + results.reduce((s, r) => s + r.scoreImpact, 0);
}

/** Can the bed go here without leaving the room or overlapping other furniture? */
function fits(ctx: RuleContext, bed: Furniture, candidate: Furniture): boolean {
  const corners = rectCorners({ ...candidate, width: candidate.width - 2, depth: candidate.depth - 2 });
  if (!corners.every((c) => pointInPoly(c, ctx.poly))) return false;
  return ctx.obstacles.every((o) => o.f.id === bed.id || !polygonsOverlap(o.poly, corners));
}

/**
 * Try the bed against every wall, sliding along it, and return the
 * best-scoring position (or null if nothing beats the current one).
 */
export function suggestBedPosition(layout: Layout): { x: number; y: number; rotation: number; score: number } | null {
  const ctx = buildContext(layout);
  if (!ctx.bed) return null;
  const bed = ctx.bed.f;
  const current = placementScore(evaluateBedPlacement(ctx));
  let best: { x: number; y: number; rotation: number; score: number } | null = null;

  for (const wall of ctx.walls) {
    if (wall.length < bed.width) continue;
    // Head against this wall means the bed faces the wall's inward direction.
    const rotation = normalizeAngle(Math.round(radToDeg(Math.atan2(wall.inward.y, wall.inward.x)) - 90));
    for (let t = bed.width / 2; t <= wall.length - bed.width / 2 + 0.01; t += C.searchStepCm) {
      const centre = add(add(wall.start, scale(wall.dir, t)), scale(wall.inward, bed.depth / 2 + 1));
      const candidate = { ...bed, x: Math.round(centre.x), y: Math.round(centre.y), rotation };
      if (!fits(ctx, bed, candidate)) continue;
      const moved = updateFurniture(layout, bed.id, { x: candidate.x, y: candidate.y, rotation });
      const c = buildContext(moved);
      c.bed = bedGeometry(moved.furniture.find((f) => f.id === bed.id)!);
      const score = placementScore(evaluateBedPlacement(c));
      if (!best || score > best.score) best = { x: candidate.x, y: candidate.y, rotation, score };
    }
  }
  return best && best.score > current ? best : null;
}

/** Rule 1 entry point: placement results plus the desk check, with a "move the bed" fix on placement problems. */
export function bedRule(ctx: RuleContext): RuleResult[] {
  const placement = evaluateBedPlacement(ctx);
  const needsMove = placement.some((r) => r.status === 'bad' && r.id !== 'bed.missing');
  if (needsMove && ctx.bed) {
    const spot = suggestBedPosition(ctx.layout);
    if (spot) {
      const id = ctx.bed.f.id;
      const fix = {
        label: 'Move the bed to a stronger spot',
        apply: (l: Layout) => updateFurniture(l, id, { x: spot.x, y: spot.y, rotation: spot.rotation }),
      };
      for (const r of placement) if (r.status === 'bad') r.fix = fix;
    }
  }
  return [...placement, ...evaluateDesks(ctx)];
}
