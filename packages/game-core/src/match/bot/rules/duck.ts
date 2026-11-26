import { RANGE_SPELL } from "../../../distances.js";
import { distance, dot, sub } from "../../../vec2.js";
import type { BehaviourCursor, BehaviourIntent, HighGroundSpot } from "../../behaviour.js";
import type { Participant } from "../../simulation.js";
import { harmfulZonesHolding } from "../../zones.js";
import { botUses, type BotUse } from "../skill-intent.js";
import { NOTHING, POSITION_SLACK, healthFraction, nearJammedGoal } from "./shared.js";
import type { BotRule, RuleContext } from "./types.js";

/** A bot this many foes target is focused (#3369). */
export const DUCK_FOES = 2;

/** Below this health a bot whose health falls fast is focused too (#3369). */
export const DUCK_FALLING_BELOW = 0.5;

/** How much health it must have lost in `HEALTH_MARK_SECONDS` to be falling fast (#3369). */
export const DUCK_FALLING_LOSS = 0.15;

/** How long a bot remembers its health for (#3369). */
export const HEALTH_MARK_SECONDS = 2;

/** How far from the bot a cover spot may be (#3369). */
export const DUCK_REACH = 220;

/** How much longer than the straight line the walk to a cover spot may be (#3369). */
export const DUCK_ROUTE_FACTOR = 1.6;

/** The longest a bot stays ducked (#3369). */
export const DUCK_SECONDS = 3;

/** How long after a duck it may not duck again (#3369), so it never ping-pongs. */
export const DUCK_COOLDOWN = 4;

/** A ducked bot healed above this, and above where it ducked at, comes back out (#3369). */
export const DUCK_HEALED = 0.7;

/** How much nearer a ducking bot must get by each think, in units of walk, or it gives up (#3369). */
export const DUCK_PROGRESS = 5;

/** How many of the nearest spots one decision looks at, and how many it prices a walk to. */
const DUCK_CANDIDATES = 12;
const DUCK_ROUTES = 3;

/** What a ducked bot may still cast on itself: nothing that needs its target in sight. */
const DUCKED_USES: readonly BotUse[] = ["healing", "defence"];

/**
 * Focused, out of its foes' sight (#3369): a bot `DUCK_FOES` foes
 * target, or one below `DUCK_FALLING_BELOW` losing health fast, walks to
 * the nearest cover none of those foes sees, and waits there for
 * `DUCK_SECONDS` at most, casting only on itself. Not a frontliner in
 * reach of its target, whose blows need it out in the open. A duck ends
 * once it is no longer focused, is healed above `DUCK_HEALED` and above
 * where it ducked at, or its team calls a foe it cannot hit from there;
 * then `DUCK_COOLDOWN` passes before the next. A spot a hunter has walked
 * round to see is no cover: it picks again, cooldown or not.
 */
const duck: BotRule = {
  order: 36.5,
  name: "duck",
  decide: (rule) => {
    const { context, cursor } = rule;
    if (rule.role === undefined) {
      return undefined;
    }
    const now = context.now;
    const ducked = cursor.duck;
    if (ducked !== undefined) {
      if (exposed(rule, ducked.spot)) {
        cursor.duck = undefined;
        return undefined;
      }
      const left = arrived(rule, ducked.spot)
        ? 0
        : context.routeLength(ducked.spot.point, ducked.spot.layer);
      // No nearer than at its last think: something the route did not
      // know of holds it, and standing at a wall is no cover.
      if (over(rule, ducked) || (left > 0 && left >= ducked.left - DUCK_PROGRESS)) {
        cursor.duck = undefined;
        cursor.duckReadyAt = now + DUCK_COOLDOWN;
        return undefined;
      }
      cursor.duck = { ...ducked, left };
      return hide(rule, ducked.spot);
    }
    if (now < cursor.duckReadyAt || !focused(rule) || striking(rule)) {
      return undefined;
    }
    const found = cover(rule);
    if (found === undefined) {
      return undefined;
    }
    cursor.duck = { ...found, since: now, health: healthFraction(rule.self) };
    return hide(rule, found.spot);
  },
};

/** Note `health` at match second `now`, and forget what is older than `HEALTH_MARK_SECONDS` (#3369). */
export function markHealth(cursor: BehaviourCursor, now: number, health: number): void {
  const marks = cursor.healthMarks;
  marks.push({ at: now, health });
  while (marks.length > 0 && (marks[0]?.at ?? now) < now - HEALTH_MARK_SECONDS) {
    marks.shift();
  }
}

/**
 * The foes on the bot: targeting it, attacking it or casting at it. A
 * bot's target comes and goes between its thinks; its blows and its
 * casts are what hurt.
 */
function hunters({ self, foes }: RuleContext): Participant[] {
  return foes.filter(
    (foe) =>
      foe.targetId === self.id ||
      foe.combatant.attack?.targetId === self.id ||
      foe.pendingSkill?.targetId === self.id ||
      foe.combatant.cast.activeCast?.targetId === self.id,
  );
}

/** Whether the bot is focused: `DUCK_FOES` foes on it, or low and falling fast. */
function focused(rule: RuleContext): boolean {
  if (hunters(rule).length >= DUCK_FOES) {
    return true;
  }
  const health = healthFraction(rule.self);
  const highest = Math.max(health, ...rule.cursor.healthMarks.map((mark) => mark.health));
  return health < DUCK_FALLING_BELOW && highest - health >= DUCK_FALLING_LOSS;
}

