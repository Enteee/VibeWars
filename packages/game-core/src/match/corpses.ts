/**
 * Corpses (#466): a dead player or training dummy is a corpse where it fell,
 * of either team, fresh until a skill exploits it, once. A creature leaves
 * none (ADR-0035). One "nearest" rule for every skill that wants one, so
 * Soul Feast, wells and minions agree on which body they take.
 */
import { distanceWithinRange } from "../geometry.js";
import type { Combatant } from "../skills/types.js";
import { distance, type Vec2 } from "../vec2.js";
import type { Creature } from "./simulation.js";

export interface CorpseCandidate {
  readonly id: string;
  readonly position: Vec2;
  readonly combatant: Pick<Combatant, "dead">;
  readonly creature: Creature | undefined;
  readonly corpseExploited: boolean;
}

/** Dead, not a creature (it leaves none, ADR-0035), not yet exploited. */
export function isFreshCorpse(body: CorpseCandidate): boolean {
  return body.combatant.dead && body.creature === undefined && !body.corpseExploited;
}

/**
 * The fresh corpse nearest `origin` within `radius` (centre to centre),
 * ties broken by the smaller id; `undefined` for none. No line of sight: a
 * corpse is on the ground.
 */
export function nearestFreshCorpse<Body extends CorpseCandidate>(
  origin: Vec2,
  radius: number,
  bodies: Iterable<Body>,
): Body | undefined {
  let best: Body | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const body of bodies) {
    if (!isFreshCorpse(body) || !distanceWithinRange(origin, body.position, radius)) {
      continue;
    }
    const d = distance(origin, body.position);
    // `<` on the ids, not localeCompare: the same answer in every locale.
    if (d < bestDistance || (d === bestDistance && best !== undefined && body.id < best.id)) {
      best = body;
      bestDistance = d;
    }
  }
  return best;
}
