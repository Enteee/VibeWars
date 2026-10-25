import type { CastState } from "@vibewars/game-core";
import type { RechargeSlot } from "@vibewars/game-protocol";

/**
 * How far a recharge may drift from the client's countdown before the
 * server corrects it (#152). A tick is 50 ms, so anything finer would
 * resend on rounding alone.
 */
export const RECHARGE_TOLERANCE_SECONDS = 0.05;

/** A player's running recharges, by slot, as a `RechargeMessage` lists them. */
export function rechargeSlots(
  skillBar: readonly string[],
  cast: Pick<CastState, "rechargeRemaining" | "rechargeTotal">,
): RechargeSlot[] {
  return skillBar.flatMap((skillId, slot) => {
    const remainingSeconds = cast.rechargeRemaining.get(skillId);
    const totalSeconds = cast.rechargeTotal.get(skillId);
    return remainingSeconds === undefined || totalSeconds === undefined
      ? []
      : [{ slot, remainingSeconds, totalSeconds }];
  });
}

/**
 * Whether a client that was sent `sent`, `elapsedSeconds` ago, and has
 * counted down since, already shows `now`. Anything else is news: a
 * recharge started, ended early, was reset, or moved by more than the
 * tolerance.
 */
export function rechargePredicted(
  sent: readonly RechargeSlot[],
  elapsedSeconds: number,
  now: readonly RechargeSlot[],
): boolean {
  const slots = new Set([...sent, ...now].map(({ slot }) => slot));
  for (const slot of slots) {
    const before = sent.find((entry) => entry.slot === slot);
    const after = now.find((entry) => entry.slot === slot);
    if (before !== undefined && after !== undefined && before.totalSeconds !== after.totalSeconds) {
      return false;
    }
    const predicted = Math.max(0, (before?.remainingSeconds ?? 0) - elapsedSeconds);
    if (Math.abs(predicted - (after?.remainingSeconds ?? 0)) > RECHARGE_TOLERANCE_SECONDS) {
      return false;
    }
  }
  return true;
}
