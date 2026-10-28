import { resolvedBar, type CastState, type SkillBar } from "@vibewars/game-core";
import type { RechargeMessage } from "@vibewars/game-protocol";

/**
 * How far a recharge may drift from the client's countdown before the
 * server corrects it (#152). A tick is 50 ms, so anything finer would
 * resend on rounding alone.
 */
export const RECHARGE_TOLERANCE_SECONDS = 0.05;

/**
 * A player's running recharges, by slot, and the slots spent until a
 * morale boost (#474), as a `RechargeMessage` lists them; an empty slot
 * has neither. A copy standing in a slot (#469) is that slot's.
 */
export function rechargeState(
  skillBar: SkillBar,
  cast: Pick<CastState, "rechargeRemaining" | "rechargeTotal" | "spent" | "overrides">,
): RechargeMessage {
  const bar = resolvedBar(skillBar, cast);
  const slots = bar.flatMap((held, slot) => {
    if (held === null) {
      return [];
    }
    const remainingSeconds = cast.rechargeRemaining.get(held.key);
    const totalSeconds = cast.rechargeTotal.get(held.key);
    return remainingSeconds === undefined || totalSeconds === undefined
      ? []
      : [{ slot, remainingSeconds, totalSeconds }];
  });
  const spent = bar.flatMap((held, slot) =>
    held !== null && cast.spent.has(held.key) ? [slot] : [],
  );
  return { slots, spent };
}

/**
 * Whether a client that was sent `sent`, `elapsedSeconds` ago, and has
 * counted down since, already shows `now`. Anything else is news: a
 * recharge started, ended early, was reset, or moved by more than the
 * tolerance, or a skill was spent or readied by a morale boost (#474).
 */
export function rechargePredicted(
  sent: RechargeMessage,
  elapsedSeconds: number,
  now: RechargeMessage,
): boolean {
  if (
    sent.spent.length !== now.spent.length ||
    sent.spent.some((slot, index) => now.spent[index] !== slot)
  ) {
    return false;
  }
  const slots = new Set([...sent.slots, ...now.slots].map(({ slot }) => slot));
  for (const slot of slots) {
    const before = sent.slots.find((entry) => entry.slot === slot);
    const after = now.slots.find((entry) => entry.slot === slot);
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
