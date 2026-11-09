import { AREA_EARSHOT } from "../distances.js";
import type { SimulationRng } from "../rng.js";
import type { CombatRules } from "../ruleset.js";
import { applyDamage, type CombatEvent } from "../skills/effects.js";
import { hitLocationOf, mitigate, skillDamage, type DamagePacket } from "../skills/damage.js";
import type { Combatant, Surroundings } from "../skills/types.js";

/**
 * Barrow Field's Storm Beacon (#2694, GW1's lightning Obelisk Flag
 * Stand): the team whose flag is on its stand owns it, and every
 * `BEACON_STRIKE_SECONDS` it strikes one random foe within earshot,
 * until another team takes the stand.
 *
 * Pure, as `flags.ts` is: `flags.ts` decides who holds the stand and
 * the simulation picks the foe; this keeps the beat and lands the blow.
 */

/** How often an owned beacon strikes (GW1: every 2.5 seconds). */
export const BEACON_STRIKE_SECONDS = 2.5;
/** Beacon Lightning's damage (GW1's Obelisk Lightning: 50 lightning). */
export const BEACON_LIGHTNING_DAMAGE = 50;
/** How far from the beacon a foe can be struck (GW1: earshot). */
export const BEACON_STRIKE_RADIUS = AREA_EARSHOT;

/**
 * A strike's `area` in the combat log: the beacon, which is where its
 * bolt starts. Nothing draws the radius, so it is not the strike's reach,
 * which is wider than the wire allows an area to be.
 */
export function beaconStrikeArea(beacon: { readonly x: number; readonly y: number }): {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
} {
  return { x: beacon.x, y: beacon.y, radius: 1 };
}

/** Whose beacon it is, and how long since it was taken or last struck. */
export interface BeaconState {
  readonly owner: number | undefined;
  readonly chargedSeconds: number;
}

/** Nobody owns it at the start. */
export const UNOWNED_BEACON: BeaconState = { owner: undefined, chargedSeconds: 0 };

export interface BeaconStep {
  readonly state: BeaconState;
  /** Whether the owner's beacon strikes this tick. */
  readonly strikes: boolean;
}

/** Within a hair, as the flag stand's: fifty 0.05 s ticks fall just short. */
const BEAT_EPSILON = 1e-6;

/**
 * One tick of the beacon, given who holds the stand after this tick's
 * flags. A new owner starts from 0, so its first strike comes a full
 * beat after the taking.
 */
export function stepBeacon(state: BeaconState, holder: number | undefined, dt: number): BeaconStep {
  if (holder !== state.owner || holder === undefined) {
    return { state: { owner: holder, chargedSeconds: 0 }, strikes: false };
  }
  const chargedSeconds = state.chargedSeconds + dt;
  return chargedSeconds < BEACON_STRIKE_SECONDS - BEAT_EPSILON
    ? { state: { owner: holder, chargedSeconds }, strikes: false }
    : { state: { owner: holder, chargedSeconds: 0 }, strikes: true };
}

export interface BeaconLightningContext {
  readonly rng: SimulationRng;
  readonly rules: CombatRules;
  readonly surroundings: Surroundings;
}

/** Beacon Lightning on `target`: a spell from nobody, so armor counts and no foe is credited. */
export function beaconLightning(
  target: Combatant,
  { rng, rules, surroundings }: BeaconLightningContext,
): CombatEvent[] {
  const packet: DamagePacket = {
    ...skillDamage(BEACON_LIGHTNING_DAMAGE, "lightning", 0),
    spell: true,
  };
  const events: CombatEvent[] = [];
  const dealt = mitigate(packet, target, rules, hitLocationOf(packet, rng), rng, surroundings);
  applyDamage(target, dealt, packet.type, false, events, undefined);
  return events;
}
