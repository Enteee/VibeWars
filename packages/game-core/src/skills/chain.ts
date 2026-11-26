import type { Combatant, Skill } from "./types.js";

/**
 * GW1's dagger chain (#831): a lead attack that hits leaves the
 * attacker's lead mark on its target, an off-hand attack that hits
 * replaces it with an off-hand mark, and an off-hand attack hits only a
 * target bearing its attacker's lead mark. Each mark is one attacker's
 * on one target: another Assassin's lead opens nothing for you, and
 * switching targets leaves each its own mark.
 *
 * Only a chain attack that lands, expiry or a death changes a mark.
 */

/**
 * How long a mark lasts from the hit that placed it. The sources say 15 s
 * and "about 20 s"; 15 s is the tighter.
 */
export const CHAIN_MARK_SECONDS = 15;

/** Below this a mark has run out: ticks of float seconds never sum exactly. */
const CHAIN_MARK_EPSILON = 1e-9;

/**
 * Whether `skill`'s blow may hit `targetId` now: it is no chain attack,
 * or one that may open a chain, or `attacker`'s mark there is the one it
 * follows. Read as the blow resolves, not as activation starts.
 */
export function chainAllows(attacker: Combatant, skill: Skill, targetId: string): boolean {
  const follows = skill.attack?.chain?.follows;
  return follows === undefined || attacker.chainMarks.get(targetId)?.role === follows;
}

/** A blow of `skill` hit `targetId`: a chain attack leaves its mark there, for the full time. */
export function markChain(attacker: Combatant, skill: Skill, targetId: string): void {
  const chain = skill.attack?.chain;
  if (chain !== undefined) {
    attacker.chainMarks.set(targetId, { role: chain.role, remainingSeconds: CHAIN_MARK_SECONDS });
  }
}

/** Count every mark `attacker` placed down by `dt`; one that runs out goes. */
export function tickChainMarks(attacker: Combatant, dt: number): void {
  for (const [targetId, mark] of attacker.chainMarks) {
    mark.remainingSeconds -= dt;
    if (mark.remainingSeconds <= CHAIN_MARK_EPSILON) {
      attacker.chainMarks.delete(targetId);
    }
  }
}

/** `targetId` died: every mark on it goes, and every mark it placed. */
export function clearChainMarksOn(combatants: Iterable<Combatant>, targetId: string): void {
  for (const combatant of combatants) {
    if (combatant.id === targetId) {
      combatant.chainMarks.clear();
    } else {
      combatant.chainMarks.delete(targetId);
    }
  }
}
