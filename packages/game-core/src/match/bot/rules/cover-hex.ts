import { energyCostOf } from "../../../skills/activation.js";
import { getStatusDefinition } from "../../../skills/status.js";
import type { Skill } from "../../../skills/types.js";
import { distance } from "../../../vec2.js";
import type { Participant } from "../../simulation.js";
import { skillsOf } from "./shared.js";

/** A key hex with less than this left is not worth covering (#4279). */
export const COVER_MIN_SECONDS = 3;

/** Each participant's hex skills, in bar order; bars are locked in a match. */
const HEX_SKILLS = new WeakMap<Participant, readonly Skill[]>();

function hexesOf(self: Participant): readonly Skill[] {
  let hexes = HEX_SKILLS.get(self);
  if (hexes === undefined) {
    hexes = skillsOf(self).filter((skill) => skill.type === "hex");
    HEX_SKILLS.set(self, hexes);
  }
  return hexes;
}

/**
 * The hex a bot lays over its important one (#4279), so hex removal,
 * which takes the newest first (`removeByCategory`), takes it instead:
 * its cheapest hex skill as it would cost now (`energyCostOf`), ties to
 * the shorter activation, then bar order. `undefined` with fewer than
 * two hex skills.
 */
export function coverHexOf(self: Participant): Skill | undefined {
  const hexes = hexesOf(self);
  if (hexes.length < 2) {
    return undefined;
  }
  let best: Skill | undefined;
  let bestCost = Number.POSITIVE_INFINITY;
  for (const hex of hexes) {
    const cost = energyCostOf(hex, self.combatant);
    if (
      cost < bestCost ||
      (cost === bestCost && best !== undefined && hex.activationSeconds < best.activationSeconds)
    ) {
      best = hex;
      bestCost = cost;
    }
  }
  return best;
}

/**
 * Whether `foe`'s newest hex is a key hex of `self`'s (#4279): one it put
 * on with another hex skill on its bar that costs more than `cover`, with
 * at least `COVER_MIN_SECONDS` left. Anything newer, whoever cast it,
 * already covers it.
 */
function keyHexOnTop(self: Participant, cover: Skill, foe: Participant): boolean {
  const newest = foe.combatant.statuses.active.findLast(
    (status) => getStatusDefinition(status.id).category === "hex",
  );
  if (
    newest?.sourceId !== self.id ||
    newest.sourceSkillId === cover.id ||
    newest.remainingSeconds < COVER_MIN_SECONDS
  ) {
    return false;
  }
  const key = hexesOf(self).find((hex) => hex.id === newest.sourceSkillId);
  return (
    key !== undefined &&
    energyCostOf(key, self.combatant) > energyCostOf(cover, self.combatant, foe.combatant)
  );
}

/**
 * The foe to lay `cover` on (#4279): the nearest of `foes` within its
 * range of `self` now, whose newest hex is `self`'s key hex
 * (`keyHexOnTop`), allowed by `mayCast`. The bot never walks off to
 * cover. `undefined` for none.
 */
export function coverTarget(
  self: Participant,
  cover: Skill,
  foes: readonly Participant[],
  mayCast: (foeId: string) => boolean,
): Participant | undefined {
  return foes
    .filter(
      (foe) =>
        !foe.combatant.dead &&
        distance(foe.position, self.position) <= cover.range &&
        keyHexOnTop(self, cover, foe) &&
        mayCast(foe.id),
    )
    .sort((a, b) => distance(a.position, self.position) - distance(b.position, self.position))[0];
}
