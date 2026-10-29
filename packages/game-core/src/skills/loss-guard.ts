import type { Combatant } from "./types.js";

/**
 * A Guild Lord's guard on the Health it loses (#1223, GW1): while its
 * Bodyguard lives, damage to it is cut by `BODYGUARD_DAMAGE_SCALE`, and
 * in each whole second of match clock it loses at most what its Amulet
 * of Protection lets through, whatever takes it: damage, life stealing,
 * a Deep Wound, degeneration. The simulation refills `remaining` as each
 * second starts.
 */
export interface HealthLossGuard {
  /** The Bodyguard whose life cuts the damage; `undefined` for none. */
  readonly bodyguard: Combatant | undefined;
  /** Health it may still lose this second. */
  remaining: number;
}

/** What damage to a Guild Lord is worth while its Bodyguard lives (GW1: 20% less). */
export const BODYGUARD_DAMAGE_SCALE = 0.8;

/**
 * Of `amount` damage, already mitigated, what `target` takes: the
 * Bodyguard's cut first, then whatever is left of this second's cap,
 * which it spends. `amount` for a body with no guard.
 */
export function guardedDamage(target: Combatant, amount: number): number {
  const guard = target.lossGuard;
  if (guard === undefined) {
    return amount;
  }
  const protectedBy = guard.bodyguard !== undefined && !guard.bodyguard.dead;
  return guardedLoss(target, protectedBy ? Math.round(amount * BODYGUARD_DAMAGE_SCALE) : amount);
}

/**
 * Of `amount` Health lost that is not damage, as life stealing or a Deep
 * Wound's cut, what `target` loses: what is left of this second's cap,
 * in whole points, which it spends.
 */
export function guardedLoss(target: Combatant, amount: number): number {
  const guard = target.lossGuard;
  if (guard === undefined) {
    return amount;
  }
  const allowed = Math.max(0, Math.min(amount, Math.floor(guard.remaining)));
  guard.remaining -= allowed;
  return allowed;
}

/**
 * Of `amount` Health a tick would take, by degeneration or by coming
 * down to the effective maximum, what `target` loses: what is left of
 * this second's cap, to the fraction, which it spends. Never more, so
 * degeneration cannot kill past the cap.
 */
export function guardedDegeneration(target: Combatant, amount: number): number {
  const guard = target.lossGuard;
  if (guard === undefined) {
    return amount;
  }
  const allowed = Math.max(0, Math.min(amount, guard.remaining));
  guard.remaining -= allowed;
  return allowed;
}
