import { resolvedBar, type Combatant, type SkillBar } from "@vibewars/game-core";

/**
 * A player's adrenaline by slot, as an `AdrenalineMessage` lists it (#463):
 * the units its skill holds, 0 for an empty or non-adrenaline slot. A copy
 * standing in a slot (#469) shows its own pool.
 */
export function adrenalineSlots(
  skillBar: SkillBar,
  combatant: Pick<Combatant, "adrenaline" | "cast">,
): number[] {
  return resolvedBar(skillBar, combatant.cast).map((held) =>
    held === null ? 0 : (combatant.adrenaline.get(held.key) ?? 0),
  );
}

/** Whether two adrenaline lists say the same. */
export function sameAdrenaline(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((units, slot) => units === b[slot]);
}
