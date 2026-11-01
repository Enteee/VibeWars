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

/**
 * Dead and not yet exploited; a creature only while it has corpses left,
 * a Flesh Golem's (#1836): any other leaves none (ADR-0035).
 */
export function isFreshCorpse(
  body: Pick<CorpseCandidate, "combatant" | "creature" | "corpseExploited">,
): boolean {
  return (
    body.combatant.dead &&
    !body.corpseExploited &&
    (body.creature === undefined || body.creature.corpsesLeft > 0)
  );
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

/**
 * Every fresh corpse within `radius` of `origin` (#1915), nearest first,
 * ties by id, as `nearestFreshCorpse` breaks them.
 */
export function freshCorpsesWithin<Body extends CorpseCandidate>(
  origin: Vec2,
  radius: number,
  bodies: Iterable<Body>,
): Body[] {
  return [...bodies]
    .filter((body) => isFreshCorpse(body) && distanceWithinRange(origin, body.position, radius))
    .sort((a, b) => {
      const d = distance(origin, a.position) - distance(origin, b.position);
      return d !== 0 ? d : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });
}
