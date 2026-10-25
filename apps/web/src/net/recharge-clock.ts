import type { RechargeSlot } from "@vibewars/game-protocol";

import type { SlotRecharge } from "./match-connection.js";

/**
 * Every slot's recharge, `elapsedSeconds` after the server's last
 * `recharge` message (#152). The server only writes when the countdown
 * would be wrong, so between messages the client counts down itself, and
 * the next message always wins. A slot the message did not list is ready.
 */
export function extrapolateRecharges(
  slots: readonly RechargeSlot[],
  slotCount: number,
  elapsedSeconds: number,
): SlotRecharge[] {
  const ready: SlotRecharge = { remaining: 0, total: 0 };
  const bySlot = Array.from({ length: slotCount }, () => ready);
  for (const { slot, remainingSeconds, totalSeconds } of slots) {
    if (slot >= 0 && slot < slotCount) {
      bySlot[slot] = {
        remaining: Math.max(0, remainingSeconds - elapsedSeconds),
        total: totalSeconds,
      };
    }
  }
  return bySlot;
}
