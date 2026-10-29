/**
 * King of the Hill's altar (#1377, GW1): a team's Ghostly Hero claims it,
 * and the team that holds it scores a point for every
 * `KOTH_POINT_SECONDS` it keeps it without a break. The holder keeps it
 * while its own ghost is dead, until another team claims it.
 *
 * Pure, as `flags.ts` is: the simulation runs the ghosts' claims through
 * its cast path and says who finished one this tick; this decides who
 * holds the altar and who scored.
 */

/** Held this long without a break, the holder scores a point (spec: GW1 publishes none). */
export const KOTH_POINT_SECONDS = 30;

/** Who holds the altar, and for how long since the claim or the last point. */
export interface AltarState {
  readonly holder: number | null;
  readonly heldSeconds: number;
}

/** Nobody holds it at the start. */
export const UNCLAIMED_ALTAR: AltarState = { holder: null, heldSeconds: 0 };

export interface AltarStep {
  readonly state: AltarState;
  /** The team that scored a point this tick, or `null`. */
  readonly scored: number | null;
}

/** Within a hair, as the flag stand's: six hundred 0.05 s ticks fall just short. */
const HOLD_EPSILON = 1e-6;

/**
 * Whether `team`'s ghost may claim the altar now: nobody holds it, or
 * another team does whose ghost is dead. Never the holder's own.
 */
export function mayClaim(state: AltarState, team: number, holderGhostAlive: boolean): boolean {
  return state.holder === null || (state.holder !== team && !holderGhostAlive);
}

/**
 * The team that takes the altar from the claims finished this tick, or
 * `null`. Two ghosts that finish in the same tick were both allowed, so
 * nobody held it or its holder's ghost was dead: neither takes it, and
 * both begin again on their next tick while the rule still allows it.
 */
export function claimant(finished: readonly number[]): number | null {
  const teams = new Set(finished);
  const [only] = teams;
  return teams.size === 1 && only !== undefined ? only : null;
}

/**
 * One tick of the altar: a claim by `claimedBy` takes it, and its clock
 * starts at 0. Otherwise a holder counts `dt` more, and at
 * `KOTH_POINT_SECONDS` scores and starts again.
 */
export function stepAltar(state: AltarState, dt: number, claimedBy: number | null): AltarStep {
  if (claimedBy !== null) {
    return { state: { holder: claimedBy, heldSeconds: 0 }, scored: null };
  }
  const { holder } = state;
  if (holder === null) {
    return { state, scored: null };
  }
  const heldSeconds = state.heldSeconds + dt;
  if (heldSeconds < KOTH_POINT_SECONDS - HOLD_EPSILON) {
    return { state: { holder, heldSeconds }, scored: null };
  }
  return { state: { holder, heldSeconds: 0 }, scored: holder };
}
