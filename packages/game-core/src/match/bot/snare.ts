import { statAtTwelve } from "../../skills/scaling.js";
import { getStatusDefinition, type StatusId } from "../../skills/status.js";
import type { Skill, SkillEffect } from "../../skills/types.js";
import { distance } from "../../vec2.js";
import type { Participant } from "../simulation.js";
import { diverOn } from "./peel.js";
import { atElbow } from "./rules/shared.js";

/**
 * The status that slows its bearer which `skill` lays on the foe it is
 * cast at (#4156): Pin Down's and Crippling Shot's Crippled, at any depth
 * of its effects. The first, if it has more than one. `undefined` for a
 * skill that slows nobody, or only its caster.
 */
export function snareStatus(skill: Skill): StatusId | undefined {
  const walk = (effects: readonly SkillEffect[]): StatusId | undefined => {
    for (const effect of effects) {
      if (effect.kind === "if") {
        const inner = walk(effect.effects);
        if (inner !== undefined) {
          return inner;
        }
      } else if (
        effect.kind === "apply-status" &&
        effect.on === undefined &&
        statAtTwelve(getStatusDefinition(effect.statusId).moveSpeedMultiplier) < 1
      ) {
        return effect.statusId;
      }
    }
    return undefined;
  };
  return skill.target === "single-enemy" ? walk(skill.effects) : undefined;
}

/**
 * The foe to cast `skill` at instead of the team's target (#4156): a foe
 * at `self`'s elbow, else the one diving `allies`' backline (`diverOn`),
 * either only without the snare already on it, within `range` of `self`
 * and allowed by `mayCast`. Elbow foes in `foes`' order. `undefined` for a
 * skill that is no snare, or no such foe.
 */
export function snareTarget(
  skill: Skill,
  self: Participant,
  allies: readonly Participant[],
  foes: readonly Participant[],
  range: number,
  mayCast: (foeId: string) => boolean,
): string | undefined {
  const statusId = snareStatus(skill);
  if (statusId === undefined) {
    return undefined;
  }
  const worth = (foe: Participant | undefined): foe is Participant =>
    foe !== undefined &&
    !foe.combatant.dead &&
    !foe.combatant.statuses.has(statusId) &&
    distance(foe.position, self.position) <= range &&
    mayCast(foe.id);
  const elbow = foes.find((foe) => atElbow(self, foe) && worth(foe));
  if (elbow !== undefined) {
    return elbow.id;
  }
  const diver = diverOn(allies, foes);
  return worth(diver) ? diver.id : undefined;
}
