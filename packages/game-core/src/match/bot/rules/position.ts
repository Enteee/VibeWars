import { RANGE_SPELL } from "../../../distances.js";
import { add, distance, normalize, scale, sub, ZERO, type Vec2 } from "../../../vec2.js";
import type { Participant } from "../../simulation.js";
import { botUses } from "../skill-intent.js";
import {
  KITE_DISTANCE,
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
    // A foe at its elbow is `kite`'s, and resting from a kite it fights.
    if (foes.some((foe) => atElbow(self, foe))) {
      return undefined;
    }
    const spot =
      rule.role === "ranged" ? holdSpot(rule) : rule.role === "healer" ? coverSpot(rule) : undefined;
    if (spot === undefined || distance(spot.point, self.position) <= POSITION_SLACK) {
      return undefined;
    }
    if (!context.seesBetween(spot.point, spot.watched)) {
      return undefined;
    }
    const moveTo = reachable(context, spot.point);
    return moveTo === undefined ? undefined : { ...NOTHING, moveTo };
  },
};

function atElbow(self: Participant, foe: Participant): boolean {
  return foe.creature?.kind !== "spirit" && distance(foe.position, self.position) <= KITE_DISTANCE;
}

interface Spot {
  readonly point: Vec2;
  /** What it must see from there. */
  readonly watched: Vec2;
}

/**
 * A ranged bot's spot: on the line from its target back to it,
 * `HOLD_REACH` of its reach out. Never one farther from its target than
 * it stands: a target on its heels stays there at equal speed, so it
 * stands and fights, and only `kite` steps away.
 */
function holdSpot({ self, bar, foes, targetId }: RuleContext): Spot | undefined {
  const target = foes.find((foe) => foe.id === targetId);
  if (target === undefined) {
    return undefined;
  }
  const hold = HOLD_REACH * reach(self, bar);
  const back = normalize(sub(self.position, target.position));
  if (back === ZERO || distance(self.position, target.position) < hold) {
    return undefined;
  }
  return { point: add(target.position, scale(back, hold)), watched: target.position };
}

/** The longest range among its offence skills, else its weapon's. */
function reach(self: Participant, bar: RuleContext["bar"]): number {
  let longest = 0;
  for (const skill of bar) {
    if (botUses(skill).includes("offence")) {
      longest = Math.max(longest, skill.range);
    }
  }
  return longest > 0 ? longest : self.combatant.equipment.mainHand.weapon.range;
}

/**
 * A healer's spot: behind the ally with the lowest health fraction (all
 * whole, the ally nearest the foes), on the far side from the foes'
 * centroid, as close as keeps it `HEALER_CLEARANCE` off the nearest foe.
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
