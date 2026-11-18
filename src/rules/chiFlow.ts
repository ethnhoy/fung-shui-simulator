/**
 * Rule 4: chi flow (weight 20).
 *
 * Geometric check (always runs): is there a straight, unobstructed line from
 * the main door to a window or another door? Chi would rush straight through.
 *
 * Simulation checks (only when settled sim statistics are available):
 * rushing chi around the bed, large stagnant areas, and how much of the floor
 * has healthy sheng chi.
 */
import { createFurniture } from '../model/catalog';
import { segmentHitsPolygon, segmentsIntersect } from '../geometry/raycast';
import { add, scale, sub } from '../geometry/vec';
import { addFurniture } from '../model/layoutOps';
import type { Layout } from '../model/types';
import { pointInFurniture } from '../sim/rasterise';
import { RULES } from './config';
import { doorGeometry, type RuleContext } from './context';
import type { RuleResult } from './types';

const C = RULES.flow;
const pct = (x: number) => `${Math.round(x * 100)}%`;

export function chiFlowRule(ctx: RuleContext): RuleResult[] {
  const out: RuleResult[] = [];
  const door = ctx.mainDoor;

  // --- Straight-line rush from the main door to another opening.
  if (door && door.opening.isOpen) {
    const start = add(door.centre, scale(door.wall.inward, 2));
    for (const o of ctx.layout.openings) {
      if (o.id === door.opening.id || !o.isOpen) continue;
      const g = doorGeometry(ctx.walls, o);
      const end = add(g.centre, scale(g.wall.inward, 2));
      const wallInWay = ctx.walls.some((w) => w.index !== door.wall.index && w.index !== g.wall.index && segmentsIntersect(start, end, w.start, w.end));
      const blocked = ctx.obstacles.some((ob) => segmentHitsPolygon(start, end, ob.poly));
      if (wallInWay || blocked) continue;
      // Suggest a plant 45% of the way along the line.
      const spot = add(start, scale(sub(end, start), 0.45));
      out.push({
        id: `flow.rush.${o.id}`, category: 'flow', status: 'bad', scoreImpact: C.rushPenalty,
        message: `Chi rushes straight from the door to the ${o.kind}`,
        explanation: 'With a clear straight line between the door and another opening, chi races through the room without nourishing it (sha chi). Something in the path slows it into a gentle meander.',
        highlight: [{ kind: 'ray', from: door.centre, to: g.centre }],
        fix: {
          label: 'Place a plant in the path',
          apply: (l: Layout) => addFurniture(l, createFurniture('plant', Math.round(spot.x), Math.round(spot.y), 'large')),
        },
      });
    }
  }

  // --- Simulation-based checks.
  const sim = ctx.sim;
  if (!sim || !sim.settled) {
    out.push({
      id: 'flow.runSim', category: 'flow', status: 'info', scoreImpact: 0,
      message: sim ? 'The chi flow is still settling' : 'Run the simulation for the full chi flow reading',
      explanation: 'Switch to Simulate mode and let the flow settle to include rushing and stagnant chi in the score.',
      highlight: [],
    });
    return out;
  }

  if (sim.bed && sim.bed.sha > C.bedShaWarn) {
    const bad = sim.bed.sha > C.bedShaBad;
    out.push({
      id: 'flow.bedSha', category: 'flow', status: bad ? 'bad' : 'warn',
      scoreImpact: bad ? C.bedShaBadPenalty : C.bedShaWarnPenalty,
      message: `${pct(sim.bed.sha)} of the air around the bed is rushing (sha chi)`,
      explanation: 'Fast-moving chi around where you sleep is unsettling. Slow it with a plant, a screen or furniture between the door and the bed, or move the bed out of the stream.',
      highlight: ctx.bed ? [{ kind: 'outline', points: ctx.bed.poly }] : [],
    });
  }

  const regions = sim.stagnantRegions;
  regions.forEach((r, i) => {
    const centre = r.centroid;
    const free = !ctx.layout.furniture.some((f) => f.type !== 'rug' && pointInFurniture(f, centre, 20));
    out.push({
      id: `flow.stagnant.${i}`, category: 'flow', status: 'warn',
      // Each region costs a little, capped in total (e.g. -5 each, at most -20 → only the first 4 count).
      scoreImpact: i < C.stagnantPenaltyMax / C.stagnantPenaltyEach ? C.stagnantPenaltyEach : 0,
      message: `Stagnant chi${r.inCorner ? ' in a corner' : ''} (${(r.areaCm2 / 10000).toFixed(1)} m²)`,
      explanation: 'Chi that barely moves feels stale. A lamp, a healthy plant, or clearing clutter brings energy back into the area.',
      highlight: [{
        kind: 'outline',
        points: [
          { x: r.bounds.minX, y: r.bounds.minY }, { x: r.bounds.maxX, y: r.bounds.minY },
          { x: r.bounds.maxX, y: r.bounds.maxY }, { x: r.bounds.minX, y: r.bounds.maxY },
        ],
      }],
      fix: free
        ? { label: 'Add a lamp here', apply: (l: Layout) => addFurniture(l, createFurniture('lamp', Math.round(centre.x), Math.round(centre.y))) }
        : undefined,
    });
  });

  const sheng = sim.floor.sheng;
  if (sheng >= C.shengGood) {
    out.push({
      id: 'flow.healthy', category: 'flow', status: 'good', scoreImpact: 0,
      message: `Most of the floor has healthy, meandering chi (${pct(sheng)})`,
      explanation: 'Sheng chi, gentle and curving, is what feng shui aims for.',
      highlight: [],
    });
  } else if (sheng < C.shengLow) {
    out.push({
      id: 'flow.lowSheng', category: 'flow', status: 'warn', scoreImpact: C.shengLowPenalty,
      message: `Only ${pct(sheng)} of the floor has healthy chi`,
      explanation: 'Most of the room is either rushing or stagnant. Soften straight paths and open up still corners.',
      highlight: [],
    });
  }
  return out;
}
