import type { Skill, SkillEffect } from "../../skills/types.js";
import { distance } from "../../vec2.js";
import type { Participant } from "../simulation.js";

/** A clump has to hit at least this many foes to draw an area skill (#4147). */
export const CLUMP_FOES = 3;

/** And this many more than the team's target would. */
export const CLUMP_GAIN = 2;

/**
 * The radius of the foe area `skill` lands centred on the foe it is cast
 * at (#4147): a target-origin area on enemies (Fireball), a splash on
 * foes around its target, or a ground effect left at the target that
 * hits foes. The widest, if it has more than one. `undefined` for a
 * caster-centred area, one on all or on allies, no area at all, or a
 * skill not cast at a foe.
 */
export function targetArea(skill: Skill): number | undefined {
  if (skill.target !== "single-enemy") {
    return undefined;
  }
  const radii: number[] = [];
  const { area } = skill;
  if (area?.origin === "target" && area.affects === "enemies") {
    radii.push(area.radius);
  }
  const walk = (effect: SkillEffect): void => {
    switch (effect.kind) {
      case "if":
        effect.effects.forEach(walk);
        break;
      case "splash":
        if (effect.hits === "foes" && effect.around === undefined) {
          radii.push(effect.radius);
        }
        break;
      case "create-ground-effect": {
        const { act } = effect;
        if (effect.anchor !== "target") {
          break;
        }
        if (act.kind === "aura" && act.aura.affects === "foes") {
          radii.push(act.aura.radius);
        } else if (act.kind === "pulse" && act.pulse.area.affects === "enemies") {
          radii.push(act.pulse.area.radius);
        }
        break;
      }
      default:
        break;
    }
  };
  skill.effects.forEach(walk);
  return radii.length === 0 ? undefined : Math.max(...radii);
}

/**
 * The foe to cast `skill` at instead of `targetId` (#4147): the one with
 * the most of `foes` within its `targetArea`, itself included, of those
 * within `range` of `self` that `mayCast` allows. Only for a clear gain:
 * at least `CLUMP_FOES`, and `CLUMP_GAIN` more than the team's target.
 * Ties to the team's target, then the nearer to `self`, then the lower id.
 */
export function clumpTarget(
  skill: Skill,
  self: Participant,
  foes: readonly Participant[],
  targetId: string,
  range: number,
  mayCast: (foeId: string) => boolean,
): string | undefined {
  const radius = targetArea(skill);
  if (radius === undefined) {
    return undefined;
  }
  const score = (centre: Participant): number =>
    foes.filter((foe) => !foe.combatant.dead && distance(foe.position, centre.position) <= radius)
      .length;
  const target = foes.find((foe) => foe.id === targetId);
  const floor = Math.max(CLUMP_FOES, (target === undefined ? 0 : score(target)) + CLUMP_GAIN);
  let best: Participant | undefined;
  let bestScore = 0;
  let bestAway = 0;
  for (const foe of foes) {
    if (
      foe.id === targetId ||
      foe.combatant.dead ||
      distance(foe.position, self.position) > range ||
      !mayCast(foe.id)
    ) {
      continue;
    }
    const each = score(foe);
    const away = distance(foe.position, self.position);
    if (
      each >= floor &&
      (best === undefined ||
        each > bestScore ||
        (each === bestScore && (away < bestAway || (away === bestAway && foe.id < best.id))))
    ) {
      best = foe;
      bestScore = each;
      bestAway = away;
    }
  }
  return best?.id;
}
