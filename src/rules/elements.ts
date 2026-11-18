/**
 * Rule 6: the five elements and yin/yang (weight 10).
 *
 * Every item has an element (Wood, Fire, Earth, Metal, Water). A balanced
 * room has all five without one taking over. We measure each element's
 * share by count *and* by floor area and average the two, so one huge rug
 * and lots of tiny objects both count.
 *
 * A bedroom should lean yin (quiet, restful); screens and desks add yang.
 */
import { removeById } from '../model/layoutOps';
import { ELEMENTS, type Element } from '../model/types';
import { rectCorners } from '../geometry/rect';
import { ELEMENT_CYCLES, RULES } from './config';
import type { RuleContext } from './context';
import type { RuleResult } from './types';

const C = RULES.elements;

export interface ElementTally {
  count: Record<Element, number>;
  area: Record<Element, number>;
  /** Average of count share and area share, 0..1. */
  share: Record<Element, number>;
}

export function tallyElements(ctx: RuleContext): ElementTally {
  const zero = () => Object.fromEntries(ELEMENTS.map((e) => [e, 0])) as Record<Element, number>;
  const count = zero();
  const area = zero();
  for (const f of ctx.layout.furniture) {
    count[f.element]++;
    area[f.element] += f.width * f.depth;
  }
  const totalCount = ELEMENTS.reduce((s, e) => s + count[e], 0);
  const totalArea = ELEMENTS.reduce((s, e) => s + area[e], 0);
  const share = zero();
  for (const e of ELEMENTS) {
    share[e] = totalCount ? (count[e] / totalCount + area[e] / totalArea) / 2 : 0;
  }
  return { count, area, share };
}

/** The element that restrains `e` in the controlling cycle (e.g. Metal restrains Wood). */
function controllerOf(e: Element): Element {
  return ELEMENTS.find((x) => ELEMENT_CYCLES.controlling[x] === e)!;
}

export function elementsRule(ctx: RuleContext): RuleResult[] {
  const out: RuleResult[] = [];
  const furniture = ctx.layout.furniture;
  if (furniture.length === 0) return out;
  const t = tallyElements(ctx);
  const present = ELEMENTS.filter((e) => t.count[e] > 0);
  const missing = ELEMENTS.filter((e) => t.count[e] === 0);

  if (missing.length === 0) {
    out.push({
      id: 'elements.allFive', category: 'elements', status: 'good', scoreImpact: 0,
      message: 'All five elements are present',
      explanation: 'Wood, Fire, Earth, Metal and Water each have a place in the room: a sign of balance.',
      highlight: [],
    });
  } else if (missing.length >= 2) {
    out.push({
      id: 'elements.missing', category: 'elements', status: 'warn', scoreImpact: C.missingTwoPenalty,
      message: `Missing elements: ${missing.join(', ')}`,
      explanation: `A balanced room has a touch of each element. Ideas: ${missing.map(elementIdea).join('; ')}.`,
      highlight: [],
    });
  } else {
    out.push({
      id: 'elements.missingOne', category: 'elements', status: 'info', scoreImpact: 0,
      message: `Tip: add a touch of ${missing[0]}`,
      explanation: `Four of five elements are here. ${elementIdea(missing[0])} would complete the set.`,
      highlight: [],
    });
  }

  const dominant = ELEMENTS.reduce((a, b) => (t.share[b] > t.share[a] ? b : a));
  if (t.share[dominant] > C.dominantShare) {
    const balancer = controllerOf(dominant);
    out.push({
      id: 'elements.dominant', category: 'elements', status: 'warn', scoreImpact: C.dominantPenalty,
      message: `${dominant} dominates the room (${Math.round(t.share[dominant] * 100)}%)`,
      explanation: `When one element takes over, the room feels one-note. In the controlling cycle ${balancer} tempers ${dominant}: ${elementIdea(balancer)}.`,
      highlight: furniture.filter((f) => f.element === dominant).map((f) => ({ kind: 'outline' as const, points: rectCorners(f) })),
    });
  }

  // A gentle controlling-cycle tip: a strong element sitting with the one it restrains.
  const strong = present.filter((e) => t.share[e] >= 0.3);
  for (const e of strong) {
    const restrained = ELEMENT_CYCLES.controlling[e] as Element;
    if (t.count[restrained] > 0) {
      out.push({
        id: `elements.clash.${e}`, category: 'elements', status: 'info', scoreImpact: 0,
        message: `Tip: lots of ${e} can overpower ${restrained}`,
        explanation: `In the controlling cycle ${e} restrains ${restrained}. Adding ${ELEMENT_CYCLES.productive[e]} (which ${e} feeds) softens the clash.`,
        highlight: [],
      });
      break;
    }
  }

  // Yin and yang.
  const tvs = furniture.filter((f) => f.type === 'tv');
  const desks = furniture.filter((f) => f.type === 'desk');
  for (const tv of tvs) {
    out.push({
      id: `elements.tv.${tv.id}`, category: 'elements', status: 'warn', scoreImpact: C.tvPenalty,
      message: 'A TV adds active (yang) energy to the bedroom',
      explanation: 'Bedrooms should lean yin: calm and restful. Screens keep the mind switched on. Cover it at night or move it to another room.',
      highlight: [{ kind: 'outline', points: rectCorners(tv) }],
      fix: { label: 'Move the TV out of the bedroom', apply: (l) => removeById(l, tv.id) },
    });
  }
  for (const d of desks) {
    out.push({
      id: `elements.desk.${d.id}`, category: 'elements', status: 'warn', scoreImpact: C.deskPenalty,
      message: 'A desk brings work (yang) energy into the bedroom',
      explanation: 'Work and rest mix poorly. If the desk has to stay, clear it at night or screen it from the bed.',
      highlight: [{ kind: 'outline', points: rectCorners(d) }],
    });
  }
  const largePlants = furniture.filter((f) => f.type === 'plant' && f.variant === 'large');
  if (largePlants.length > C.maxLargePlants) {
    out.push({
      id: 'elements.plants', category: 'elements', status: 'warn', scoreImpact: C.tooManyPlantsPenalty,
      message: `${largePlants.length} large plants is a lot for a bedroom`,
      explanation: 'Plants are lively (yang) Wood energy. One or two is lovely; a jungle can feel too active for sleep.',
      highlight: largePlants.map((p) => ({ kind: 'outline' as const, points: rectCorners(p) })),
    });
  }
  if (tvs.length === 0 && desks.length === 0) {
    out.push({
      id: 'elements.yin', category: 'elements', status: 'good', scoreImpact: 0,
      message: 'The room leans yin (restful)',
      explanation: 'No screens or work furniture: a calm room for sleep.',
      highlight: [],
    });
  }
  return out;
}

function elementIdea(e: Element): string {
  return {
    Wood: 'a plant or wooden piece brings Wood',
    Fire: 'a lamp, candle or something red brings Fire',
    Earth: 'a rug, ceramics or earthy tones bring Earth',
    Metal: 'a metal frame, mirror or white/grey accents bring Metal',
    Water: 'a small water feature, glass or wavy shapes bring Water',
  }[e];
}
