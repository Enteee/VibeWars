import { effectiveRank } from "../attributes.js";
import type { ModStatusWhile } from "../equipment/mods.js";
import type { ResolvedEquipment } from "../equipment/resolve.js";
import type { DamageType } from "../equipment/types.js";
import { wieldsFor } from "../equipment/weapons.js";
import { getAttribute } from "../professions.js";
import { FAST_CASTING_ATTRIBUTE, fastCastingMultiplier } from "../primary-attributes.js";
import type { ResourceRules } from "../ruleset.js";
import type { CombatEvent } from "./effects.js";
import { guardedDegeneration } from "./loss-guard.js";
import { effectiveMaxEnergy, energyFloor } from "./overcast.js";
import {
  aggregateModifiers,
  clampPips,
  getStatusDefinition,
  HEALTH_PER_PIP,
  StatusSet,
  isStatusId,
  isSuppressed,
  NO_RANKS,
  isUnderAnother,
  ownSkillBoost,
  scaledStatAttributes,
  type ArmorReduction,
  type AttributeDelta,
  type AttributeScope,
  type BlockRule,
  type MaxHealthLoss,
  type StatusId,
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
 * tick emits one damage or heal event. A Guild Lord loses no more than
 * its per-second cap lets through (#1223).
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
    const unguarded = change < 0 && isInvulnerable(combatant) ? 0 : change;
    const wanted = Math.min(
      effectiveMaxHealth(combatant),
      Math.max(0, combatant.health + unguarded),
    );
    // A Guild Lord loses no more than its cap lets through (#1223), and
    // that includes coming down to its effective maximum: a Deep Wound
    // whose cut the cap held back leaves it above, to lose the rest as
    // later seconds allow.
    const next =
      wanted < combatant.health
        ? combatant.health - guardedDegeneration(combatant, combatant.health - wanted)
        : wanted;
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
  loseModMaxima(combatant);

  return events;
}

/**
 * A mod's maximum whose condition no longer holds (#2010), of Devotion's
 * once the enchantment ends or Hale and Hearty's below half Health: what
 * is above the maximum left is lost, as when a status's bonus ends. It
 * never kills, and takes no hidden energy deeper.
 */
function loseModMaxima(combatant: Combatant): void {
  const { conditionalMaxHealth, conditionalMaxEnergy } = combatant.equipment;
  if (conditionalMaxHealth.length > 0) {
    combatant.health = Math.min(combatant.health, effectiveMaxHealth(combatant));
  }
  if (conditionalMaxEnergy.length > 0) {
    combatant.energy = Math.max(
      energyFloor(combatant),
      Math.min(combatant.energy, effectiveMaxEnergy(combatant)),
    );
  }
}

/** Net regeneration (+) or degeneration (−), in pips, clamped to ±`MAX_PIPS`. */
export interface NetPips {
  readonly health: number;
  readonly energy: number;
}

/**
 * The bearer's net pips as they apply (#502, #504): every status's, plus
 * `naturalPips` of natural regeneration and the held set's mods' (#2009) for
 * health, the base pips and `upkeepPips` (`upkeepPips`) for energy, each
 * clamped. None when dead. The tick applies these and the wire shows these, so the two
 * cannot disagree.
 */
export function netPips(combatant: Combatant, naturalPips: number, upkeepPips: number): NetPips {
  if (combatant.dead) {
    return { health: 0, energy: 0 };
  }
  return {
    health: clampPips(
      aggregateModifiers(combatant.statuses.active).healthPips +
        combatant.equipment.healthPips +
        naturalPips,
    ),
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
 * The bearer's effective maximum health: raised by its statuses' bonus
 * (#1359, Endure Pain), then cut by a loss such as deep wound's:
 * `fraction` of the raised maximum, at most `cap`. The bonus is added
 * before the cut, so the 20% is of the larger maximum, the one the wire
 * carries. The simulation clamps heals to it.
 */
export function effectiveMaxHealth(combatant: MaxHealthHolder): number {
  const modifiers = aggregateModifiers(combatant.statuses.active);
  const raised = combatant.maxHealth + modifiers.maxHealthBonus + modMaxHealthBonus(combatant);
  return raised - lossOf(raised, modifiers.maxHealthLoss);
}

/**
 * The bearer's maximum health with its statuses' bonus (#1359), before any
 * loss: what its health bar is drawn against.
 */
export function raisedMaxHealth(combatant: MaxHealthHolder): number {
  return (
    combatant.maxHealth +
    aggregateModifiers(combatant.statuses.active).maxHealthBonus +
    modMaxHealthBonus(combatant)
  );
}

/** How much maximum health the bearer's statuses take: 0 for none. */
export function maxHealthLossOf(combatant: MaxHealthHolder): number {
  const modifiers = aggregateModifiers(combatant.statuses.active);
  return lossOf(
    combatant.maxHealth + modifiers.maxHealthBonus + modMaxHealthBonus(combatant),
    modifiers.maxHealthLoss,
  );
}

/** What a maximum Health is read from: the base, statuses and the held set's mods. */
type MaxHealthHolder = Pick<Combatant, "maxHealth" | "statuses" | "equipment">;

/** Whether an enchantment, stance or hex is on `bearer`: a mod's condition (#2010). */
export function statusWhileHolds(
  condition: ModStatusWhile,
  bearer: Pick<Combatant, "statuses">,
): boolean {
  const category =
    condition === "enchanted" ? "enchantment" : condition === "in-stance" ? "stance" : "hex";
  return bearer.statuses.countByCategory(category) > 0;
}

/** The held set's maximum Health whose condition holds now (#2010): of Devotion's +45. */
function modMaxHealthBonus(combatant: Pick<Combatant, "statuses" | "equipment">): number {
  let bonus = 0;
  for (const mod of combatant.equipment.conditionalMaxHealth) {
    if (statusWhileHolds(mod.while, combatant)) {
      bonus += mod.amount;
    }
  }
  return bonus;
}

/**
 * The same loss from a snapshot's status ids: the client greys the health
 * bar by it, so the wire need not carry it and both use one definition.
 * `maxHealth` is the raised one, as the wire carries it.
 */
export function maxHealthLossOfStatusIds(maxHealth: number, statusIds: readonly string[]): number {
  return lossOf(
    maxHealth,
    aggregateModifiers(statusIds.filter(isStatusId).map((id) => ({ id, ranks: NO_RANKS })))
      .maxHealthLoss,
  );
}

function lossOf(maxHealth: number, loss: MaxHealthLoss | undefined): number {
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
export type RankHolder = Pick<
  Combatant,
  "attributeRanks" | "borrowedAttribute" | "heldAttributeDeltas" | "statuses"
> & {
  readonly equipment: Pick<ResolvedEquipment, "attributeBonuses">;
};

/**
 * A holder at `ranks` with nothing on: a build, not a moment of a fight,
 * for a tooltip or an editor (#637).
 */
export function outsideMatch(ranks: ReadonlyMap<string, number>): RankHolder {
  return {
    attributeRanks: ranks,
    borrowedAttribute: null,
    heldAttributeDeltas: [],
    statuses: new StatusSet(),
    equipment: { attributeBonuses: new Map() },
  };
}

/**
 * The bearer's rank in `attributeId` right now (#762): its sheet's, runes
 * included, plus every in-scope `attributeDeltas` of its statuses and of
 * those held by the skill resolving (#1941), floored at 0 and capped. A
 * rank of 0 bought with points is never lowered, even when a rune raised
 * it, as GW1 says, but a boost raises it. A set rank (#1929) beats them
 * all. The one match-time reader of `attributeRanks` (ADR-0019).
 */
export function rankOf(holder: RankHolder, asked: string): number {
  const borrowed = holder.borrowedAttribute;
  const attributeId = borrowed !== null && borrowed.from === asked ? borrowed.to : asked;
  const rank = holder.attributeRanks.get(attributeId) ?? 0;
  const bonus = holder.equipment.attributeBonuses.get(attributeId) ?? 0;
  const { attributeDeltas, attributeSets } = aggregateModifiers(holder.statuses.active);
  const set = attributeSets.findLast(({ scope }) => inScope(scope, attributeId));
  if (set !== undefined) {
    return effectiveRank(set.rank, [{ delta: set.plusEquipment ? bonus : 0 }]);
  }
  // Plain loops: this runs on every rank read, so it allocates nothing.
  let delta = 0;
  for (const { scope, amount } of attributeDeltas) {
    if (inScope(scope, attributeId)) {
      delta += amount;
    }
  }
  for (const { scope, amount } of holder.heldAttributeDeltas) {
    if (inScope(scope, attributeId)) {
      delta += amount;
    }
  }
  if (delta < 0 && rank - bonus <= 0) {
    return rank;
  }
  return effectiveRank(rank, [{ delta }]);
}

/**
 * `source`'s ranks for `statusId` as it lands (#1976): `rankOf` in each
 * attribute its scaled stats name, the `ranks` the status keeps.
 */
export function statusRanks(statusId: StatusId, source: RankHolder): ReadonlyMap<string, number> {
  const attributes = scaledStatAttributes(statusId);
  if (attributes.length === 0) {
    return NO_RANKS;
  }
  return new Map(attributes.map((attributeId) => [attributeId, rankOf(source, attributeId)]));
}

/**
 * Whether an attribute set's or delta's `scope` holds `attributeId`
 * (#1929, #1941). A profession's scope holds its attributes whatever the
 * bearer's professions: a secondary Elementalist's are elemental too.
 */
export function inScope(scope: AttributeScope, attributeId: string): boolean {
  if (typeof scope === "object") {
    return "profession" in scope
      ? getAttribute(attributeId)?.professionId === scope.profession
      : scope.attributeId === attributeId;
  }
  switch (scope) {
    case "all":
      return true;
    case "primary":
      // Only a primary holds a rank, so the bearer's is whichever it has.
      return getAttribute(attributeId)?.isPrimary === true;
    case "elemental":
      return ELEMENTAL_ATTRIBUTES.has(attributeId);
  }
}

/** Master of Magic's "elemental attributes" (#1929). */
const ELEMENTAL_ATTRIBUTES: ReadonlySet<string> = new Set([
  "elementalist.air-magic",
  "elementalist.earth-magic",
  "elementalist.fire-magic",
  "elementalist.water-magic",
]);

/**
 * What a resolving skill lends its user's ranks (#1929, #1941): the
 * attribute a status lends a spell, Signet of Illusions' Illusion Magic,
 * and the deltas of the statuses its start spent, held through it.
 */
export interface RankLoan {
  readonly lent: string | undefined;
  readonly held: readonly AttributeDelta[];
}

/** A skill resolving with nothing lent. */
export const NO_RANK_LOAN: RankLoan = { lent: undefined, held: [] };

/**
 * `resolve` with `caster`'s `skill` under `loan` (#1929, #1941): every
 * rank read of the skill's own attribute meanwhile reads the lent one,
 * and every rank read adds the held deltas. Nothing lent: `resolve` as
 * it is.
 */
export function withRankLoan<T>(
  caster: Combatant,
  { lent, held }: RankLoan,
  skill: Skill,
  resolve: () => T,
): T {
  const borrowed =
    lent === undefined || skill.attributeId === undefined
      ? null
      : { from: skill.attributeId, to: lent };
  if (borrowed === null && held.length === 0) {
    return resolve();
  }
  caster.borrowedAttribute = borrowed;
  caster.heldAttributeDeltas = held;
  try {
    return resolve();
  } finally {
    caster.borrowedAttribute = null;
    caster.heldAttributeDeltas = [];
  }
}

/** The multiplier on the bearer's weapon roll: weakness's 0.34 (#762). */
export function weaponDamageMultiplierOf(combatant: Combatant): number {
  return aggregateModifiers(combatant.statuses.active).weaponDamageMultiplier;
}

/**
 * What the bearer's statuses add to each of its blows (#1654), summed.
 * One that names a weapon (#1873) counts only while the bearer wields it:
 * Favorable Winds' arrows. A suppressed one (#1916), as Brutal Weapon
 * beside an enchantment, adds nothing.
 */
export function attackDamageDeltaOf(combatant: Combatant): number {
  const wielded = combatant.equipment.mainHand.weapon.id;
  const { active } = combatant.statuses;
  return active.reduce((sum, status) => {
    const { attackDamageDelta, attackDamageDeltaWeapon } = getStatusDefinition(status.id);
    if (isSuppressed(active, status)) {
      return sum;
    }
    return attackDamageDeltaWeapon === undefined || wieldsFor(wielded, attackDamageDeltaWeapon)
      ? sum + attackDamageDelta
      : sum;
  }, 0);
}

/**
 * The type the bearer's attacks deal while a status sets one (#1021):
 * the newest such status's, a pick and not a sum. One that names a weapon
 * (#1455) counts only while the bearer wields it. `undefined`: the
 * weapon's own.
 */
export function attackDamageTypeOf(combatant: Combatant): DamageType | undefined {
  const wielded = combatant.equipment.mainHand.weapon.id;
  for (const { id } of [...combatant.statuses.active].reverse()) {
    const { attackDamageType, attackDamageTypeWeapon } = getStatusDefinition(id);
    if (
      attackDamageType !== undefined &&
      (attackDamageTypeWeapon === undefined || wieldsFor(wielded, attackDamageTypeWeapon))
    ) {
      return attackDamageType;
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
 * with no target, as in a tooltip, nothing on one counts. Migraine's
 * longer activation (#1473) slows every skill but an attack skill, and
 * multiplies with Dazed's. A status that hastens the caster's own skills
 * of a kind (#1761), as Holy Haste's Healing Prayers, multiplies in too,
 * and so does the skill's own `activationWhile` (#1916), as Natural
 * Healing's half while the caster is not enchanted. Last, the seconds a
 * status takes off its own skills of a kind (#1975), never below 0.
 */
export function effectiveActivationSeconds(
  skill: Skill,
  caster: RankHolder,
  target?: Pick<Combatant, "statuses">,
): number {
  const fastCasting = fastCastingMultiplier(rankOf(caster, FAST_CASTING_ATTRIBUTE), skill);
  const modifiers = aggregateModifiers(caster.statuses.active);
  const own = ownSkillBoost(caster.statuses.active, skill);
  const slowed =
    (skill.type === "attack" || skill.type === "pet-attack"
      ? 1
      : modifiers.skillActivationMultiplier) *
    own.activationMultiplier *
    activationWhileMultiplier(skill, caster);
  // Jaundiced Gaze's second (#1975), off after every multiplier.
  const less = (seconds: number): number => Math.max(0, seconds - own.activationSecondsLess);
  if (!isSpell(skill.type)) {
    return less(skill.activationSeconds * fastCasting * slowed);
  }
  const onTarget =
    skill.type === "hex" && target !== undefined
      ? aggregateModifiers(target.statuses.active).incomingHexCastTimeMultiplier
      : 1;
  return less(
    skill.activationSeconds * modifiers.castTimeMultiplier * slowed * fastCasting * onTarget,
  );
}

/** `skill`'s own `activationWhile` multiplier for `caster` now (#1916); 1 without one. */
function activationWhileMultiplier(skill: Skill, caster: RankHolder): number {
  if (skill.activationWhile === undefined) {
    return 1;
  }
  const { condition, multiplier } = skill.activationWhile;
  const held = caster.statuses.countByCategory(condition.category, condition.profession) > 0;
  return held === (condition.kind === "caster-has") ? multiplier : 1;
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
 * reads the bearer's health as it is now. `attackSkill`: the blow or shot
 * is an attack skill's, which a block of attack skills only (#1978) needs.
 */
export function blockChanceOf(
  combatant: Combatant,
  kind: "melee" | "projectile",
  attackSkill: boolean,
): number {
  return combinedBlockChance(
    blockingStatusesOf(combatant, attackSkill).map(({ block }) => block),
    kind,
  );
}

/** A status the bearer blocks with, and its rule (#1265). */
export interface BlockingStatus {
  readonly statusId: StatusId;
  readonly block: BlockRule;
}

/**
 * The bearer's statuses that block now, in the order they roll (#1265),
 * as `blockChanceOf` reads them: none while knocked down, and one that
 * holds only below a share of health only below it. One that blocks only
 * attack skills drops out against a plain swing, and one that holds only
 * while under a shout or chant drops out without one (#1978).
 */
export function blockingStatusesOf(
  combatant: Combatant,
  attackSkill: boolean,
): readonly BlockingStatus[] {
  if (combatant.knockdownRemaining > 0) {
    return [];
  }
  const maxHealth = effectiveMaxHealth(combatant);
  return combatant.statuses.active.flatMap((status) => {
    const { block, blockBelowHealth, blockWhileUnder } = getStatusDefinition(status.id);
    const holds =
      (blockBelowHealth === undefined || combatant.health < maxHealth * blockBelowHealth) &&
      (blockWhileUnder === undefined ||
        isUnderAnother(combatant.statuses.active, status, blockWhileUnder));
    return block !== undefined && holds && (attackSkill || block.attackSkillsOnly !== true)
      ? [{ statusId: status.id, block }]
      : [];
  });
}
