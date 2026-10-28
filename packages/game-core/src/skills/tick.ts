import { effectiveRank } from "../attributes.js";
import type { ResolvedEquipment } from "../equipment/resolve.js";
import type { DamageType } from "../equipment/types.js";
import { FAST_CASTING_ATTRIBUTE, fastCastingMultiplier } from "../primary-attributes.js";
import type { ResourceRules } from "../ruleset.js";
import type { CombatEvent } from "./effects.js";
import {
  aggregateModifiers,
  clampPips,
  getStatusDefinition,
  HEALTH_PER_PIP,
  StatusSet,
  isStatusId,
  type ActiveStatus,
  type ArmorReduction,
  type BlockRule,
} from "./status.js";
import { isInvulnerable, isSpell, type Combatant, type Skill } from "./types.js";

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
 *
 * Health per second (#975, Spirit Light Weapon), and a moving bearer's
 * (#921, "Fall Back!"), and one `nearSpirit`'s (#1064, the simulation
 * knows where spirits stand), is a heal, not pips: outside the clamp,
 * scaled by `healingMultiplier`, and added to the same change, so one
 * tick emits one damage or heal event.
 */
export function advanceStatuses(
  combatant: Combatant,
  dt: number,
  naturalPips: number,
  nearSpirit = false,
): CombatEvent[] {
  const events: CombatEvent[] = [];
  if (combatant.dead) {
    return events;
  }

  // Health only: upkeep is energy, so none is owed here.
  const pips = netPips(combatant, naturalPips, 0).health;
  const modifiers = aggregateModifiers(combatant.statuses.active);
  const perSecond =
    (modifiers.healthPerSecond +
      (combatant.moving ? modifiers.healthPerSecondWhileMoving : 0) +
      (nearSpirit ? modifiers.healthPerSecondNearSpirit : 0)) *
    modifiers.healingMultiplier;
  if (pips !== 0 || perSecond !== 0) {
    const change = (pips * HEALTH_PER_PIP + perSecond) * dt;
    // Degeneration takes nothing from an invulnerable body (#1208); regeneration still heals.
    const delta = change < 0 && isInvulnerable(combatant) ? 0 : change;
    const effectiveMax = effectiveMaxHealth(combatant);
    const next = Math.min(effectiveMax, Math.max(0, combatant.health + delta));
    const applied = next - combatant.health;
    combatant.health = next;

    if (applied < 0) {
      events.push({ kind: "damage", targetId: combatant.id, amount: -applied, critical: false });
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

  for (const statusId of combatant.statuses.advance(dt, combatant.moving)) {
    events.push({ kind: "status-expired", targetId: combatant.id, statusId });
  }

  return events;
}

/** Net regeneration (+) or degeneration (−), in pips, clamped to ±`MAX_PIPS`. */
export interface NetPips {
  readonly health: number;
  readonly energy: number;
}

/**
 * The bearer's net pips as they apply (#502, #504): every status's, plus
 * `naturalPips` of natural regeneration for health and the base pips for
 * energy, and `upkeepPips` (`upkeepPips`) for energy, each clamped. None
 * when dead. The tick applies these and the wire shows these, so the two
 * cannot disagree.
 */
export function netPips(combatant: Combatant, naturalPips: number, upkeepPips: number): NetPips {
  if (combatant.dead) {
    return { health: 0, energy: 0 };
  }
  return {
    health: clampPips(aggregateModifiers(combatant.statuses.active).healthPips + naturalPips),
    energy: clampPips(preCapEnergyPips(combatant, upkeepPips)),
  };
}

/**
 * The bearer's net energy pips before the ±`MAX_PIPS` clamp (#837): what
 * decides whether a maintained enchantment can still be paid for.
 */
export function preCapEnergyPips(combatant: Combatant, upkeepPips: number): number {
  return (
    combatant.baseEnergyPips + aggregateModifiers(combatant.statuses.active).energyPips + upkeepPips
  );
}

/**
 * What `casterId` pays for the enchantments it maintains (#837): −1 pip
 * for each one on a living bearer. Derived, never stored on the caster,
 * so a strip, a replacement or a death ends the upkeep with the status.
 */
export function upkeepPips(casterId: string, bearers: Iterable<Combatant>): number {
  let pips = 0;
  for (const bearer of bearers) {
    if (bearer.dead) {
      continue;
    }
    for (const status of bearer.statuses.active) {
      if (status.maintained !== null && status.sourceId === casterId) {
        pips -= 1;
      }
    }
  }
  return pips;
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
 * The bearer's effective maximum health, after a loss such as deep
 * wound's: `fraction` of the maximum, at most `cap`. The simulation
 * clamps heals to it.
 */
export function effectiveMaxHealth(combatant: Pick<Combatant, "maxHealth" | "statuses">): number {
  return combatant.maxHealth - maxHealthLossOf(combatant);
}

/** How much maximum health the bearer's statuses take: 0 for none. */
export function maxHealthLossOf(combatant: Pick<Combatant, "maxHealth" | "statuses">): number {
  return maxHealthLoss(combatant.maxHealth, combatant.statuses.active);
}

/**
 * The same loss from a snapshot's status ids: the client greys the health
 * bar by it, so the wire need not carry it and both use one definition.
 */
export function maxHealthLossOfStatusIds(maxHealth: number, statusIds: readonly string[]): number {
  return maxHealthLoss(
    maxHealth,
    statusIds.filter(isStatusId).map((id) => ({ id })),
  );
}

function maxHealthLoss(maxHealth: number, statuses: readonly Pick<ActiveStatus, "id">[]): number {
  const loss = aggregateModifiers(statuses).maxHealthLoss;
  return loss === undefined ? 0 : Math.min(loss.cap, loss.fraction * maxHealth);
}

/**
 * What the bearer's heals from skills are multiplied by (deep wound's
 * −20%). Regeneration and life steal do not ask.
 */
export function healingMultiplierOf(combatant: Pick<Combatant, "statuses">): number {
  return aggregateModifiers(combatant.statuses.active).healingMultiplier;
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
 * The clamp keeps stacked slows or speed boosts from bringing a player to a
 * standstill or a sprint: Shard Storm and Deep Freeze together reach the
 * floor (#938).
 */
export function clampMoveSpeed(raw: number): number {
  return Math.min(MOVE_SPEED_MAX, Math.max(MOVE_SPEED_MIN, raw));
}

/** What `rankOf` reads of a combatant: a tooltip outside a match passes no statuses. */
export type RankHolder = Pick<Combatant, "attributeRanks" | "statuses"> & {
  readonly equipment: Pick<ResolvedEquipment, "attributeBonuses">;
};

/**
 * A holder at `ranks` with nothing on: a build, not a moment of a fight,
 * for a tooltip or an editor (#637).
 */
export function outsideMatch(ranks: ReadonlyMap<string, number>): RankHolder {
  return {
    attributeRanks: ranks,
    statuses: new StatusSet(),
    equipment: { attributeBonuses: new Map() },
  };
}

/**
 * The bearer's rank in `attributeId` right now (#762): its sheet's, runes
 * included, plus every status's `attributeDelta`, floored at 0. A rank
 * of 0 bought with points is never lowered, even when a rune raised it,
 * as GW1 says. The one match-time reader of `attributeRanks` (ADR-0019).
 */
export function rankOf(holder: RankHolder, attributeId: string): number {
  const rank = holder.attributeRanks.get(attributeId) ?? 0;
  const allocated = rank - (holder.equipment.attributeBonuses.get(attributeId) ?? 0);
  if (allocated <= 0) {
    return rank;
  }
  const { attributeDelta } = aggregateModifiers(holder.statuses.active);
  return effectiveRank(rank, [{ delta: attributeDelta }]);
}

/** The multiplier on the bearer's weapon roll: weakness's 0.34 (#762). */
export function weaponDamageMultiplierOf(combatant: Combatant): number {
  return aggregateModifiers(combatant.statuses.active).weaponDamageMultiplier;
}

/**
 * The type the bearer's attacks deal while a status sets one (#1021):
 * the newest such status's, a pick and not a sum. `undefined`: the
 * weapon's own.
 */
export function attackDamageTypeOf(combatant: Combatant): DamageType | undefined {
  for (const { id } of [...combatant.statuses.active].reverse()) {
    const type = getStatusDefinition(id).attackDamageType;
    if (type !== undefined) {
      return type;
    }
  }
  return undefined;
}

/**
 * How long this caster takes to cast this skill. Dazed doubles a spell's;
 * a signet or any other skill that is not a spell casts at normal speed,
 * as in GW1 (#524). An instant skill stays instant (0 × 2 = 0). Fast
 * Casting multiplies in too (#527), judged on the skill's own activation,
 * and speeds up a signet as well (#1100), which dazed does not.
 * A hex cast on a `target` under Holy Veil takes twice as long (#944);
 * with no target, as in a tooltip, nothing on one counts.
 */
export function effectiveActivationSeconds(
  skill: Skill,
  caster: RankHolder,
  target?: Pick<Combatant, "statuses">,
): number {
  const fastCasting = fastCastingMultiplier(rankOf(caster, FAST_CASTING_ATTRIBUTE), skill);
  if (!isSpell(skill.type)) {
    return skill.activationSeconds * fastCasting;
  }
  const onTarget =
    skill.type === "hex" && target !== undefined
      ? aggregateModifiers(target.statuses.active).incomingHexCastTimeMultiplier
      : 1;
  return (
    skill.activationSeconds *
    aggregateModifiers(caster.statuses.active).castTimeMultiplier *
    fastCasting *
    onTarget
  );
}

/** The bearer's armor reduction (Cracked Armor, #763); `undefined`: none. */
export function armorReductionOf(combatant: Combatant): ArmorReduction | undefined {
  return aggregateModifiers(combatant.statuses.active).armorReduction;
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

/**
 * The chance in [0, 1] that the bearer blocks an attack of this kind
 * (#534). None while knocked down, as in GW1 (#610): 0, so no block is
 * rolled at all. A block that holds only below a share of health (#988)
 * reads the bearer's health as it is now.
 */
export function blockChanceOf(combatant: Combatant, kind: "melee" | "projectile"): number {
  if (combatant.knockdownRemaining > 0) {
    return 0;
  }
  const maxHealth = effectiveMaxHealth(combatant);
  return combinedBlockChance(
    combatant.statuses.active.flatMap((status) => {
      const { block, blockBelowHealth } = getStatusDefinition(status.id);
      const holds =
        blockBelowHealth === undefined || combatant.health < maxHealth * blockBelowHealth;
      return block !== undefined && holds ? [block] : [];
    }),
    kind,
  );
}
