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
 * Give `units` to every adrenaline skill of `combatant` that is not
 * recharging, each capped at what it costs. Gaining any is combat, so it
 * stamps `lastCombatAt` with `atSeconds` (#828).
 */
export function gainUnits(combatant: Combatant, units: number, atSeconds: number): void {
  combatant.lastCombatAt = atSeconds;
  fillPools(combatant, units);
}

/**
 * `gainUnits` without the stamp (#977): what a skill's `adrenaline-gain`
 * does, since an effect does not know the time. The attack skill that
 * carries one has stamped it already, with its blow.
 */
export function fillPools(combatant: Combatant, units: number): void {
  for (const [skillId, held] of combatant.adrenaline) {
    if ((combatant.cast.rechargeRemaining.get(skillId) ?? 0) > 0) {
      continue;
    }
    combatant.adrenaline.set(skillId, Math.min(unitsFor(getSkill(skillId)), held + units));
  }
}

/** Give `strikes` strikes to every adrenaline skill of `combatant`, as `gainUnits`. */
export function gainStrikes(combatant: Combatant, strikes: number, atSeconds: number): void {
  gainUnits(combatant, strikes * ADRENALINE_PER_STRIKE, atSeconds);
}

/** Whether using `skill` loses all adrenaline (#1097), GW1's Hammer Bash. */
export function losesAllAdrenaline(skill: Skill): boolean {
  return skill.cost?.kind === "adrenaline" && skill.cost.losesAll === true;
}

/**
 * Pay for `skill`: its own pool empties, and every other adrenaline skill
 * loses one strike, never below 0. One that loses all adrenaline (#1097)
 * empties every pool.
 */
export function spendAdrenaline(combatant: Combatant, skill: Skill): void {
  if (losesAllAdrenaline(skill)) {
    emptyAdrenaline(combatant);
    return;
  }
  for (const [skillId, units] of combatant.adrenaline) {
    combatant.adrenaline.set(
      skillId,
      skillId === skill.id ? 0 : Math.max(0, units - ADRENALINE_PER_STRIKE),
    );
  }
}

/**
 * Empty `skillId`'s pool, as a disable does (#1097): GW1's disabled skills
 * lose all their adrenaline. Nothing for a skill without one.
 */
export function emptyPool(combatant: Combatant, skillId: string): void {
  if (combatant.adrenaline.has(skillId)) {
    combatant.adrenaline.set(skillId, 0);
  }
}

/** Whether `skill`'s own pool holds its whole cost. */
export function canAffordAdrenaline(combatant: Combatant, skill: Skill): boolean {
  return (combatant.adrenaline.get(skill.id) ?? 0) >= unitsFor(skill);
}

/**
 * Seconds at `atSeconds` until `combatant`'s adrenaline is lost out of
 * combat (#828), never below 0: `null` when every pool is already empty.
 */
export function adrenalineLossIn(
  combatant: Combatant,
  atSeconds: number,
  lossSeconds: number,
): number | null {
  const holds = [...combatant.adrenaline.values()].some((units) => units > 0);
  return holds ? Math.max(0, combatant.lastCombatAt + lossSeconds - atSeconds) : null;
}

/** Empty every adrenaline pool of `combatant`: death, respawn, reset and 25 s out of combat. */
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
