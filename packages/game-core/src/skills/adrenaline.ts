/**
 * Per-skill adrenaline (#463), as GW1 has it: each adrenaline skill on the
 * bar fills on its own pool of units, a landed blow gives every one of
 * them a strike, and using one empties it and drains a strike from the
 * rest.
 */

import type { SkillBar } from "../build.js";
import { ADRENALINE_PER_STRIKE } from "../ruleset.js";
import { getSkill } from "./catalog.js";
import type { Combatant, Skill } from "./types.js";

/** The units `skill` needs, and the most its pool holds: 0 for any other cost. */
function unitsFor(skill: Skill | undefined): number {
  return skill?.cost?.kind === "adrenaline" ? skill.cost.amount * ADRENALINE_PER_STRIKE : 0;
}

/**
 * Give `strikes` strikes to every adrenaline skill of `combatant` that is
 * not recharging, each capped at what it costs.
 */
export function gainStrikes(combatant: Combatant, strikes: number): void {
  for (const [skillId, units] of combatant.adrenaline) {
    if ((combatant.cast.rechargeRemaining.get(skillId) ?? 0) > 0) {
      continue;
    }
    combatant.adrenaline.set(
      skillId,
      Math.min(unitsFor(getSkill(skillId)), units + strikes * ADRENALINE_PER_STRIKE),
    );
  }
}

/**
 * Pay for `skill`: its own pool empties, and every other adrenaline skill
 * loses one strike, never below 0.
 */
export function spendAdrenaline(combatant: Combatant, skill: Skill): void {
  for (const [skillId, units] of combatant.adrenaline) {
    combatant.adrenaline.set(
      skillId,
      skillId === skill.id ? 0 : Math.max(0, units - ADRENALINE_PER_STRIKE),
    );
  }
}

/** Whether `skill`'s own pool holds its whole cost. */
export function canAffordAdrenaline(combatant: Combatant, skill: Skill): boolean {
  return (combatant.adrenaline.get(skill.id) ?? 0) >= unitsFor(skill);
}

/** Empty every adrenaline pool of `combatant`: death, respawn and reset. */
export function emptyAdrenaline(combatant: Combatant): void {
  for (const skillId of combatant.adrenaline.keys()) {
    combatant.adrenaline.set(skillId, 0);
  }
}

/**
 * The pools a combatant with `skillBar` starts with: one at 0 for each of
 * its adrenaline skills, and none for anything else.
 */
export function adrenalinePools(skillBar: SkillBar): Map<string, number> {
  const pools = new Map<string, number>();
  for (const skillId of skillBar) {
    if (skillId !== null && getSkill(skillId)?.cost?.kind === "adrenaline") {
      pools.set(skillId, 0);
    }
  }
  return pools;
}