/** A frontliner in its own reach of its target: it fights, it does not hide. */
function striking(rule: RuleContext): boolean {
  const { self, foes, targetId } = rule;
  if (rule.role !== "frontline") {
    return false;
  }
  const target = foes.find((foe) => foe.id === targetId);
  return (
    target !== undefined &&
    distance(target.position, self.position) <= rule.foeReach(self) + POSITION_SLACK
  );
}

/** Who the bot hides from: the foes that target it, or with none, every foe that reaches it. */
function watchers(rule: RuleContext): Participant[] {
  const on = hunters(rule);
  return on.length > 0
    ? on
    : rule.foes.filter(
        (foe) => distance(foe.position, rule.self.position) <= rule.foeReach(foe) + POSITION_SLACK,
      );
}

/** Whether a foe that targets the bot sees `spot`. */
function exposed(rule: RuleContext, spot: HighGroundSpot): boolean {
  return hunters(rule).some((foe) =>
    rule.context.seesBetween(foe.position, spot.point, foe.layer, spot.layer),
  );
}

/** A duck under way. */
type Ducked = NonNullable<BehaviourCursor["duck"]>;

/** Whether `ducked` is over. */
function over(rule: RuleContext, { spot, since, health }: Ducked): boolean {
  const { context, foes } = rule;
  if (
    context.now - since >= DUCK_SECONDS ||
    healthFraction(rule.self) > Math.max(DUCK_HEALED, health) ||
    !focused(rule)
  ) {
    return true;
  }
  const called = foes.find((foe) => foe.id === context.calledTargetId);
  return (
    called !== undefined &&
    !context.seesBetween(spot.point, called.position, spot.layer, called.layer)
  );
}

/**
 * The nearest cover none of `watchers` sees, among the high ground and
 * `context.cover` within `DUCK_REACH` on the bot's layer or the next:
 * never in harmful ground, never past its foes' centre, and a walk there
 * at most `DUCK_ROUTE_FACTOR` the straight line. A healer first takes one
 * it still sees an ally in heal range from. With it, the walk there;
 * none: `undefined`.
 */
function cover(
  rule: RuleContext,
): { readonly spot: HighGroundSpot; readonly left: number } | undefined {
  const { context, self, foeCentroid } = rule;
  const toFoes = foeCentroid === undefined ? undefined : sub(foeCentroid, self.position);
  const near = [...context.highGround, ...context.cover]
    .filter(
      (spot) =>
        Math.abs(spot.layer - self.layer) <= 1 &&
        distance(spot.point, self.position) <= DUCK_REACH &&
        (toFoes === undefined ||
          dot(sub(spot.point, self.position), toFoes) <= dot(toFoes, toFoes)) &&
        harmfulZonesHolding(context.objectives.harmfulZones, spot.point, spot.layer).length === 0 &&
        !nearJammedGoal(context, spot.point, spot.layer),
    )
    .sort((a, b) => distance(a.point, self.position) - distance(b.point, self.position))
    .slice(0, DUCK_CANDIDATES);
  const from = watchers(rule);
  const hidden = near.filter((spot) =>
    from.every((foe) => !context.seesBetween(foe.position, spot.point, foe.layer, spot.layer)),
  );
  const picks = rule.role === "healer" ? healerFirst(rule, hidden) : hidden;
  for (const spot of picks.slice(0, DUCK_ROUTES)) {
    const left = context.routeLength(spot.point, spot.layer);
    if (left <= DUCK_ROUTE_FACTOR * distance(spot.point, self.position)) {
      return { spot, left };
    }
  }
  return undefined;
}

/** `spots`, those a healer still sees an ally in heal range from first, in order otherwise. */
function healerFirst(rule: RuleContext, spots: readonly HighGroundSpot[]): HighGroundSpot[] {
  const { context, self, allies } = rule;
  const watches = (spot: HighGroundSpot) =>
    allies.some(
      (ally) =>
        ally.id !== self.id &&
        !ally.combatant.dead &&
        distance(ally.position, spot.point) <= RANGE_SPELL &&
        context.seesBetween(spot.point, ally.position, spot.layer, ally.layer),
    );
  return [...spots.filter(watches), ...spots.filter((spot) => !watches(spot))];
}

/** Whether the bot stands at `spot`, give or take `POSITION_SLACK`. */
function arrived({ self }: RuleContext, spot: HighGroundSpot): boolean {
  return self.layer === spot.layer && distance(self.position, spot.point) <= POSITION_SLACK;
}

/** Walk to `spot`; there, cast on itself what it can, else wait. */
function hide(rule: RuleContext, spot: HighGroundSpot): BehaviourIntent {
  const { self, targetId } = rule;
  if (!arrived(rule, spot)) {
    return { ...NOTHING, targetId, moveTo: spot.point, moveToLayer: spot.layer };
  }
  for (const skill of rule.bar) {
    if (
      botUses(skill).some((use) => DUCKED_USES.includes(use)) &&
      rule.context.check(skill.id, self.id).ok &&
      rule.mayUse(skill, self.id)
    ) {
      return rule.use(skill, self.id);
    }
  }
  return { ...NOTHING, targetId };
}

export default duck;
