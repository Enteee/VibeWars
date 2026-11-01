/**
 * Overcast (#461), GW1's exhaustion: maximum energy a spell takes away
 * on top of its cost, recovering over time. The energy equivalent of a
 * Deep Wound. Not a status, so nothing that removes conditions touches it.
 */

import { modWhileHolds } from "./mod-conditions.js";
import { aggregateModifiers } from "./status.js";
import type { Combatant } from "./types.js";

/**
 * Maximum energy with the statuses' bonus (#1464, Mighty Was Vorizun)
 * and the held set's mods' whose condition holds (#2010, Hale and
 * Hearty), before overcast: what the energy bar is drawn against.
 */
export function raisedMaxEnergy(combatant: Combatant): number {
  let bonus = aggregateModifiers(combatant.statuses.active).maxEnergyBonus;
  for (const mod of combatant.equipment.conditionalMaxEnergy) {
    if (modWhileHolds(mod.while, combatant, undefined)) {
      bonus += mod.amount;
    }
  }
  return combatant.maxEnergy + bonus;
}

/**
 * The ceiling energy fills to: maximum energy, raised by statuses (#1464),
 * less overcast. Below 0 when overcast exceeds the maximum, and then
 * nothing fills.
 */
export function effectiveMaxEnergy(combatant: Combatant): number {
  return raisedMaxEnergy(combatant) - combatant.overcast;
}

/**
 * The lowest a floor may push energy to: 0, or where it already is when a
 * weapon swap left it below 0 (ADR-0036, GW1's hidden energy). Nothing
 * that clamps energy takes hidden energy deeper.
 */
export function energyFloor(combatant: Pick<Combatant, "energy">): number {
  return Math.min(0, combatant.energy);
}

/**
 * Overcast `combatant` by `amount`, stacking with what it has. It takes no
 * energy, unless current energy is now above the lowered ceiling, which
 * cuts it to that ceiling, never below 0 (or the hidden energy a swap left).
 */
export function addOvercast(combatant: Combatant, amount: number): void {
  if (amount <= 0) {
    return;
  }
  combatant.overcast += amount;
  combatant.energy = Math.max(
    energyFloor(combatant),
    Math.min(combatant.energy, effectiveMaxEnergy(combatant)),
  );
}

/**
 * Recover `perSecond × dt` overcast, alive or dead, down to 0. It raises
 * the ceiling only: no energy comes back with it.
 */
export function recoverOvercast(combatant: Combatant, perSecond: number, dt: number): void {
  combatant.overcast = Math.max(0, combatant.overcast - perSecond * dt);
}
