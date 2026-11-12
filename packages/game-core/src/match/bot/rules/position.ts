import { RANGE_SPELL } from "../../../distances.js";
import { add, distance, normalize, scale, sub, ZERO, type Vec2 } from "../../../vec2.js";
import type { BehaviourIntent, HighGroundSpot } from "../../behaviour.js";
import { feelsHeight, floorOf, heightRange, heightStep } from "../../layer-rules.js";
import type { Participant } from "../../simulation.js";
import { botUses } from "../skill-intent.js";
import {
  atElbow,
  ELBOW_DISTANCE,
  NOTHING,
  POSITION_SLACK,
  RESPOT_DISTANCE,
  WARD_SWITCH,
  THREAT_ANGLES,
  THREAT_MOVE_MIN,
  healthFraction,
  nearestTo,
  reachable,
} from "./shared.js";
import type { BotRule, RuleContext } from "./types.js";

/** A ranged bot holds this share of its reach from its target (#2545). */
const HOLD_REACH = 0.95;

/** A healer stands no farther than this from the ally it looks after (#2545). */
const HEALER_REACH = 0.8 * RANGE_SPELL;

/** And, when it can, at least this far from the nearest foe. */
const HEALER_CLEARANCE = 0.6 * RANGE_SPELL;

/** A climb to the high ground longer than this many reaches is a trek (#3141). */
export const HIGH_GROUND_ROUTE_FACTOR = 2;

/** How many of the least hit high-ground spots a bot walks out the way to (#3141). */
const HIGH_GROUND_ROUTES = 3;

/**
 * Nothing to cast (#2545): a ranged bot walks in no nearer its target
 * than near the edge of its reach; a healer stands behind
 * the ally it looks after, away from the foes. A frontline closes in, as
 * `fight` and `close-in` have it. A spot it could not see its target
 * from is no spot: it walks in, as before.
 *
 * Of its spot turned a little either way about what it watches, it takes
 * the one the fewest foes can hit (#2598): a pillar between a foe and it
 * is cover. At its spot already, it moves only with `THREAT_MOVE_MIN`
 * foes on it, and only to a spot with at least one fewer, so two equal
 * spots never take turns. A healer commits to the spot it chose (#2615).
 *
 * A bow or a spear reaches farther shooting down (#3141): such a bot
 * takes the high ground above its target when no more foes can hit it
 * there than on the spot it would have taken, and walks up by the stairs.
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
    if (spot === undefined) {
      return undefined;
    }
    const target =
      rule.role === "ranged" ? foes.find((foe) => foe.id === rule.targetId) : undefined;
    let best: Candidate | undefined;
    if (spot.point === undefined || distance(spot.point, self.position) <= POSITION_SLACK) {
      const here = threatAt(rule, self.position);
      best =
        here < THREAT_MOVE_MIN
          ? undefined
          : safest(rule, self.position, spot.watched, spot.watchedLayer);
      if (best !== undefined && best.threat > here - 1) {
        best = undefined;
      }
      // Above its target already, it stays up there.
      const high =
        target === undefined || self.layer > target.layer
          ? undefined
          : highGround(rule, target, self.position, best?.threat ?? here);
      if (high !== undefined) {
        return climb(rule, high);
      }
      if (best === undefined) {
        return undefined;
      }
      if (rule.role === "healer") {
        best = { ...best, point: committed(rule, best.point) };
      }
    } else {
      best = safest(rule, spot.point, spot.watched, spot.watchedLayer);
      const high =
        target === undefined
          ? undefined
          : highGround(rule, target, spot.point, best?.threat ?? Number.POSITIVE_INFINITY);
      if (high !== undefined) {
        return climb(rule, high);
      }
      if (best === undefined) {
        return undefined;
      }
      if (rule.role === "healer") {
        best = { ...best, point: committed(rule, best.point) };
      }
      if (distance(best.point, self.position) <= POSITION_SLACK) {
        return undefined;
      }
    }
    rule.cursor.highSpot = undefined;
    const moveTo = reachable(context, best.point);
    return moveTo === undefined ? undefined : { ...NOTHING, targetId: rule.targetId, moveTo };
  },
};

/** The way to `high`, a high-ground spot: none once it stands there. */
function climb(rule: RuleContext, high: HighGroundSpot): BehaviourIntent | undefined {
  const { self } = rule;
  if (self.layer === high.layer && distance(high.point, self.position) <= POSITION_SLACK) {
    return undefined;
  }
  return { ...NOTHING, targetId: rule.targetId, moveTo: high.point, moveToLayer: high.layer };
}

