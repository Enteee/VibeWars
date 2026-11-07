import { RANGE_SPELL } from "../../../distances.js";
import { add, distance, normalize, scale, sub, ZERO, type Vec2 } from "../../../vec2.js";
import type { Participant } from "../../simulation.js";
import { botUses } from "../skill-intent.js";
import {
  atElbow,
  ELBOW_DISTANCE,
  NOTHING,
  POSITION_SLACK,
  healthFraction,
  nearestTo,
  reachable,
} from "./shared.js";
import type { BotRule, RuleContext } from "./types.js";

/** A ranged bot holds this share of its reach from its target (#2545). */
const HOLD_REACH = 0.8;

/** A healer stands no farther than this from the ally it looks after (#2545). */
const HEALER_REACH = 0.8 * RANGE_SPELL;

/** And, when it can, at least this far from the nearest foe. */
const HEALER_CLEARANCE = 0.6 * RANGE_SPELL;

/**
 * Nothing to cast (#2545): a ranged bot walks in no nearer its target
 * than near the edge of its reach; a healer stands behind
 * the ally it looks after, away from the foes. A frontline closes in, as
 * `fight` and `close-in` have it. A spot it could not see its target
 * from is no spot: it walks in, as before.
 */
const position: BotRule = {
  order: 98,
  name: "position",
  decide: (rule) => {
    const { context, self, foes } = rule;
    // A foe at its elbow: at equal speed, backing off would never end.
    if (foes.some((foe) => atElbow(self, foe))) {
      return undefined;
    }
    const spot =
      rule.role === "ranged"
        ? holdSpot(rule)
        : rule.role === "healer"
          ? coverSpot(rule)
          : undefined;
    if (spot === undefined || distance(spot.point, self.position) <= POSITION_SLACK) {
      return undefined;
    }
    if (!context.seesBetween(spot.point, spot.watched)) {
      return undefined;
    }
    const moveTo = reachable(context, spot.point);
    return moveTo === undefined ? undefined : { ...NOTHING, targetId: rule.targetId, moveTo };
  },
};

interface Spot {
  readonly point: Vec2;
  /** What it must see from there. */
  readonly watched: Vec2;
}

/**
 * A ranged bot's spot, once its target is out of its reach: on the line
 * from its target back to it, `HOLD_REACH` of its reach out. Never one
 * farther from its target than it stands: a target on its heels stays
 * there at equal speed, so it stands and fights.
 */
function holdSpot({ self, bar, foes, targetId }: RuleContext): Spot | undefined {
  const target = foes.find((foe) => foe.id === targetId);
  if (target === undefined) {
    return undefined;
  }
  const shortest = reach(self, bar);
  const back = normalize(sub(self.position, target.position));
  if (back === ZERO || distance(self.position, target.position) <= shortest) {
    return undefined;
  }
  const hold = HOLD_REACH * shortest;
  return { point: add(target.position, scale(back, hold)), watched: target.position };
}

/**
 * The shortest range among its offence skills, so every one of them
 * lands from where it holds; none: its weapon's.
 */
function reach(self: Participant, bar: RuleContext["bar"]): number {
  let shortest = Infinity;
  for (const skill of bar) {
    if (skill.range > 0 && botUses(skill).includes("offence")) {
      shortest = Math.min(shortest, skill.range);
    }
  }
  return shortest < Infinity ? shortest : self.combatant.equipment.mainHand.weapon.range;
}

/**
 * A healer's spot: behind the ally with the lowest health fraction (all
 * whole, the ally nearest the foes), on the far side from the foes'
 * centroid, as close as keeps it `HEALER_CLEARANCE` off the nearest foe.
 * Where it stands already does while that ally is within its reach and
 * no foe within `ELBOW_DISTANCE`: every step is a swing or a cast lost.
 */
function coverSpot({ self, allies, foes, foeCentroid }: RuleContext): Spot | undefined {
  if (foeCentroid === undefined || foes.length === 0) {
    return undefined;
  }
  const ward = lookedAfter(
    allies.filter((ally) => ally.id !== self.id),
    foeCentroid,
  );
  if (ward === undefined) {
    return undefined;
  }
  const near = nearestTo(self.position, foes);
  if (
    distance(ward.position, self.position) <= HEALER_REACH &&
    (near === undefined || distance(near.position, self.position) > ELBOW_DISTANCE)
  ) {
    return undefined;
  }
  const back = normalize(sub(ward.position, foeCentroid));
  if (back === ZERO) {
    return undefined;
  }
  let point = add(ward.position, scale(back, HEALER_REACH));
  for (let away = POSITION_SLACK; away < HEALER_REACH; away += POSITION_SLACK) {
    const nearer = add(ward.position, scale(back, away));
    const foe = nearestTo(nearer, foes);
    if (foe === undefined || distance(foe.position, nearer) >= HEALER_CLEARANCE) {
      point = nearer;
      break;
    }
  }
  return { point, watched: ward.position };
}

/** The ally with the lowest health fraction; all whole, the one nearest `foeCentroid`. */
function lookedAfter(others: readonly Participant[], foeCentroid: Vec2): Participant | undefined {
  let weakest: Participant | undefined;
  for (const ally of others) {
    if (weakest === undefined || healthFraction(ally) < healthFraction(weakest)) {
      weakest = ally;
    }
  }
  if (weakest === undefined || healthFraction(weakest) < 1) {
    return weakest;
  }
  return nearestTo(foeCentroid, others);
}

export default position;
