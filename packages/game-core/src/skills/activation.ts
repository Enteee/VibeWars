import type { SkillBar } from "../build.js";
import { wieldsFor } from "../equipment/weapons.js";
import { distanceWithinRange, hasLineOfSight, type Segment } from "../geometry.js";
import { EXPERTISE_ATTRIBUTE, expertiseEnergyCost } from "../primary-attributes.js";
import type { Vec2 } from "../vec2.js";

import { getStatusDefinition } from "./status.js";
import { rankOf, type RankHolder } from "./tick.js";
import { isSpell, type Combatant, type Skill, type TargetRule } from "./types.js";

/**
 * Skill activation validation (brief §32: the server validates skill
 * availability, resource cost, cooldown, range, line of sight, and target
 * legality — a client only ever *requests* a cast).
 *
 * Every rejection is a named reason rather than a bare `false`, so the
 * server can log exactly why a cast was refused and a future UI can tell
 * the player ("out of range" vs "not enough energy" are very different
 * things to a player mid-fight).
 */

export type ActivationRejection =
  | "caster-dead"
  | "caster-knocked-down"
  | "skill-not-on-bar"
  | "still-recharging"
  | "already-casting"
  | "wrong-weapon"
  | "insufficient-energy"
  | "insufficient-adrenaline"
  | "no-target"
  | "invalid-target-dead"
  | "invalid-target-alive"
  | "invalid-target-self"
  | "invalid-target-ally"
  | "invalid-target-enemy"
  | "out-of-range"
  | "no-line-of-sight";

export type ActivationCheck =
  { readonly ok: true } | { readonly ok: false; readonly reason: ActivationRejection };

const OK: ActivationCheck = { ok: true };

function reject(reason: ActivationRejection): ActivationCheck {
  return { ok: false, reason };
}

export interface ActivationRequest {
  readonly skill: Skill;
  readonly caster: Combatant;
  readonly casterPosition: Vec2;
  readonly target: Combatant | undefined;
  readonly targetPosition: Vec2 | undefined;
  /** Skill ids currently recharging for this caster, with seconds remaining. */
  readonly rechargeRemaining: ReadonlyMap<string, number>;
  /** True if the caster is mid-cast on something else. */
  readonly isCasting: boolean;
  /** The caster's bar by slot; a skill not on it can never be cast. */
  readonly skillBar: SkillBar;
  readonly losBlockers: readonly Segment[];
}

/**
 * Why `rule` refuses `target` for `caster`, by who each is, or `undefined`
 * when it allows it (#599). Liveness and range are not its business: the
 * activation check and the skill bar's range mark both ask this, so they
 * cannot disagree about who a skill may be cast on.
 */
export function targetRuleAllows(
  rule: TargetRule,
  caster: Pick<Combatant, "id" | "team">,
  target: Pick<Combatant, "id" | "team">,
): ActivationRejection | undefined {
  const isSelf = target.id === caster.id;
  const isAlly = !isSelf && target.team === caster.team;
  const isEnemy = target.team !== caster.team;

  switch (rule) {
    case "self":
    case "single-any":
      return undefined;
    case "single-enemy":
      return isEnemy ? undefined : isSelf ? "invalid-target-self" : "invalid-target-ally";
    case "single-ally":
      // "Ally" includes yourself: self-healing is a normal, intended play.
      return isAlly || isSelf ? undefined : "invalid-target-enemy";
    case "single-other-ally":
    case "single-dead-ally":
      return isAlly ? undefined : isSelf ? "invalid-target-self" : "invalid-target-enemy";
  }
}

/**
 * Why `rule` refuses `target` for being alive or dead, or `undefined` when
 * it allows it. Every rule wants the living but a resurrection's, which
 * wants the dead (#812). Shared, as `targetRuleAllows` is, by the
 * activation check and the skill bar's range mark.
 */
export function targetLivenessAllows(
  rule: TargetRule,
  target: Pick<Combatant, "dead">,
): ActivationRejection | undefined {
  if (rule === "single-dead-ally") {
    return target.dead ? undefined : "invalid-target-alive";
  }
  return target.dead ? "invalid-target-dead" : undefined;
}