/**
 * A bow or a spear's high ground (#3141): of the spots on a layer above
 * `target`'s within its reach of `anchor`, from which `target` is in its
 * height-stretched reach and in sight, the one the fewest foes can hit,
 * and no more than `threat`; the higher on a tie, then map order. Only
 * the `HIGH_GROUND_ROUTES` least hit are walked out, and one more than
 * `HIGH_GROUND_ROUTE_FACTOR` reaches away is a trek it skips. Kept in
 * the cursor as `committed` keeps a healer's spot.
 */
function highGround(
  rule: RuleContext,
  target: Participant,
  anchor: Vec2,
  threat: number,
): HighGroundSpot | undefined {
  const { context, self, cursor } = rule;
  if (
    context.highGround.length === 0 ||
    !feelsHeight(self.combatant.equipment.mainHand.weapon.id)
  ) {
    return undefined;
  }
  const shortest = reach(self, rule.bar);
  const picks: { readonly spot: HighGroundSpot; readonly threat: number }[] = [];
  for (const spot of context.highGround) {
    if (spot.layer <= target.layer || distance(spot.point, anchor) > shortest) {
      continue;
    }
    const step = heightStep(floorOf(spot.layer), spot.layer, target.floors, target.layer);
    if (
      distance(spot.point, target.position) > heightRange(shortest, step) ||
      !context.seesBetween(spot.point, target.position, spot.layer, target.layer)
    ) {
      continue;
    }
    const hit = threatAt(rule, spot.point, spot.layer);
    if (hit <= threat) {
      picks.push({ spot, threat: hit });
    }
  }
  picks.sort((a, b) => a.threat - b.threat || b.spot.layer - a.spot.layer);
  for (const { spot } of picks.slice(0, HIGH_GROUND_ROUTES)) {
    if (context.routeLength(spot.point, spot.layer) <= HIGH_GROUND_ROUTE_FACTOR * shortest) {
      const kept = cursor.highSpot;
      cursor.highSpot =
        kept?.layer === spot.layer
          ? { point: keptSpot(kept.point, spot.point, rule.foes), layer: spot.layer }
          : spot;
      return cursor.highSpot;
    }
  }
  cursor.highSpot = undefined;
  return undefined;
}

interface Spot {
  /** Where to stand; `undefined`: where it stands does. */
  readonly point: Vec2 | undefined;
  /** What it must see from there. */
  readonly watched: Vec2;
  /** The layer `watched` is on (ADR-0051). */
  readonly watchedLayer: number;
}

interface Candidate {
  readonly point: Vec2;
  /** How many foes can hit it there. */
  readonly threat: number;
}

/**
 * Of `point` turned by each of `THREAT_ANGLES` about `watched`, the one
 * the fewest foes can hit, first in that order on a tie. One it could
 * not see `watched` from, or stand on, is none; none left: `undefined`.
 */
function safest(
  rule: RuleContext,
  point: Vec2,
  watched: Vec2,
  watchedLayer: number,
): Candidate | undefined {
  const { context } = rule;
  let best: Candidate | undefined;
  for (const degrees of THREAT_ANGLES) {
    const candidate = turned(point, watched, degrees);
    if (
      !context.walkable(candidate) ||
      !context.seesBetween(candidate, watched, context.self.layer, watchedLayer)
    ) {
      continue;
    }
    const threat = threatAt(rule, candidate);
    if (best === undefined || threat < best.threat) {
      best = { point: candidate, threat };
    }
  }
  return best;
}

/** `point` turned `degrees` about `about`, the left way for a positive turn. */
function turned(point: Vec2, about: Vec2, degrees: number): Vec2 {
  if (degrees === 0) {
    return point;
  }
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = point.x - about.x;
  const dy = point.y - about.y;
  return { x: about.x + dx * cos - dy * sin, y: about.y + dx * sin + dy * cos };
}

