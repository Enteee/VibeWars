import type { Combatant } from "./types.js";

/**
 * A Guild Lord's guard on the Health it loses (#1223, GW1): while its
 * Bodyguard lives, damage to it is cut by `BODYGUARD_DAMAGE_SCALE`, and
 * in each whole second of match clock it loses at most what its Amulet
 * of Protection lets through. The simulation refills `remaining` as each
 * second starts and gives back `overflow` then.
 */
export interface HealthLossGuard {
  /** The Bodyguard whose life cuts the damage; `undefined` for none. */
  readonly bodyguard: Combatant | undefined;
  /** Health it may still lose this second. */
  remaining: number;
  /** Degeneration past `remaining` this second: given back as the next starts. */
  overflow: number;
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
 * Of `amount` Health lost that is not damage, as life stealing, what
 * `target` loses: what is left of this second's cap, which it spends.
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
 * `amount` Health `target` lost to degeneration: it spends this second's
 * cap, and what passes it is owed back when the second ends.
 */
export function recordDegeneration(target: Combatant, amount: number): void {
  const guard = target.lossGuard;
  if (guard === undefined) {
    return;
  }
  const allowed = Math.min(amount, guard.remaining);
  guard.remaining -= allowed;
  guard.overflow += amount - allowed;
}
