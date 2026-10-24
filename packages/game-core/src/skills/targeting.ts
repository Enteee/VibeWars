import { hasLineOfSight, type Segment } from "../geometry.js";
import { distance, type Vec2 } from "../vec2.js";
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
 */

export interface TargetCandidate {
  readonly combatant: Combatant;
  readonly position: Vec2;
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

  const caught = selection.candidates
    .filter(({ combatant, position }) => {
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
    })
    .map((candidate) => ({ ...candidate, away: distance(candidate.position, origin) }))
    .sort(
      (a, b) =>
        a.away - b.away ||
        (a.combatant.id < b.combatant.id ? -1 : a.combatant.id > b.combatant.id ? 1 : 0),
    )
    .map(({ combatant }) => combatant);

  const all = [...first, ...caught];
  return area.maxTargets === undefined ? all : all.slice(0, area.maxTargets);
}
