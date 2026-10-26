import type { ResourceRules } from "../ruleset.js";
import type { CombatEvent } from "./effects.js";
import {
  aggregateModifiers,
  clampPips,
  getStatusDefinition,
  HEALTH_PER_PIP,
  type BlockRule,
} from "./status.js";
import type { Combatant, Skill } from "./types.js";

/**
 * Per-tick status processing (brief §13's "durations", §12's degeneration).
 *
 * Health change from statuses is applied *continuously* — the net pips,
 * clamped, times `HEALTH_PER_PIP * dt` — rather than in once-per-second
 * lumps, so a −3 bleed and a 20Hz tick produce smooth, predictable
 * degeneration instead of visible stair-stepping. Fractional health is carried in the
 * combatant's health value and only ever observed rounded at the UI layer.
 *
 * `naturalPips` is natural regeneration (`naturalHealthPips`): not a
 * status, but summed with theirs before the clamp, as GW1 does.
 */
export function advanceStatuses(
  combatant: Combatant,
  dt: number,
  naturalPips: number,
): CombatEvent[] {
  const events: CombatEvent[] = [];
  if (combatant.dead) {
    return events;
  }

  const modifiers = aggregateModifiers(combatant.statuses.active);

  const pips = clampPips(modifiers.healthPips + naturalPips);
  if (pips !== 0) {
    const delta = pips * HEALTH_PER_PIP * dt;
    const effectiveMax = combatant.maxHealth * modifiers.maxHealthMultiplier;
    const next = Math.min(effectiveMax, Math.max(0, combatant.health + delta));
    const applied = next - combatant.health;
    combatant.health = next;

    if (applied < 0) {
      events.push({ kind: "damage", targetId: combatant.id, amount: -applied });
    } else if (applied > 0) {
      events.push({ kind: "heal", targetId: combatant.id, amount: applied });
    }

    // The dead-combatant early return above means reaching 0 here is
    // always a new death.
    if (combatant.health <= 0) {
      combatant.dead = true;
      events.push({ kind: "death", targetId: combatant.id });
    }
  }

  for (const statusId of combatant.statuses.advance(dt)) {
    events.push({ kind: "status-expired", targetId: combatant.id, statusId });
  }

  return events;
}

/**
 * Natural health regeneration, in pips, after this long out of combat
 * (#460): none before the delay, +1 at it, one more each step, up to the
 * cap. None at full health, so nothing shows a regeneration that heals
 * nothing.
 */
export function naturalHealthPips(
  combatant: Combatant,
  outOfCombatSeconds: number,
  rules: ResourceRules,
): number {
  if (combatant.dead || combatant.health >= effectiveMaxHealth(combatant)) {
    return 0;
  }
  const past = outOfCombatSeconds - rules.naturalRegenDelaySeconds;
  // Within a hair, as a swing is: a hundred additions of 0.05 fall just
  // short of 5.
  if (past < -PIP_EPSILON) {
    return 0;
  }
  return Math.min(
    rules.naturalRegenMaxPips,
    1 + Math.floor((past + PIP_EPSILON) / rules.naturalRegenStepSeconds),
  );
}

const PIP_EPSILON = 1e-6;

/**
 * The bearer's effective maximum health, after multipliers such as deep
 * wound. Exposed because both the simulation (for clamping heals) and the
 * client (for drawing a health bar) need the same number.
 */
export function effectiveMaxHealth(combatant: Combatant): number {
  return combatant.maxHealth * aggregateModifiers(combatant.statuses.active).maxHealthMultiplier;
}

/** The slowest and fastest a combination of statuses can make anyone move. */
const MOVE_SPEED_MIN = 0.25;
const MOVE_SPEED_MAX = 1.33;

/**
 * The bearer's movement speed multiplier, clamped. The clamp lives here,
 * not in `aggregateModifiers`, so each status's own number ("moves at 50%
 * speed") stays what its tooltip says.
 */
export function moveSpeedMultiplier(combatant: Combatant): number {
  return clampMoveSpeed(aggregateModifiers(combatant.statuses.active).moveSpeedMultiplier);
}

/**
 * No status combination reaches either bound today; the clamp is there so
 * the next slow or speed boost cannot stack a player into a standstill or
 * a sprint.
 */
export function clampMoveSpeed(raw: number): number {
  return Math.min(MOVE_SPEED_MAX, Math.max(MOVE_SPEED_MIN, raw));
}

/**
 * How long this caster takes to cast this skill. Dazed doubles it; an
 * instant skill stays instant (0 × 2 = 0), the one place dazed visibly
 * does nothing.
 */
export function effectiveActivationSeconds(skill: Skill, caster: Combatant): number {
  return skill.activationSeconds * aggregateModifiers(caster.statuses.active).castTimeMultiplier;
}

/** The chance in [0, 1] that the bearer's attacks miss (blind). */
export function attackMissChanceOf(combatant: Combatant): number {
  return aggregateModifiers(combatant.statuses.active).attackMissChance;
}

/**
 * The chance in [0, 1] that `blocks` together block an attack of this
 * kind (#534). Several sources combine as 1 − ∏(1 − p): two 50% blocks
 * are 75%.
 */
export function combinedBlockChance(
  blocks: readonly BlockRule[],
  kind: "melee" | "projectile",
): number {
  let unblocked = 1;
  for (const block of blocks) {
    if (block.against === "all" || block.against === kind) {
      unblocked *= 1 - block.chance;
    }
  }
  return 1 - unblocked;
}

/** The chance in [0, 1] that the bearer blocks an attack of this kind (#534). */
export function blockChanceOf(combatant: Combatant, kind: "melee" | "projectile"): number {
  return combinedBlockChance(
    combatant.statuses.active.flatMap((status) => getStatusDefinition(status.id).block ?? []),
    kind,
  );
}