/** Validate a target against a skill's targeting rule. */
function checkTarget(request: ActivationRequest): ActivationCheck {
  const { skill, caster, target } = request;

  if (skill.target === "self") {
    // A self-targeted skill ignores whatever the client had selected.
    return OK;
  }

  if (target === undefined) {
    return reject("no-target");
  }
  const byWho = targetRuleAllows(skill.target, caster, target);
  const byLife = targetLivenessAllows(skill.target, target);
  // A resurrection on yourself or a foe is refused for who, not for being
  // alive; any other skill on a corpse is refused for the corpse.
  const refused = skill.target === "single-dead-ally" ? (byWho ?? byLife) : (byLife ?? byWho);
  return refused === undefined ? OK : reject(refused);
}

export function canActivate(request: ActivationRequest): ActivationCheck {
  const { skill, caster } = request;

  if (caster.dead) {
    return reject("caster-dead");
  }
  if (caster.knockdownRemaining > 0) {
    return reject("caster-knocked-down");
  }
  if (!request.skillBar.includes(skill.id)) {
    return reject("skill-not-on-bar");
  }
  if (request.isCasting) {
    return reject("already-casting");
  }
  if ((request.rechargeRemaining.get(skill.id) ?? 0) > 0) {
    return reject("still-recharging");
  }
  // An attack skill is a blow of its weapon (ADR-0029): checked before the
  // cost, so the player is told what is wrong rather than what it costs.
  if (
    skill.attack !== undefined &&
    !wieldsFor(caster.equipment.mainHand.weapon.id, skill.attack.weapon)
  ) {
    return reject("wrong-weapon");
  }

  if (skill.cost !== undefined) {
    if (skill.cost.kind === "energy" && caster.energy < energyCostOf(skill, caster)) {
      return reject("insufficient-energy");
    }
    if (skill.cost.kind === "adrenaline" && caster.adrenaline < skill.cost.amount) {
      return reject("insufficient-adrenaline");
    }
  }

  const targetCheck = checkTarget(request);
  if (!targetCheck.ok) {
    return targetCheck;
  }

  // Range and line of sight only apply when there is a distinct target to
  // measure against; a self-cast is always in range of itself.
  if (skill.target !== "self" && request.targetPosition !== undefined) {
    if (!distanceWithinRange(request.casterPosition, request.targetPosition, skill.range)) {
      return reject("out-of-range");
    }
    if (!hasLineOfSight(request.casterPosition, request.targetPosition, request.losBlockers)) {
      return reject("no-line-of-sight");
    }
  }

  return OK;
}

/**
 * The energy `skill` costs `caster` right now (#637): Expertise so far
 * (#528), less what an active glyph takes off a spell (#526), never below
 * 0. The one number the check, the spend and the skill bar use, so they
 * cannot disagree. 0 for a skill with no energy cost.
 */
export function energyCostOf(skill: Skill, caster: RankHolder): number {
  if (skill.cost?.kind !== "energy") {
    return 0;
  }
  const expertise = rankOf(caster, EXPERTISE_ATTRIBUTE);
  const cost = expertiseEnergyCost(expertise, skill, skill.cost.amount);
  if (!isSpell(skill.type)) {
    return cost;
  }
  const reduction = caster.statuses.active.reduce(
    (sum, { id }) => sum + (getStatusDefinition(id).nextSpells?.costReduction ?? 0),
    0,
  );
  return Math.max(0, cost - reduction);
}

/**
 * Deduct a skill's cost from the caster. Call only after `canActivate`
 * returned ok — this deliberately does not re-check affordability, so a
 * caller that skips validation produces an obviously-wrong negative
 * resource rather than a silently-free cast.
 */
export function payCost(skill: Skill, caster: Combatant): void {
  if (skill.cost === undefined) {
    return;
  }
  if (skill.cost.kind === "energy") {
    caster.energy -= energyCostOf(skill, caster);
    return;
  }
  caster.adrenaline -= skill.cost.amount;
}

/**
 * Whether `skill` is followed by GW1's aftercast when it goes off (#317):
 * one with an activation time, unless it is an attack skill, whose timing
 * is the weapon's. Instant skills, like GW1's shouts and stances, have none.
 */
export function hasAftercast(skill: Skill): boolean {
  return skill.type !== "attack" && skill.activationSeconds > 0;
}
