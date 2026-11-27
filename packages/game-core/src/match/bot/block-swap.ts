import { RANGE_SPELL } from "../../distances.js";
import { blockChanceOf } from "../../skills/tick.js";
import type { Skill, Surroundings } from "../../skills/types.js";
import { blowKind, unblockableNow } from "../../skills/weapon-attack.js";
import { distance } from "../../vec2.js";
import type { Participant } from "../simulation.js";

/**
 * At least this chance that its target blocks its blows sends a bot's
 * weapon to another foe (#4204): in GW1 PvP nobody hits into a block stance.
 */
export const BLOCK_SWAP_CHANCE = 0.5;

/**
 * The chance in [0, 1] that `foe` blocks a blow of `self`'s weapon now,
 * a plain swing or shot, or `attackSkill`'s (#4204): 0 while the attack
 * skill cannot be blocked (`unblockableNow`).
 */
export function blockChanceAgainst(
  self: Participant,
  foe: Participant,
  attackSkill: Skill | undefined,
  surroundings: Surroundings,
): number {
  const unblockable = attackSkill?.attack?.unblockable ?? false;
  if (unblockableNow(unblockable, self.combatant, foe.combatant, surroundings)) {
    return 0;
  }
  return blockChanceOf(
    foe.combatant,
    blowKind(self.combatant.equipment.mainHand.weapon),
    attackSkill !== undefined,
    self.combatant.statuses.active,
  );
}

/** Whether `foe` blocks `self`'s blows, as `blockChanceAgainst`, at least `BLOCK_SWAP_CHANCE` of the time. */
export function blocksMe(
  self: Participant,
  foe: Participant,
  attackSkill: Skill | undefined,
  surroundings: Surroundings,
): boolean {
  return blockChanceAgainst(self, foe, attackSkill, surroundings) >= BLOCK_SWAP_CHANCE;
}

/**
 * The foe `self` attacks instead of `target` with its weapon or
 * `attackSkill` while `target` blocks it (#4204, `blocksMe`): `pick`'s
 * choice of `candidates` within `RANGE_SPELL` of `self` that do not.
 * `undefined` while `target` does not block it, or no other foe will do:
 * it hits `target` as before.
 */
export function swapTarget(
  self: Participant,
  target: Participant,
  candidates: readonly Participant[],
  attackSkill: Skill | undefined,
  surroundings: Surroundings,
  pick: (foes: readonly Participant[]) => Participant | undefined,
): Participant | undefined {
  if (!blocksMe(self, target, attackSkill, surroundings)) {
    return undefined;
  }
  return pick(
    candidates.filter(
      (foe) =>
        foe.id !== target.id &&
        distance(foe.position, self.position) <= RANGE_SPELL &&
        !blocksMe(self, foe, attackSkill, surroundings),
    ),
  );
}