/**
 * How many living foes with a bar could hit `point` on `layer` (#2598): within
 * their reach and `POSITION_SLACK`, and seeing it. Range first, so a foe
 * out of it costs no line-of-sight ray.
 */
function threatAt(rule: RuleContext, point: Vec2, layer = rule.context.self.layer): number {
  let threat = 0;
  for (const foe of rule.foes) {
    if (foe.combatant.dead || foe.skillBar.every((id) => id === null)) {
      continue;
    }
    if (distance(foe.position, point) > rule.foeReach(foe) + POSITION_SLACK) {
      continue;
    }
    if (rule.context.seesBetween(foe.position, point, foe.layer, layer)) {
      threat += 1;
    }
  }
  return threat;
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
  // A bow or a spear reaches as far as its height over the target lets it (#3141).
  const shortest = feelsHeight(self.combatant.equipment.mainHand.weapon.id)
    ? heightRange(
        reach(self, bar),
        heightStep(self.floors, self.layer, target.floors, target.layer),
      )
    : reach(self, bar);
  const back = normalize(sub(self.position, target.position));
  if (back === ZERO) {
    return undefined;
  }
  if (distance(self.position, target.position) <= shortest) {
    return { point: undefined, watched: target.position, watchedLayer: target.layer };
  }
  const hold = HOLD_REACH * shortest;
  return {
    point: add(target.position, scale(back, hold)),
    watched: target.position,
    watchedLayer: target.layer,
  };
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
 * It keeps its ward in `cursor` (#2615), and `position` the spot it
 * chose from this one, so a hit traded or a foe's step does not turn it
 * round: see `keptWard` and `committed`.
 */
function coverSpot({ self, allies, foes, foeCentroid, cursor }: RuleContext): Spot | undefined {
  if (foeCentroid === undefined || foes.length === 0) {
    return undefined;
  }
  const ward = keptWard(
    cursor.wardId,
    allies.filter((ally) => ally.id !== self.id),
    foeCentroid,
  );
  if (ward?.id !== cursor.wardId) {
    cursor.wardId = ward?.id;
    cursor.coverSpot = undefined;
  }
  if (ward === undefined) {
    return undefined;
  }
  const near = nearestTo(self.position, foes);
  if (
    distance(ward.position, self.position) <= HEALER_REACH &&
    (near === undefined || distance(near.position, self.position) > ELBOW_DISTANCE)
  ) {
    cursor.coverSpot = undefined;
    return { point: undefined, watched: ward.position, watchedLayer: ward.layer };
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
  return { point, watched: ward.position, watchedLayer: ward.layer };
}

/**
 * A healer's spot once `position` chose it, cover or threat move (#2615):
 * the one it committed to, kept by `keptSpot` against `fresh`.
 */
function committed({ cursor, foes }: RuleContext, fresh: Vec2): Vec2 {
  cursor.coverSpot = keptSpot(cursor.coverSpot, fresh, foes);
  return cursor.coverSpot;
}

/**
 * The ally a healer keeps looking after: `wardId` while it is among
 * `others`, unless `lookedAfter`'s pick is `WARD_SWITCH` more hurt.
 */
function keptWard(
  wardId: string | undefined,
  others: readonly Participant[],
  foeCentroid: Vec2,
): Participant | undefined {
  const fresh = lookedAfter(others, foeCentroid);
  const kept = others.find((ally) => ally.id === wardId);
  if (kept === undefined || fresh === undefined) {
    return fresh;
  }
  return healthFraction(fresh) <= healthFraction(kept) - WARD_SWITCH ? fresh : kept;
}

/**
 * The spot a healer keeps walking to: `kept`, unless `fresh` lies more
 * than `RESPOT_DISTANCE` from it or a foe stands at its elbow there.
 */
export function keptSpot(kept: Vec2 | undefined, fresh: Vec2, foes: readonly Participant[]): Vec2 {
  if (
    kept === undefined ||
    distance(fresh, kept) > RESPOT_DISTANCE ||
    foes.some((foe) => distance(foe.position, kept) <= ELBOW_DISTANCE)
  ) {
    return fresh;
  }
  return kept;
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
