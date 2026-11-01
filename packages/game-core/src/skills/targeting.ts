import { hasLineOfSight, type Segment } from "../geometry.js";
import { distance, type Vec2 } from "../vec2.js";
import type { Creature } from "../match/simulation.js";
import type { Combatant, Skill } from "./types.js";

/**
 * Who a landed skill hits (ADR-0018).
 *
 * Without an `area`, exactly the primary target, as before areas existed:
 * there is no "area path" and "normal path" to drift apart. With one, the
 * primary first, never filtered again (`canActivate` already accepted
 * it, and re-deriving it would make a target on the rim flicker), then
 * every candidate that is alive, not the caster unless `includesCaster`,
 * on the side `affects` names, within `radius` of the origin and in its
 * line of sight. Those sort by distance from the origin, ties by id, and
 * only then are cut to `maxTargets`.
 *
 * The sort is what keeps this deterministic (ADR-0003): the server
 * iterates a Map and the headless runner an array, and without it the
 * cut would keep different targets in each. Nothing here is random.
 *
 * A party area (#1013) is no radius: the caster first, then every living
 * team-mate by distance from the caster, however far and behind whatever
 * wall. Creatures are not party members: no spirit, minion or pet.
 */

export interface TargetCandidate {
  readonly combatant: Combatant;
  readonly position: Vec2;
  /** `undefined`: a player or a training dummy, not a creature (#1052), so a party member (#474). */
  readonly creature: Creature | undefined;
}

/**
 * How many living spirits, any team's, stand within `radius` of `at`
 * (#1064): what Mend Body and Soul, Spirit Light and Spirit Light Weapon
 * count. Walls do not matter.
 */
export function spiritsWithin(
  candidates: Iterable<TargetCandidate>,
  at: Vec2,
  radius: number,
): number {
  let spirits = 0;
  for (const { combatant, position, creature } of candidates) {
    if (creature?.kind === "spirit" && !combatant.dead && distance(position, at) <= radius) {
      spirits += 1;
    }
  }
  return spirits;
}

/**
 * The living spirit, any team's, nearest `at` within `radius` (#1947):
 * the one Spirit Transfer drains. Ties by id, as `nearestFirst`. None:
 * `undefined`. Walls do not matter.
 */
export function nearestSpiritWithin(
  candidates: Iterable<TargetCandidate>,
  at: Vec2,
  radius: number,
): Combatant | undefined {
  const spirits = [...candidates].filter(
    ({ combatant, position, creature }) =>
      creature?.kind === "spirit" && !combatant.dead && distance(position, at) <= radius,
  );
  return nearestFirst(spirits, at)[0];
}

/**
 * How many living spirits and minions `owner` created stand within
 * `radius` of `at` (#1316): what Signet of Creation counts. A pet is
 * charmed, not created. Walls do not matter.
 */
export function ownCreaturesWithin(
  candidates: Iterable<TargetCandidate>,
  owner: Combatant,
  at: Vec2,
  radius: number,
): number {
  let creatures = 0;
  for (const { combatant, position, creature } of candidates) {
    if (
      (creature?.kind === "spirit" || creature?.kind === "minion") &&
      creature.ownerId === owner.id &&
      !combatant.dead &&
      distance(position, at) <= radius
    ) {
      creatures += 1;
    }
  }
  return creatures;
}

export interface TargetSelection {
  readonly skill: Skill;
  readonly caster: Combatant;
  readonly casterPosition: Vec2;
  /** What the skill was cast at: the caster itself for a self skill. */
  readonly primary: TargetCandidate | undefined;
  /** Everyone who could be caught, in any order. */
  readonly candidates: readonly TargetCandidate[];
  readonly losBlockers: readonly Segment[];
}

export function resolveTargets(selection: TargetSelection): readonly Combatant[] {
  const { skill, caster, primary } = selection;
  const area = skill.area;
  if (area === undefined) {
    return primary === undefined ? [] : [primary.combatant];
  }
  if (area.origin === "party") {
    const team = selection.candidates.filter(
      ({ combatant, creature }) =>
        creature === undefined &&
        !combatant.dead &&
        combatant.team === caster.team &&
        combatant.id !== caster.id,
    );
    return [caster, ...nearestFirst(team, selection.casterPosition)];
  }

  const origin = area.origin === "caster" ? selection.casterPosition : primary?.position;
  if (origin === undefined) {
    return [];
  }
  // A self skill's primary is its caster, who is in their own area only
  // when the area says so.
  const first =
    primary === undefined || (primary.combatant.id === caster.id && !area.includesCaster)
      ? []
      : [primary.combatant];

  const caught = selection.candidates.filter(({ combatant, position }) => {
    if (combatant.dead || combatant.id === primary?.combatant.id) {
      return false;
    }
    if (combatant.id === caster.id && !area.includesCaster) {
      return false;
    }
    const ally = combatant.team === caster.team;
    if ((area.affects === "enemies" && ally) || (area.affects === "allies" && !ally)) {
      return false;
    }
    return (
      distance(position, origin) <= area.radius &&
      hasLineOfSight(origin, position, selection.losBlockers)
    );
  });

  const all = [...first, ...nearestFirst(caught, origin)];
  return area.maxTargets === undefined ? all : all.slice(0, area.maxTargets);
}

/**
 * `candidates` by distance from `origin`, ties by id: the one order every
 * cut to "at most N" uses, an area's and a scythe's cleave alike.
 */
export function nearestFirst(
  candidates: readonly TargetCandidate[],
  origin: Vec2,
): readonly Combatant[] {
  return candidates
    .map((candidate) => ({ ...candidate, away: distance(candidate.position, origin) }))
    .sort(
      (a, b) =>
        a.away - b.away ||
        (a.combatant.id < b.combatant.id ? -1 : a.combatant.id > b.combatant.id ? 1 : 0),
    )
    .map(({ combatant }) => combatant);
}
