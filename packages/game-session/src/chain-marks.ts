import type { Combatant } from "@vibewars/game-core";
import type { WireChainMark } from "@vibewars/game-protocol";

import { RECHARGE_TOLERANCE_SECONDS } from "./recharge.js";

/** The chain marks `combatant` placed, as a `ChainMarksMessage` lists them (#916). */
export function chainMarks(combatant: Pick<Combatant, "chainMarks">): WireChainMark[] {
  return [...combatant.chainMarks].map(([targetId, mark]) => ({
    targetId,
    role: mark.role,
    remainingSeconds: mark.remainingSeconds,
  }));
}

/**
 * Whether a client that was sent `sent`, `elapsedSeconds` ago, and has
 * counted down since, already shows `now`, as `rechargePredicted` asks of
 * recharges. Anything else is news: a new mark, a new role, a refresh,
 * or one gone early with a death.
 */
export function chainMarksPredicted(
  sent: readonly WireChainMark[],
  elapsedSeconds: number,
  now: readonly WireChainMark[],
): boolean {
  const targets = new Set([...sent, ...now].map(({ targetId }) => targetId));
  for (const targetId of targets) {
    const before = sent.find((mark) => mark.targetId === targetId);
    const after = now.find((mark) => mark.targetId === targetId);
    if (before !== undefined && after !== undefined && before.role !== after.role) {
      return false;
    }
    const predicted = Math.max(0, (before?.remainingSeconds ?? 0) - elapsedSeconds);
    if (Math.abs(predicted - (after?.remainingSeconds ?? 0)) > RECHARGE_TOLERANCE_SECONDS) {
      return false;
    }
  }
  return true;
}
