import { swingIntervalSeconds } from "../../../skills/weapon-attack.js";
import { add, normalize, scale, sub, vec2, type Vec2 } from "../../../vec2.js";
import type { Participant } from "../../simulation.js";
import {
  atElbow,
  ELBOW_DISTANCE,
  FINISH_FRACTION,
  healthFraction,
  KITE_SPEED_EDGE,
  KITE_STEP,
  KITE_SWING_WINDOW,
  meleeOn,
  NOTHING,
} from "./shared.js";
import type { BotRule } from "./types.js";

/** The turns `kite` tries, in order, when straight away is not walkable: ±45°, then ±90°. */
const KITE_TURNS = [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2];

/**
 * A ranged bot or healer with a slowed melee foe at its elbow (#4166)
 * steps away from it between shots, rather than stand to be hit, and
 * walks on until the foe is `ELBOW_DISTANCE + KITE_STEP` behind: the foe
 * can't keep up, so it shoots, steps, and shoots again. At equal speed
 * it never kites, because backing off would never end (`position`).
 * Slowed is at most `KITE_SPEED_EDGE` of its own speed.
 *
 * It never cancels a cast (#279), nor a swing past its first
 * `KITE_SWING_WINDOW`, finishes an elbow foe below `FINISH_FRACTION`,
 * and, cornered, fights.
 */
const kite: BotRule = {
  order: 97.7,
  name: "kite",
  decide: (rule) => {
    const { context, self, foes } = rule;
    if (rule.role !== "ranged" && rule.role !== "healer") {
      return undefined;
    }
    if (self.combatant.cast.activeCast !== undefined) {
      return undefined;
    }
    const reach = kiteReach(self);
    const near = foes.filter((foe) => meleeOn(self, foe, reach));
    if (near.some((foe) => atElbow(self, foe) && healthFraction(foe) < FINISH_FRACTION)) {
      return undefined;
    }
    const pace = rule.speedOf(self);
    const slowed = rule.nearestFirst(
      near.filter((foe) => rule.speedOf(foe) <= KITE_SPEED_EDGE * pace),
    )[0];
    if (slowed === undefined) {
      return undefined;
    }
    const moveTo = KITE_TURNS.map((turn) => stepAway(self, slowed, turn)).find((point) =>
      context.walkable(point),
    );
    return moveTo === undefined
      ? undefined
      : { ...NOTHING, targetId: rule.targetId, moveTo, moveToLayer: self.layer };
  },
};

/** `KITE_STEP` from `self`, directly away from `foe` turned by `turn` radians. */
function stepAway(self: Participant, foe: Participant, turn: number): Vec2 {
  const away = normalize(sub(self.position, foe.position));
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const turned = vec2(away.x * cos - away.y * sin, away.x * sin + away.y * cos);
  return add(self.position, scale(turned, KITE_STEP));
}

/**
 * How near a slowed foe makes `self` step. At the elbow, as a shot has
 * just gone off; not at all deep into a swing, which the step would throw
 * away. Not attacking, it walks on to `ELBOW_DISTANCE + KITE_STEP`, so
 * the next swing starts far enough out to land before the foe is back.
 */
function kiteReach(self: Participant): number {
  const { attack } = self.combatant;
  if (attack === undefined) {
    return ELBOW_DISTANCE + KITE_STEP;
  }
  return attack.swingElapsed <= KITE_SWING_WINDOW * swingIntervalSeconds(self.combatant)
    ? ELBOW_DISTANCE
    : 0;
}

export default kite;
