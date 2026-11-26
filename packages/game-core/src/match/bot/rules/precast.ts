import { findStatusDefinition, type StatusId } from "../../../skills/status.js";
import type {
  Skill,
  SkillEffect,
  SkillType,
  TargetRule,
  UnconditionalEffect,
} from "../../../skills/types.js";

/** The targets of a skill a bot precasts (#3910): the caster or an ally. */
const PRECAST_TARGETS: ReadonlySet<TargetRule> = new Set([
  "self",
  "single-ally",
  "single-other-ally",
]);

/** The skill types a bot never precasts (#3910), whatever their effects. */
const NEVER_PRECAST_TYPES: ReadonlySet<SkillType> = new Set(["attack", "hex", "ward", "well"]);

/**
 * Whether each effect kind keeps to the caster and the ally it is cast on
 * (#3910). `false` for one that harms, takes from or reaches past them:
 * damage, a knockdown or an interrupt, a splash or a spread, a creature
 * or a ground effect, a step, or anything done to a spirit or a corpse.
 */
const KEEPS_TO_ALLIES: Readonly<Record<UnconditionalEffect["kind"], boolean>> = {
  damage: false,
  heal: true,
  "energy-gain": true,
  "energy-refill": true,
  "adrenaline-gain": true,
  "energy-loss": false,
  "energy-steal": false,
  "life-steal": false,
  "steal-from-corpse": false,
  "sacrifice-health": true,
  "lose-health": true,
  "lose-health-to": false,
  "transfer-conditions": false,
  "spread-conditions": false,
  "transfer-conditions-to-area": false,
  "give-health": true,
  "balance-health": true,
  "apply-status": true,
  "apply-random-status": true,
  "maintain-status": true,
  "remove-status": true,
  interrupt: false,
  knockdown: false,
  "shadow-step": false,
  resurrect: false,
  "resurrect-companions": false,
  "drain-own-energy": true,
  overcast: true,
  "caster-gains-status": true,
  "companion-gains-status": true,
  "companion-steps-to-target": false,
  "recharge-faster": true,
  "recharge-reset": true,
  splash: false,
  "pull-to-caster": false,
  "destroy-target-spirit": false,
  "drain-nearest-spirit": false,
  "drain-nearest-spirit-energy": false,
  "destroy-target-minion": false,
  "owner-gains-damage-dealt": false,
  "destroy-allied-spirits": false,
  "destroy-own-spirits": false,
  "recharge-others": true,
  "adrenaline-loss": true,
  "disable-skill": false,
  "copy-removed": false,
  "copy-disabled": false,
  "copy-elite": false,
  "lengthen-recharge": false,
  "disable-own-skills": true,
  "chain-mark": false,
  summon: false,
  "take-control": false,
  "gaze-minion": false,
  "create-ground-effect": false,
};

/** Whether `statusId` is a hex: never precast on anyone. */
function isHex(statusId: StatusId): boolean {
  return findStatusDefinition(statusId)?.category === "hex";
}

/** Whether `effect`, and every effect under it, keeps to the caster and its allies. */
function keepsToAllies(effect: SkillEffect): boolean {
  if (effect.kind === "if") {
    return effect.effects.every(keepsToAllies);
  }
  if (
    (effect.kind === "apply-status" || effect.kind === "maintain-status") &&
    isHex(effect.statusId)
  ) {
    return false;
  }
  return KEEPS_TO_ALLIES[effect.kind];
}

/**
 * Whether a bot precasts `skill` in the spawn bubble (#3910): only on
 * the caster or an ally, never an attack, a hex, a ward or a well, never
 * over an area that reaches foes, and with no effect that harms, takes
 * from or reaches past its allies, or summons. Read from the skill's
 * data alone. The bot's choice, not a game rule: before the start any
 * skill may be used (#3931).
 */
export function worthPrecasting(skill: Skill): boolean {
  const area = skill.area;
  return (
    PRECAST_TARGETS.has(skill.target) &&
    !NEVER_PRECAST_TYPES.has(skill.type) &&
    skill.attack === undefined &&
    skill.petAttack === undefined &&
    skill.projectile === undefined &&
    skill.companion === undefined &&
    (area === undefined || area.origin === "party" || area.affects === "allies") &&
    skill.effects.every(keepsToAllies)
  );
}
