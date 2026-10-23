import { distanceWithinRange, hasLineOfSight, type Segment } from "../geometry.js";
import type { Vec2 } from "../vec2.js";

import type { Combatant, Skill } from "./types.js";

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
  | "skill-not-on-bar"
  | "still-recharging"
  | "already-casting"
  | "insufficient-energy"
  | "insufficient-adrenaline"
  | "no-target"
  | "invalid-target-dead"
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
  /** The caster's equipped skills; a skill not on the bar can never be cast. */
  readonly skillBar: readonly string[];
  readonly losBlockers: readonly Segment[];
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
  if (target.dead) {
    return reject("invalid-target-dead");
  }

  const isSelf = target.id === caster.id;
  const isAlly = !isSelf && target.team === caster.team;
  const isEnemy = target.team !== caster.team;

  switch (skill.target) {
    case "single-enemy":
      return isEnemy ? OK : reject(isSelf ? "invalid-target-self" : "invalid-target-ally");
    case "single-ally":
      // "Ally" includes yourself: self-healing is a normal, intended play.
      return isAlly || isSelf ? OK : reject("invalid-target-enemy");
    case "single-any":
      return OK;
  }
}

export function canActivate(request: ActivationRequest): ActivationCheck {
  const { skill, caster } = request;

  if (caster.dead) {
    return reject("caster-dead");
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

  if (skill.cost !== undefined) {
    if (skill.cost.kind === "energy" && caster.energy < skill.cost.amount) {
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
    caster.energy -= skill.cost.amount;
    return;
  }
  caster.adrenaline -= skill.cost.amount;
}
