/**
 * Rule 3: mirrors (weight 10).
 *
 * A mirror that reflects the bed is said to bounce energy around while you
 * sleep (and can startle you at night). We cast a ray from the mirror's
 * face; if the first thing it meets is the bed, that's an issue. A mirror on
 * the headboard wall right above the bed counts too.
 */
import { facingVector, localToRoom, rectCorners } from '../geometry/rect';
import { pointSegmentDistance } from '../geometry/raycast';
import { add, scale } from '../geometry/vec';
import { removeById } from '../model/layoutOps';
import { RULES } from './config';
import type { RuleContext } from './context';
import type { RuleResult } from './types';

const C = RULES.mirrors;

export function mirrorsRule(ctx: RuleContext): RuleResult[] {
  const mirrors = ctx.layout.furniture.filter((f) => f.type === 'mirror');
  const bed = ctx.bed;
  if (mirrors.length === 0 || !bed) {
    return [{
      id: 'mirrors.none', category: 'mirrors', status: 'good', scoreImpact: 0,
      message: mirrors.length ? 'Mirrors are fine (no bed to reflect)' : 'No mirrors reflect the bed',
      explanation: 'Mirrors that face the bed are a common feng shui concern; none here.',
      highlight: [],
    }];
  }

  const headLeft = localToRoom(bed.f, { x: -bed.f.width / 2, y: -bed.f.depth / 2 });
  const headRight = localToRoom(bed.f, { x: bed.f.width / 2, y: -bed.f.depth / 2 });
  const out: RuleResult[] = [];
  for (const m of mirrors) {
    const face = facingVector(m);
    const origin = add({ x: m.x, y: m.y }, scale(face, m.depth / 2 + 0.5));
    const hit = ctx.castRay(origin, face, C.rayLengthCm, [m.id]);
    const overBed = pointSegmentDistance({ x: m.x, y: m.y }, headLeft, headRight) <= C.overBedCm;
    const fix = { label: 'Move the mirror inside a wardrobe door', apply: (l: typeof ctx.layout) => removeById(l, m.id) };
    const outline = { kind: 'outline' as const, points: rectCorners(m) };

    if (overBed) {
      out.push({
        id: `mirrors.overBed.${m.id}`, category: 'mirrors', status: 'bad', scoreImpact: C.penalty,
        message: 'A mirror hangs right over the bed',
        explanation: 'A mirror above your head is said to unsettle sleep, and practically it’s heavy glass above where you lie. Move it, or cover it at night.',
        highlight: [outline, { kind: 'outline', points: bed.poly }], fix,
      });
    } else if (hit.kind === 'furniture' && hit.id === bed.f.id) {
      out.push({
        id: `mirrors.facesBed.${m.id}`, category: 'mirrors', status: 'bad', scoreImpact: C.penalty,
        message: 'A mirror faces the bed',
        explanation: 'A mirror reflecting the bed is said to bounce energy around all night and can startle you in the dark. Move it, put it inside a wardrobe door, or cover it at night.',
        highlight: [outline, { kind: 'ray', from: origin, to: hit.point }], fix,
      });
    } else {
      out.push({
        id: `mirrors.ok.${m.id}`, category: 'mirrors', status: 'good', scoreImpact: 0,
        message: 'A mirror is placed away from the bed',
        explanation: 'This mirror doesn’t reflect the bed.',
        highlight: [outline, { kind: 'ray', from: origin, to: hit.point }],
      });
    }
  }
  return out;
}
