import { RANGE_MELEE } from "../../../distances.js";
import { swingIntervalSeconds } from "../../../skills/weapon-attack.js";
import { add, distance, normalize, scale, sub, vec2, type Vec2 } from "../../../vec2.js";
import type { Participant } from "../../simulation.js";
import {
  FINISH_FRACTION,
  healthFraction,
  KITE_SPEED_EDGE,
  KITE_STEP,
  KITE_SWING_WINDOW,
  NOTHING,
} from "./shared.js";
import type { BotRule } from "./types.js";

/** The turns `kite` tries, in order, when straight away is not walkable: ±45°, then ±90°. */
const KITE_TURNS = [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2];

/**
 * A ranged bot or healer with a slowed melee foe at its elbow (#4166)
 * steps `KITE_STEP` away from it between shots, rather than stand to be
 * hit: the foe can't keep up, so it shoots, steps, and shoots again. At
 * equal speed it never kites, because backing off would never end
 * (`position`). Slowed is at most `KITE_SPEED_EDGE` of its own speed.
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
    const attack = self.combatant.attack;
    if (
      attack !== undefined &&
      attack.swingElapsed > KITE_SWING_WINDOW * swingIntervalSeconds(self.combatant)
    ) {
      return undefined;
    }
    const elbow = foes.filter((foe) => onUs(self, foe));
    if (elbow.some((foe) => healthFraction(foe) < FINISH_FRACTION)) {
      return undefined;
    }
    const pace = rule.speedOf(self);
    const slowed = rule.nearestFirst(
      elbow.filter((foe) => rule.speedOf(foe) <= KITE_SPEED_EDGE * pace),
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

export default kite;

/** PROTO */
function onUs(self: Participant, foe: Participant): boolean {
  return (
    foe.creature?.kind !== "spirit" &&
    (foe.targetId === self.id || foe.combatant.attack?.targetId === self.id) &&
    foe.combatant.equipment.mainHand.weapon.range <= RANGE_MELEE &&
    distance(foe.position, self.position) <= 250
  );
}
