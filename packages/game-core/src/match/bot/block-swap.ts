import { blockChanceOf } from "../../skills/tick.js";
import type { Combatant, Skill, Surroundings } from "../../skills/types.js";
import { blowKind, unblockableNow } from "../../skills/weapon-attack.js";

/**
 * A foe that blocks at least this share of a bot's blows is not worth
 * hitting while another is (#4204): in GW1 PvP an attacker swaps off a
 * block stance and its team's spells keep the pressure on.
 */
export const BLOCK_SWAP_CHANCE = 0.5;

/**
 * The chance in [0, 1] that `foe` blocks `attacker`'s next blow (#4204):
 * of its weapon's kind, from `attackSkill` or, `undefined`, a plain
 * swing. 0 while the attack skill is unblockable now: Pure Strike out of
 * a stance, a hammer blow on a knocked-down foe.
 */
export function blockChanceAgainst(
  attacker: Combatant,
  foe: Combatant,
  attackSkill: Skill | undefined,
  surroundings: Surroundings,
): number {
  const attack = attackSkill?.attack;
  if (attack !== undefined && unblockableNow(attack.unblockable, attacker, foe, surroundings)) {
    return 0;
  }
  return blockChanceOf(
    foe,
    blowKind(attacker.equipment.mainHand.weapon),
    attack !== undefined,
    attacker.statuses.active,
  );
}

/** Whether `foe` blocks at least `BLOCK_SWAP_CHANCE` of `attacker`'s next blow (#4204). */
export function blocksMe(
  attacker: Combatant,
  foe: Combatant,
  attackSkill: Skill | undefined,
  surroundings: Surroundings,
): boolean {
  return blockChanceAgainst(attacker, foe, attackSkill, surroundings) >= BLOCK_SWAP_CHANCE;
}
