import { energyCostOf } from "../../../skills/activation.js";
import { resolveMagnitude } from "../../../skills/scaling.js";
import type { StatusId } from "../../../skills/status.js";
import type { Skill, SkillEffect } from "../../../skills/types.js";
import { distance } from "../../../vec2.js";
import type { BehaviourContext, BehaviourIntent } from "../../behaviour.js";
import type { Participant } from "../../simulation.js";
import { worthPrecasting } from "./precast.js";
import { NOTHING, skillsOf } from "./shared.js";

/** The share of its maximum Energy a bot keeps for the start (#3910). */
export const PREP_ENERGY_FLOOR = 0.5;

/** Seconds a timed buff must still have to run when the match starts (#3910). */
export const PREP_START_MARGIN_SECONDS = 2;

/** A status `skill` puts on the one it is cast on, and for how long: `undefined` while maintained. */
interface Granted {
  readonly statusId: StatusId;
  readonly seconds: number | undefined;
}

/** The statuses `effects` put on the caster or its target, not under a condition. */
function grantedBy(effects: readonly SkillEffect[], self: Participant): Granted[] {
  return effects.flatMap((effect): Granted[] => {
    switch (effect.kind) {
      case "maintain-status":
        return [{ statusId: effect.statusId, seconds: undefined }];
      case "caster-gains-status":
        return [{ statusId: effect.statusId, seconds: effect.durationSeconds }];
      case "apply-status":
        return [
          {
            statusId: effect.statusId,
            seconds: resolveMagnitude(effect.durationSeconds, self.combatant),
          },
        ];
      default:
        return [];
    }
  });
}

/** Whether `self` already has `statusId` on someone: a maintained one goes on one bearer. */
function maintains(context: BehaviourContext, self: Participant, statusId: StatusId): boolean {
  return context.participants.some((bearer) =>
    bearer.combatant.statuses.active.some(
      (status) => status.id === statusId && status.sourceId === self.id,
    ),
  );
}

/**
 * Who `skill` goes on before the start (#3910): the caster for a skill
 * on itself, else the nearest living ally without what it grants, the
 * caster first where it may be; `undefined` with none to go on.
 */
function bearerFor(
  context: BehaviourContext,
  skill: Skill,
  granted: readonly Granted[],
): Participant | undefined {
  const self = context.self;
  const lacks = (body: Participant): boolean =>
    granted.some(({ statusId }) => !body.combatant.statuses.has(statusId));
  if (skill.target === "self") {
    return lacks(self) ? self : undefined;
  }
  const allies = context.participants
    .filter(
      (other) =>
        !other.combatant.dead &&
        other.combatant.team === self.combatant.team &&
        other.creature === undefined &&
        (skill.target !== "single-other-ally" || other.id !== self.id),
    )
    .sort(
      (a, b) =>
        (a.id === self.id ? -1 : distance(a.position, self.position)) -
        (b.id === self.id ? -1 : distance(b.position, self.position)),
    );
  return allies.find(lacks);
}

/**
 * Prepare in the spawn bubble (#3910): a maintained enchantment goes up
 * at once, on one bearer; a timed buff, a stance, a shout, a chant or a
 * timed enchantment, only in the countdown and only while it would run
 * `PREP_START_MARGIN_SECONDS` past the start. Only a skill allowed before
 * the start, and never one that leaves less than `PREP_ENERGY_FLOOR` of
 * its Energy for the start. `secondsLeft` is the countdown's, `null`
 * while it waits for the players.
 */
export function prepare(
  context: BehaviourContext,
  secondsLeft: number | null,
): BehaviourIntent | undefined {
  const self = context.self;
  const { combatant } = self;
  const floor = PREP_ENERGY_FLOOR * combatant.maxEnergy;
  for (const skill of skillsOf(self)) {
    if (
      !worthPrecasting(skill) ||
      skill.cost?.kind === "adrenaline" ||
      combatant.energy - energyCostOf(skill, combatant) < floor
    ) {
      continue;
    }
    const granted = grantedBy(skill.effects, self);
    if (granted.length === 0) {
      continue;
    }
    const maintained = granted.some(({ seconds }) => seconds === undefined);
    if (maintained) {
      if (granted.some(({ statusId }) => maintains(context, self, statusId))) {
        continue;
      }
    } else {
      const shortest = Math.min(...granted.map(({ seconds }) => seconds ?? 0));
      if (secondsLeft === null || secondsLeft > shortest - PREP_START_MARGIN_SECONDS) {
        continue;
      }
    }
    const bearer = bearerFor(context, skill, granted);
    if (bearer !== undefined && context.check(skill.id, bearer.id).ok) {
      return { ...NOTHING, targetId: bearer.id, useSkillId: skill.id };
    }
  }
  return undefined;
}
