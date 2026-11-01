import {
  AREA_ADJACENT,
  AREA_EARSHOT,
  AREA_IN_THE_AREA,
  AREA_NEARBY,
  RANGE_SPELL,
} from "../distances.js";
import type { ConditionalArmor } from "../equipment/armor.js";
import type { DamageType } from "../equipment/types.js";
import { WEAPONS } from "../equipment/weapons.js";
import {
  SPAWNING_POWER_ATTRIBUTE,
  spawningPowerHealth,
  spawningPowerMultiplier,
} from "../primary-attributes.js";
import { getAttribute, getProfession, type ProfessionId } from "../professions.js";

import { energyCostOf } from "./activation.js";
import { getSkill } from "./catalog.js";
import { creatureDamageMultiplier } from "./damage.js";
import { resolveMagnitudeAtRanks, statAt, statAtTwelve } from "./scaling.js";
import {
  findStatusDefinition,
  getStatusDefinition,
  NO_RANKS,
  type AttributeDelta,
  type AttributeScope,
  type AttributeSet,
  type NextSkill,
  type NextSkillRule,
  type OwnSkillModifier,
  type StatusCategory,
  type StatusStat,
  type StatusTrigger,
  type StatusTriggerEvent,
  type TriggerEffect,
} from "./status.js";
import { effectiveActivationSeconds, outsideMatch, rankOf } from "./tick.js";
import { blowRuleOf, isEasilyInterrupted } from "./types.js";
import type {
  AdrenalineGainEffect,
  ApplyStatusEffect,
  RadiusArea,
  AttackWeaponClass,
  Aura,
  CreatureTemplate,
  DeathBurst,
  DeathInRange,
  ChainRole,
  ChainStep,
  CreateGroundEffect,
  CreatureAttack,
  CreatureLevel,
  DisableOwnSkillsEffect,
  EffectCondition,
  EnergyGainEffect,
  HealEffect,
  Magnitude,
  PerCount,
  RemoveStatusEffect,
  Skill,
  SkillEffect,
  SkillType,
  StateCondition,
  UnconditionalEffect,
  SplashEffect,
  DamageEffect,
  TransferConditionsEffect,
} from "./types.js";

/**
 * Human-readable skill descriptions, generated from the effect data
 * (brief §6, §9).
 *
 * Deliberately *derived* rather than authored. A hand-written
 * description is a second source of truth that drifts the moment someone
 * retunes a number — and a skill whose tooltip promises something its
 * effects do not do is exactly the kind of plausible-looking lie the
 * brief forbids. Generating from the same `effects` array the simulation
 * executes makes the description wrong only if the skill is wrong.
 *
 * Descriptions are **attribute-aware**: given the ranks a character has
 * actually allocated, they report the real numbers that character will
 * see, and separately the range across the whole rank scale so a player
 * can tell what investing more would buy.
 */

export interface MagnitudeDescription {
  /** Value at the character's current ranks. */
  readonly current: number;
  /** Value at rank 0, if this magnitude scales. */
  readonly atZero: number | undefined;
  /** Value at rank 12, if this magnitude scales. */
  readonly atTwelve: number | undefined;
  /** The attribute driving it, if any. */
  readonly attributeId: string | undefined;
}

/**
 * A piece of a line (#1932): plain prose, or a number an attribute
 * scales, which the client draws apart from the prose.
 */
export type DescriptionPart = string | { readonly scaled: string; readonly attributeId: string };

export interface EffectDescription {
  /** One line of plain prose, e.g. "Deals 91 damage". */
  readonly text: string;
  /** `text`, split at its scaled numbers: joined, they are `text`. */
  readonly parts: readonly DescriptionPart[];
  /** Present when the line's number is attribute-scaled. */
  readonly magnitude: MagnitudeDescription | undefined;
}

export interface SkillDescription {
  readonly id: string;
  readonly name: string;
  /**
   * What kind of skill it is, as GW1 words it: "Signet.", "Hex Spell."
   * (#524), "Elite Attack." (#459).
   */
  readonly typeText: string;
  /** Drawn with the gold frame (#459). */
  readonly elite: boolean;
  /**
   * The weapon an attack skill needs (#417): "Axe attack", "Bow attack",
   * "Melee attack"; `undefined` for any other skill.
   */
  readonly weaponText: string | undefined;
  /** `undefined` for a "No Attribute" skill (#445). */
  readonly attributeId: string | undefined;
  /** e.g. "Fire Magic", or the raw id if the attribute is unknown; `undefined` with no attribute. */
  readonly attributeName: string | undefined;
  /** Effects, one line each. */
  readonly effects: readonly EffectDescription[];
  /** Cost/cast/recharge/range, already formatted for display. */
  readonly cost: string;
  readonly castTime: string;
  readonly recharge: string;
  /** Absent when the skill has no reach of its own (a self skill). */
  readonly rangeText: string | undefined;
  readonly targetText: string;
  /** True when at least one effect scales with an attribute. */
  readonly scalesWithAttribute: boolean;
  /**
   * The one number that matters at these ranks, which a library card
   * leads with (#567): "91 damage", "heals 45", "+5 energy". An effect the
   * attribute scales wins over a flat one; `undefined` with no number.
   */
  readonly headline: string | undefined;
  /** `headline`, split at its scaled numbers. */
  readonly headlineParts: readonly DescriptionPart[] | undefined;
}

/** An effect line as it is built, its scaled numbers still marked; `describeSkill` splits it. */
type Line = Omit<EffectDescription, "parts">;

function describeMagnitude(
  magnitude: Magnitude,
  ranks: ReadonlyMap<string, number>,
): MagnitudeDescription {
  const current = resolveMagnitudeAtRanks(magnitude, ranks);
  if ("flat" in magnitude) {
    return { current, atZero: undefined, atTwelve: undefined, attributeId: undefined };
  }
  if ("byLevel" in magnitude) {
    const { attributeId } = magnitude.byLevel.level;
    return {
      current,
      atZero: resolveMagnitudeAtRanks(magnitude, new Map([[attributeId, 0]])),
      atTwelve: resolveMagnitudeAtRanks(magnitude, new Map([[attributeId, 12]])),
      attributeId,
    };
  }
  return {
    current,
    atZero: magnitude.scaling.atZero,
    atTwelve: magnitude.scaling.atTwelve,
    attributeId: magnitude.scaling.attributeId,
  };
}

// A scaled number travels inside the prose between these two marks,
// as "\u0001attribute\u0001number\u0002", until a public exit splits
// it out (#1932). They never leave this file.
const MARK = "\u0001";
const END = "\u0002";
const MARKED = new RegExp(`${MARK}([^${MARK}${END}]*)${MARK}([^${MARK}${END}]*)${END}`, "g");

/** `formatted`, marked as the number `attributeId` scales. */
function marked(attributeId: string, formatted: string): string {
  return `${MARK}${attributeId}${MARK}${formatted}${END}`;
}

/** `magnitude`'s number, `formatted` if it is not the plain one, marked when it scales. */
function shown(magnitude: MagnitudeDescription, formatted = String(magnitude.current)): string {
  return magnitude.atZero === undefined || magnitude.attributeId === undefined
    ? formatted
    : marked(magnitude.attributeId, formatted);
}

/** Marked prose split into its parts. */
function partsOf(text: string): DescriptionPart[] {
  const parts: DescriptionPart[] = [];
  let from = 0;
  for (const match of text.matchAll(MARKED)) {
    if (match.index > from) {
      parts.push(text.slice(from, match.index));
    }
    parts.push({ scaled: match[2] ?? "", attributeId: match[1] ?? "" });
    from = match.index + match[0].length;
  }
  if (from < text.length) {
    parts.push(text.slice(from));
  }
  return parts;
}

/** Marked prose as plain prose. */
function plain(text: string): string {
  return text.replace(MARKED, "$2");
}

function seconds(value: number): string {
  // Whole seconds read better than "2.0s"; fractions keep one decimal.
  return Number.isInteger(value) ? `${String(value)}s` : `${value.toFixed(1)}s`;
}

/** The Spawning Power rank these ranks hold (#1098). */
function spawningPowerOf(ranks: ReadonlyMap<string, number>): number {
  return rankOf(outsideMatch(ranks), SPAWNING_POWER_ATTRIBUTE);
}

/**
 * "31.1s (21s)": how long a status lasts at these ranks, the base in
 * brackets when Spawning Power lengthens a weapon spell (#1098).
 */
function statusDuration(effect: ApplyStatusEffect, ranks: ReadonlyMap<string, number>): string {
  if (findStatusDefinition(effect.statusId)?.category !== "weapon-spell") {
    return seconds(effect.durationSeconds);
  }
  const lasts = effect.durationSeconds * spawningPowerMultiplier(spawningPowerOf(ranks));
  return lasts === effect.durationSeconds
    ? seconds(effect.durationSeconds)
    : `${seconds(lasts)} (${seconds(effect.durationSeconds)})`;
}

function statusName(id: string): string {
  return findStatusDefinition(id)?.name ?? id;
}

const BLOCKED_ATTACKS: Record<"all" | "melee" | "projectile", string> = {
  all: "attacks",
  melee: "melee attacks",
  projectile: "projectiles",
};

/**
 * The attributes a `scope` holds (#1929, #1941): "attributes", "primary
 * attribute", "elemental attributes", "Ritualist attributes", "Marksmanship".
 */
function scopeText(scope: AttributeScope): string {
  if (typeof scope === "object") {
    return "profession" in scope
      ? `${getProfession(scope.profession).name} attributes`
      : (getAttribute(scope.attributeId)?.name ?? scope.attributeId);
  }
  return scope === "all" ? "attributes" : `${scope} attribute${scope === "primary" ? "" : "s"}`;
}

/**
 * A scope before a noun (#1951): "Fire Magic skill", "elemental hex",
 * "Ritualist spell".
 */
function scopeAdjective(scope: AttributeScope): string {
  if (typeof scope === "object") {
    return "profession" in scope
      ? getProfession(scope.profession).name
      : (getAttribute(scope.attributeId)?.name ?? scope.attributeId);
  }
  return scope === "all" ? "" : scope;
}

/** What an `attributeSet` does (#1929): "attributes set to 0", "elemental attributes set to 13". */
function attributeSetText({ scope, rank }: AttributeSet): string {
  return `${scopeText(scope)} set to ${String(rank)}`;
}

/** What an attribute delta does (#762, #1941): "−1 to all attributes", "+1 to Marksmanship". */
function attributeDeltaText({ scope, amount }: AttributeDelta): string {
  return `${signed(amount)} to ${scope === "all" ? "all attributes" : scopeText(scope)}`;
}

/** `n` with its sign, a minus as GW1 prints it: "+3", "−66". */
function signed(n: number): string {
  return n > 0 ? `+${String(n)}` : `−${String(-n)}`;
}

/**
 * A change in how fast adrenaline builds: "gain adrenaline 33% faster",
 * or, slowed, as Soothing's (#1550), "gain adrenaline 50% slower".
 */
function adrenalineGainText(faster: number): string {
  const percent = String(Math.round(Math.abs(faster) * 100));
  return `gain adrenaline ${percent}% ${faster > 0 ? "faster" : "slower"}`;
}

/**
 * A status stat as its line prints it (#1976), through `format`: at
 * `ranks`, or GW1's "90...258" across ranks 0 and 12 with none to read.
 */
function statText(
  stat: StatusStat,
  ranks: ReadonlyMap<string, number> | undefined,
  format: (value: number) => string,
): string {
  if (typeof stat === "number") {
    return format(stat);
  }
  if (ranks === undefined) {
    return `${format(stat.scaling.atZero)}...${format(stat.scaling.atTwelve)}`;
  }
  return marked(stat.scaling.attributeId, format(statAt(stat, ranks)));
}

function whole(value: number): string {
  return String(Math.abs(Math.round(value)));
}

/**
 * What a status actually does, so a tooltip does not just name it.
 * `ranks` are its caster's, for a trigger an attribute scales (#944),
 * Patient Spirit's heal, and for a stat (#1976), Endure Pain's Health.
 * Without them, as for a status on a bearer, whose source's ranks the
 * client does not have, a trigger reads at rank 0 and a stat as its range.
 */
export function describeStatus(id: string, ranks?: ReadonlyMap<string, number>): string {
  return plain(statusText(id, ranks));
}

/** `describeStatus`, its scaled numbers still marked for the skill line it sits in. */
function statusText(id: string, ranks: ReadonlyMap<string, number> | undefined): string {
  const definition = findStatusDefinition(id);
  if (definition === undefined) {
    return id;
  }
  const triggerRanks = ranks ?? NO_RANKS;
  const healthPips = statAtTwelve(definition.healthPips);
  const armorModifier = statAtTwelve(definition.armorModifier);
  const physicalDamageTakenBonus = statAtTwelve(definition.physicalDamageTakenBonus);
  const attackDurationMultiplier = statAtTwelve(definition.attackDurationMultiplier);
  const parts: string[] = [];
  // In pips, as GW1 words it: "−3 Health degeneration".
  if (healthPips < 0) {
    parts.push(`−${statText(definition.healthPips, ranks, whole)} Health degeneration`);
  }
  if (healthPips > 0) {
    parts.push(`+${statText(definition.healthPips, ranks, whole)} Health regeneration`);
  }
  if (definition.healthPipsPerEnchantment !== undefined) {
    const { pips, max } = definition.healthPipsPerEnchantment;
    parts.push(
      `+${String(pips)} Health regeneration for each enchantment on you (at most ${String(max)})`,
    );
  }
  if (definition.energyPips < 0) {
    parts.push(`−${String(-definition.energyPips)} Energy degeneration`);
  }
  if (definition.energyPips > 0) {
    parts.push(`+${String(definition.energyPips)} Energy regeneration`);
  }
  if (armorModifier !== 0) {
    const sign = armorModifier > 0 ? "+" : "-";
    parts.push(`${sign}${statText(definition.armorModifier, ranks, whole)} armor`);
  }
  for (const bonus of definition.conditionalArmor) {
    parts.push(statusArmorText(bonus));
  }
  if (definition.armorWhileStill !== 0) {
    parts.push(`${signed(definition.armorWhileStill)} armor while not moving`);
  }
  if (definition.healthPerSecondWhileMoving !== 0) {
    parts.push(`${String(definition.healthPerSecondWhileMoving)} Health per second while moving`);
  }
  if (definition.healthPerSecond !== 0) {
    parts.push(`+${String(definition.healthPerSecond)} Health per second`);
  }
  if (definition.healthPerSecondNearSpirit !== 0) {
    parts.push(
      `+${String(definition.healthPerSecondNearSpirit)} Health per second more in earshot of a spirit`,
    );
  }
  if (definition.armorReduction !== undefined) {
    const { amount, floor } = definition.armorReduction;
    parts.push(`−${String(amount)} armor (not below ${String(floor)})`);
  }
  if (definition.moveSpeedMultiplier !== 1) {
    parts.push(`moves at ${String(Math.round(definition.moveSpeedMultiplier * 100))}% speed`);
  }
  if (definition.preventsSpeedBoosts) {
    parts.push("speed boosts have no effect");
  }
  if (definition.returnsSource !== undefined) {
    parts.push("when this ends, you return to where you cast it");
  }
  if (definition.stepsToTarget !== undefined) {
    const seconds = String(definition.stepsToTarget.disableSeconds);
    parts.push(
      `when this ends, you Shadow Step to the ally you cast it on, and all of your skills are disabled for ${seconds} seconds`,
    );
  }
  if (definition.attackMissChance !== 0) {
    parts.push(`${String(Math.round(definition.attackMissChance * 100))}% of attacks miss`);
  }
  if (definition.maxHealthLoss !== undefined) {
    const { fraction, cap } = definition.maxHealthLoss;
    parts.push(`−${String(Math.round(fraction * 100))}% maximum health (at most ${String(cap)})`);
  }
  if (statAtTwelve(definition.maxHealthBonus) !== 0) {
    parts.push(`+${statText(definition.maxHealthBonus, ranks, whole)} maximum health`);
  }
  if (definition.maxHealthBonusPerEnchantment !== 0) {
    parts.push(
      `+${String(definition.maxHealthBonusPerEnchantment)} maximum health per enchantment`,
    );
  }
  if (definition.maxEnergyBonus !== 0) {
    parts.push(`+${String(definition.maxEnergyBonus)} maximum energy`);
  }
  if (definition.minionDamageBonus !== 0) {
    parts.push(`your minions deal ${signed(definition.minionDamageBonus)} damage`);
  }
  if (definition.minionHitHealthLossPercent !== 0) {
    parts.push(
      `lose ${String(definition.minionHitHealthLossPercent)}% maximum health each time a minion of yours hits`,
    );
  }
  if (definition.redirectsConditionsToMinion) {
    parts.push("conditions you would receive go to your closest minion instead");
  }
  if (definition.healingMultiplier !== 1) {
    const change = Math.round((definition.healingMultiplier - 1) * 100);
    parts.push(`${change > 0 ? "+" : "−"}${String(Math.abs(change))}% healing`);
  }
  if (definition.weaponDamageMultiplier !== 1) {
    const change = Math.round((definition.weaponDamageMultiplier - 1) * 100);
    parts.push(`${signed(change)}% weapon damage`);
  }
  if (physicalDamageTakenBonus !== 0) {
    const sign = physicalDamageTakenBonus > 0 ? "+" : "−";
    const amount = statText(definition.physicalDamageTakenBonus, ranks, whole);
    parts.push(`take ${sign}${amount} from physical damage`);
  }
  if (definition.elementalDamageTakenAs !== undefined) {
    parts.push(`elemental damage taken is ${definition.elementalDamageTakenAs} damage`);
  }
  if (definition.physicalDamageDealtAs !== undefined) {
    parts.push(`physical damage dealt is ${definition.physicalDamageDealtAs} damage`);
  }
  if (definition.damageFromSpiritAttacks !== 0) {
    parts.push(`take ${signed(definition.damageFromSpiritAttacks)} from spirits' attacks`);
  }
  if (definition.attackDamageType !== undefined) {
    const weapon = definition.attackDamageTypeWeapon;
    parts.push(
      `${weapon === undefined ? "attacks" : `${weapon} attacks`} deal ${definition.attackDamageType} damage`,
    );
  }
  if (definition.attackArmorPenetration !== 0) {
    parts.push(
      `attacks have ${String(Math.round(definition.attackArmorPenetration * 100))}% armor penetration`,
    );
  }
  if (definition.attackDamageDelta !== 0) {
    const weapon = definition.attackDamageDeltaWeapon;
    const delta = definition.attackDamageDelta;
    parts.push(
      `${weapon === undefined ? "attacks" : `${weapon} attacks`} deal ${String(Math.abs(delta))} ${delta < 0 ? "less" : "more"} damage`,
    );
  }
  if (definition.immuneTo.length > 0) {
    const names = definition.immuneTo.map((id) => getStatusDefinition(id).name);
    parts.push(`immune to ${names.join(" and ")}`);
  }
  if (definition.adrenalineGainFaster !== 0) {
    parts.push(adrenalineGainText(definition.adrenalineGainFaster));
  }
  parts.push(...definition.attributeDeltas.map(attributeDeltaText));
  if (definition.attributeSet !== undefined) {
    parts.push(attributeSetText(definition.attributeSet));
  }
  if (definition.borrowsAttribute !== undefined) {
    const { attributeId, spells } = definition.borrowsAttribute;
    const name = getAttribute(attributeId)?.name ?? attributeId;
    const next = spells === 1 ? "spell uses" : `${String(spells)} spells use`;
    parts.push(`your next ${next} ${name}`);
  }
  if (definition.castTimeMultiplier !== 1) {
    parts.push(`spells take ${String(definition.castTimeMultiplier)}× as long to cast`);
  }
  if (definition.skillActivationMultiplier !== 1) {
    parts.push(
      `skills but attacks take ${String(definition.skillActivationMultiplier)}× as long to activate`,
    );
  }
  if (definition.interruptsSpells) {
    parts.push("spells are interrupted by attacks");
  }
  if (attackDurationMultiplier !== 1) {
    // GW1's wording: "50% slower" is 1.5× as long, "33% faster" is 0.67×.
    const change = statText(definition.attackDurationMultiplier, ranks, (multiplier) =>
      String(Math.round(Math.abs(multiplier - 1) * 100)),
    );
    const way = attackDurationMultiplier > 1 ? "slower" : "faster";
    parts.push(`attacks ${change}% ${way}`);
  }
  if (definition.projectileSpeedMultiplier !== 1) {
    parts.push(`arrows move ${String(definition.projectileSpeedMultiplier)}× as fast`);
  }
  if (definition.preventsSpells) {
    parts.push("cannot cast spells");
  }
  if (definition.preventsAttacks) {
    parts.push("cannot attack");
  }
  if (definition.preventsResurrection) {
    parts.push("cannot use resurrection skills");
  }
  if (definition.untargetableByFoeSpells) {
    parts.push("cannot be the target of enemy spells");
  }
  // Shadow Form's (#1951).
  if (definition.foeSpellsFail) {
    parts.push("hostile spells targeting you fail");
  }
  if (definition.attacksAgainstMiss) {
    parts.push("attacks against you miss");
  }
  if (definition.preventsEnchantments) {
    parts.push("stripped of all enchantments, and cannot be enchanted");
  }
  if (definition.preventsShoutsAndChants) {
    parts.push("cannot use shouts or chants");
  }
  if (definition.unblockableBySource) {
    parts.push("cannot block its caster's attacks");
  }
  if (definition.preventsBlocking) {
    parts.push("cannot block");
  }
  if (definition.renewsWhileMoving !== undefined) {
    parts.push(
      `renewed for ${String(definition.renewsWhileMoving)} seconds if moving as it would end`,
    );
  }
  if (definition.preventsKnockdown) {
    parts.push("cannot be knocked down");
  }
  if (definition.endsOnKnockdownPrevented) {
    parts.push("ends if it prevents a knockdown");
  }
  if (definition.ignoresCriticalDamage) {
    parts.push("you do not suffer extra damage from a critical attack");
  }
  if (definition.block !== undefined) {
    // Wary Stance's "attack skills" (#1978).
    const what =
      definition.block.attackSkillsOnly === true
        ? "attack skills"
        : BLOCKED_ATTACKS[definition.block.against];
    const below =
      definition.blockBelowHealth === undefined
        ? ""
        : ` while below ${String(Math.round(definition.blockBelowHealth * 100))}% Health`;
    // Soldier's Defense's "while under a shout or chant" (#1978).
    const under =
      definition.blockWhileUnder === undefined
        ? ""
        : ` while under ${[
            ...definition.blockWhileUnder.categories.map(aCategory),
            ...definition.blockWhileUnder.statusIds.map(statusName),
          ].join(" or ")}`;
    parts.push(
      `${String(Math.round(definition.block.chance * 100))}% chance to block ${what}${below}${under}`,
    );
  }
  if (definition.criticalChanceBonus !== 0) {
    parts.push(`${signed(Math.round(definition.criticalChanceBonus * 100))}% critical chance`);
  }
  if (definition.energyPerCritical !== 0) {
    parts.push(`gain ${String(definition.energyPerCritical)} Energy per critical hit`);
  }
  if (definition.healthPerCritical !== 0) {
    parts.push(
      `whenever you successfully land a critical hit, you gain ${String(definition.healthPerCritical)} Health`,
    );
  }
  if (definition.refreshesOnCritical) {
    parts.push("refreshes every time you land a critical hit");
  }
  if (definition.endsAfterAttacks !== undefined) {
    const plural = definition.endsAfterAttacks === 1 ? "" : "s";
    parts.push(`ends after ${String(definition.endsAfterAttacks)} incoming attack${plural}`);
  }
  if (definition.endsAfterAttackCount !== undefined) {
    const plural = definition.endsAfterAttackCount === 1 ? "" : "s";
    parts.push(
      `ends after your next ${String(definition.endsAfterAttackCount)} attack${plural}, hit, miss or block`,
    );
  }
  if (definition.suppressedWhileUnder !== undefined) {
    parts.push(
      `no effect while under ${definition.suppressedWhileUnder.map(aCategory).join(" or ")}`,
    );
  }
  if (definition.unblockableAttacks !== undefined) {
    const plural = definition.unblockableAttacks === 1 ? "" : "s";
    parts.push(
      `your next ${String(definition.unblockableAttacks)} attack${plural} cannot be blocked`,
    );
  }
  if (definition.attacksUnblockable) {
    parts.push("attacks cannot be blocked");
  }
  if (definition.onAttackHit !== undefined) {
    const { effects, attackSkillsOnly, weapon } = definition.onAttackHit;
    parts.push(
      ...describeAttackHits(
        effects,
        attackSkillsOnly,
        weapon,
        definition.category !== "weapon-spell",
        triggerRanks,
      ),
    );
  }
  if (definition.onAttackBlocked !== undefined) {
    const { effects, attackSkillsOnly, weapon } = definition.onAttackBlocked;
    parts.push(...describeAttackBlocks(effects, attackSkillsOnly, weapon, triggerRanks));
  }
  if (definition.endsAfterHits !== undefined) {
    const { count, weapon } = definition.endsAfterHits;
    const plural = count === 1 ? "" : "s";
    const how = weapon === undefined ? "" : ` with ${NEEDED_WEAPON[weapon]}`;
    parts.push(`ends after ${String(count)} hit${plural}${how}`);
  }
  if (definition.nextSpells !== undefined) {
    const { count, costReduction, noOvercast } = definition.nextSpells;
    if (costReduction > 0) {
      const spells = count === 1 ? "spell costs" : `${String(count)} spells cost`;
      parts.push(`your next ${spells} ${String(costReduction)} less energy`);
    } else {
      // Glyph of Elemental Power's (#1941): a boost for the next spells alone.
      parts.push(`for your next ${count === 1 ? "spell" : `${String(count)} spells`}`);
    }
    if (noOvercast) {
      parts.push("no Overcast");
    }
  }
  if (definition.spreads) {
    parts.push("spreads to adjacent combatants");
  }
  for (const effect of definition.nextAttackSkill ?? []) {
    parts.push(...describeNextAttackSkill(effect, triggerRanks));
  }
  if (definition.nextAttackSkillBonus !== undefined) {
    const { condition, amount } = definition.nextAttackSkillBonus;
    const more = describeMagnitude(amount, triggerRanks);
    parts.push(`next attack skill: ${conditionText(condition)}: +${shown(more)} damage`);
  }
  if (definition.nextSkill !== undefined) {
    parts.push(...describeNextSkill(definition.nextSkill, triggerRanks));
  }
  if (definition.nextSkillRule !== undefined) {
    parts.push(...describeNextSkillRule(definition.nextSkillRule));
  }
  if (definition.endsWhenBearerAttacks) {
    parts.push("ends if the bearer attacks");
  }
  if (definition.endsWhenBearerAttacksInMelee) {
    parts.push("ends if the bearer makes a melee attack");
  }
  if (statAtTwelve(definition.damageTakenMultiplier) !== 1) {
    parts.push(`takes ${statText(definition.damageTakenMultiplier, ranks, damageTaken)} damage`);
  }
  if (definition.damageReduction > 0) {
    parts.push(`−${String(definition.damageReduction)} damage taken`);
  }
  if (definition.damageReductionPerRank !== undefined) {
    const { attributeId, perRank, max } = definition.damageReductionPerRank;
    const now = Math.min(max, perRank * (triggerRanks.get(attributeId) ?? 0));
    const attribute = getAttribute(attributeId)?.name ?? attributeId;
    parts.push(
      `−${String(now)} damage taken (${String(perRank)} per rank of ${attribute}, at most ${String(max)})`,
    );
  }
  if (definition.damageReductionWhileCasting !== undefined) {
    const { skillType, amount } = definition.damageReductionWhileCasting;
    parts.push(`−${String(amount)} damage taken while casting ${skillType.replaceAll("-", " ")}s`);
  }
  // The elemental mantras' (#1964).
  if (definition.damageTypeTakenMultiplier !== undefined) {
    const { type, multiplier } = definition.damageTypeTakenMultiplier;
    parts.push(`${String(Math.round((1 - multiplier) * 100))}% less ${type} damage`);
  }
  // Mist Form's (#1951).
  if (definition.damageReductionFromHexedSource !== undefined) {
    const { attributeId, fraction } = definition.damageReductionFromHexedSource;
    parts.push(
      `${String(Math.round(fraction * 100))}% less damage from foes with a ${getAttribute(attributeId)?.name ?? attributeId} hex`,
    );
  }
  if (definition.redirectsPhysicalDamage > 0) {
    parts.push(
      `${share(definition.redirectsPhysicalDamage)} its physical damage goes to its caster`,
    );
  }
  if (definition.maxDamageFractionPerHit !== undefined) {
    parts.push(
      `damage from a single hit is capped at ${String(Math.round(definition.maxDamageFractionPerHit * 100))}% of max health`,
    );
  }
  if (definition.attackDamageCapFraction !== undefined) {
    parts.push(
      `damage from a single attack is capped at ${String(Math.round(definition.attackDamageCapFraction * 100))}% of max health`,
    );
  }
  if (definition.lifeStealReduction > 0) {
    parts.push(`−${String(definition.lifeStealReduction)} life stolen`);
  }
  if (definition.sacrificeMultiplier !== 1) {
    parts.push(
      `your Health sacrifices are ${String(Math.round((definition.sacrificeMultiplier - 1) * 100))}% larger`,
    );
  }
  if (definition.knockdownMinSeconds !== undefined) {
    parts.push(`knockdowns last at least ${String(definition.knockdownMinSeconds)}s`);
  }
  if (definition.sourceLosesHealth !== undefined) {
    parts.push(`its spirit loses ${String(definition.sourceLosesHealth)} health each time`);
  }
  if (definition.renewsOnChantOrShoutEnd) {
    parts.push("renewed whenever a chant or shout ends on it");
  }
  if (definition.renewsOnBearerSpell) {
    parts.push("renewed whenever it casts a spell");
  }
  if (definition.chantShoutDurationMultiplier !== 1) {
    const longer = Math.round((definition.chantShoutDurationMultiplier - 1) * 100);
    parts.push(`chants and shouts last ${String(longer)}% longer on it`);
  }
  // Soldier's Fury's (#1485): "while under a shout or chant: attacks 33%
  // faster, gain adrenaline 33% faster".
  if (definition.whileUnder !== undefined) {
    const {
      categories,
      statusIds,
      attackDurationMultiplier,
      adrenalineGainFaster,
      healthPips,
      armorModifier,
      attackMissChance,
    } = definition.whileUnder;
    const gains = [
      ...(attackMissChance === 0
        ? []
        : [`${String(Math.round(attackMissChance * 100))}% of attacks miss`]),
      ...(healthPips === 0 ? [] : [`${signed(healthPips)} Health regeneration`]),
      ...(armorModifier === 0 ? [] : [`${signed(armorModifier)} armor`]),
      ...(attackDurationMultiplier === 1
        ? []
        : [`attacks ${String(Math.round((1 - attackDurationMultiplier) * 100))}% faster`]),
      ...(adrenalineGainFaster === 0 ? [] : [adrenalineGainText(adrenalineGainFaster)]),
    ];
    // Toxicity's (#1873): "while under Poison or Disease".
    const under = [
      ...(categories.length === 0 ? [] : [`a ${categories.join(" or ")}`]),
      ...statusIds.map((id) => getStatusDefinition(id).name),
    ];
    parts.push(`while under ${under.join(" or ")}: ${gains.join(", ")}`);
  }
  if (definition.endsAfterTriggers !== undefined) {
    // Shield Guardian's (#1974): "ends after it takes effect once".
    const times =
      definition.endsAfterTriggers === 1 ? "once" : `${String(definition.endsAfterTriggers)} times`;
    parts.push(`ends after it takes effect ${times}`);
  }
  if (definition.breaksNextHex !== undefined) {
    parts.push(
      `the next hex fails, and its caster takes ${String(definition.breaksNextHex.damage)} damage`,
    );
  }
  // Guilt's (#1475): "the next spell it casts at a foe fails: steals up to
  // 12 energy".
  if (definition.failsNextSpell !== undefined) {
    const { on, effects } = definition.failsNextSpell;
    const what = effects
      .flatMap((effect) => describeEffects(effect, triggerRanks))
      .map(({ text }) => lowerFirst(text));
    parts.push(
      `the next spell it casts at ${on === "foe-targeted" ? "a foe" : "an ally"} fails: ${what.join(", ")}`,
    );
  }
  // "Can't Touch This!"'s (#1966).
  if (definition.failsFoeTouchSkills !== undefined) {
    parts.push(
      `the next ${String(definition.failsFoeTouchSkills)} touch skills used against you fail`,
    );
  }
  // Wastrel's Demise's (#1501): "each second, it and adjacent foes take 8
  // damage, 8 more each second".
  // Balthazar's Aura's (#1754): "each second, adjacent foes take 26 holy
  // damage".
  if (definition.damagePulse !== undefined) {
    const { damage, growth, type, radius, hitsBearer } = definition.damagePulse;
    const area = AREA_TEXT.get(radius);
    const foes = area === undefined ? `foes within ${String(radius)}` : `${area} foes`;
    const kind = type === "typeless" ? "" : ` ${type}`;
    const more = growth === 0 ? "" : `, ${String(growth)} more each second`;
    parts.push(
      `each second, ${hitsBearer ? "it and " : ""}${foes} take ${String(damage)}${kind} damage${more}`,
    );
  }
  // Holy Wrath's (#1754): "66% of the damage of the next 8 attacks that
  // hit it goes back to the attacker as holy damage, up to 41".
  if (definition.reflectsAttackDamage !== undefined) {
    const { share, max, type, times } = definition.reflectsAttackDamage;
    const attacks = times === 1 ? "attack" : `${String(times)} attacks`;
    const kind = type === "typeless" ? "" : ` as ${type} damage`;
    parts.push(
      `${String(Math.round(share * 100))}% of the damage of the next ${attacks} that hit it goes back to the attacker${kind}, up to ${String(max)}`,
    );
  }
  if (definition.reversesNextDamage !== undefined) {
    parts.push(
      `the next damage or life steal heals for that much instead, up to ${String(definition.reversesNextDamage)}`,
    );
  }
  if (definition.negatesFatalDamage) {
    parts.push("the next damage or life steal that would kill it is negated");
  }
  if (definition.extraStrikesPerHit > 0) {
    parts.push(
      `gain ${String(definition.extraStrikesPerHit)} more ${definition.extraStrikesPerHit === 1 ? "strike" : "strikes"} of adrenaline per hit`,
    );
  }
  if (definition.skillRechargeFaster !== 0) {
    parts.push(
      `skills recharge ${String(Math.round(definition.skillRechargeFaster * 100))}% faster`,
    );
  }
  if (definition.energyCostMultiplier !== 1) {
    const change = Math.round((definition.energyCostMultiplier - 1) * 100);
    parts.push(`skills cost ${String(Math.abs(change))}% ${change > 0 ? "more" : "less"} Energy`);
  }
  const { spellRechargeFaster, bindingRitualRechargeFaster } = definition;
  if (spellRechargeFaster !== 0 && spellRechargeFaster === bindingRitualRechargeFaster) {
    const faster = String(Math.round(spellRechargeFaster * 100));
    parts.push(`spells and binding rituals recharge ${faster}% faster`);
  } else {
    if (spellRechargeFaster !== 0) {
      parts.push(`spells recharge ${String(Math.round(spellRechargeFaster * 100))}% faster`);
    }
    if (bindingRitualRechargeFaster !== 0) {
      const faster = String(Math.round(bindingRitualRechargeFaster * 100));
      parts.push(`binding rituals recharge ${faster}% faster`);
    }
  }
  if (definition.enchantmentRechargeFaster !== undefined) {
    const { share, profession } = definition.enchantmentRechargeFaster;
    const faster = String(Math.round(share * 100));
    parts.push(`${getProfession(profession).name} enchantments recharge ${faster}% faster`);
  }
  parts.push(...definition.ownSkillModifiers.map(describeOwnSkillModifier));
  if (definition.skillArmorPenetration !== undefined) {
    const { share, profession } = definition.skillArmorPenetration;
    const pierce = String(Math.round(share * 100));
    parts.push(`${getProfession(profession).name} skills have ${pierce}% armor penetration`);
  }
  if (definition.uninterruptible) {
    parts.push("the bearer's skills cannot be interrupted");
  }
  if (definition.interruptGuard?.kind === "once") {
    parts.push("the next time you would be interrupted, you are not");
  }
  if (definition.interruptGuard?.kind === "pay-energy") {
    const amount = String(definition.interruptGuard.amount);
    parts.push(
      `you cannot be interrupted; each time you would be, lose ${amount} Energy or this ends`,
    );
  }
  if (definition.conditionsExpireFaster !== 0) {
    const faster = String(Math.round(definition.conditionsExpireFaster * 100));
    parts.push(`conditions on the bearer expire ${faster}% faster`);
  }
  if (definition.incomingHexCastTimeMultiplier !== 1) {
    const times = String(definition.incomingHexCastTimeMultiplier);
    parts.push(`hexes cast on the bearer take ${times}× as long to cast`);
  }
  if (definition.endsWhenBearerHits) {
    parts.push("ends if the bearer hits with an attack");
  }
  if (definition.endsWhenBearerMisses) {
    parts.push("ends if the bearer fails to hit");
  }
  if (definition.endsWhenBearerHitsWithAttackSkill) {
    parts.push("ends if the bearer hits with an attack skill");
  }
  // One that answers the use says so in its trigger's line (#949).
  if (
    definition.endsWhenBearerUsesSkill &&
    !definition.triggers.some(({ on }) => on === "bearer-uses-skill")
  ) {
    parts.push("ends if you use a skill");
  }
  if (definition.endsWhenBearerUsesAdrenalSkill) {
    parts.push("ends if you use an adrenal skill");
  }
  if (definition.endsWhenBearerUsesAttackSkill) {
    parts.push("ends if you use an attack skill");
  }
  if (definition.endsWhenBearerUsesOtherSkill && definition.nextSkillRule !== undefined) {
    parts.push(
      `ends if you use a skill that is not a ${NEXT_SKILL_KIND[definition.nextSkillRule.which][0]}`,
    );
  }
  if (definition.endsWhenBearerGains.length > 0) {
    const gained = definition.endsWhenBearerGains.map((category) =>
      category === "hex" ? "hexed" : "enchanted",
    );
    parts.push(`ends if the bearer becomes ${gained.join(" or ")}`);
  }
  if (definition.destroysBearerOnExpiry) {
    parts.push("the bearer is destroyed when it expires");
  }
  // A trigger that does nothing but end it (#1748): Pacifism's "ends if
  // the target takes damage".
  const enders = definition.endsWhenTriggered
    ? definition.triggers.filter((trigger) => trigger.effects.length === 0)
    : [];
  // Its holder reads it (#1841): "ends if you cast…" on a self-buff, "it"
  // on a hex or condition.
  const onFoe = definition.category === "hex" || definition.category === "condition";
  for (const trigger of enders) {
    const when = kindBoundWhen(trigger.on, trigger) ?? TRIGGER_WHEN[trigger.on];
    parts.push(onFoe ? `ends if it ${when}` : `ends if you ${secondPerson(when)}`);
  }
  // A trigger that reads "when it ends: removes 1 hex" is a sentence of
  // its own (#944), not one more clause after a comma.
  const sentences: string[] = [];
  for (const { text, clause } of describeTriggers(
    definition.triggers.filter((trigger) => !enders.includes(trigger)),
    triggerRanks,
    definition.endsWhenBearerUsesSkill,
    definition.endsWhenTriggered,
    definition.category === "hex" || definition.category === "condition",
    definition.category === "item",
  )) {
    (clause ? parts : sentences).push(text);
  }
  if (parts.length === 0 && sentences.length === 0) {
    return definition.name;
  }
  return [...(parts.length === 0 ? [] : [parts.join(", ")]), ...sentences]
    .map((text, index) => (index === 0 ? text : `${text.charAt(0).toUpperCase()}${text.slice(1)}`))
    .join(". ");
}

/** GW1's words for a damage-taken multiplier (#919): "double", "half", or "1.5×". */
function damageTaken(multiplier: number): string {
  if (multiplier === 2) {
    return "double";
  }
  if (multiplier === 0.5) {
    return "half";
  }
  // GW1 words the rest as a percentage: Frenzy (PvP)'s "take 160% damage".
  return `${String(Math.round(multiplier * 100))}%`;
}

/**
 * A preparation's riders (#525), as its tooltip says them: "foes your
 * physical attacks hit get Poison for 13s", "bow attacks" for a rider of
 * one weapon class (#1629); a weapon spell's rides every attack (#1654),
 * so it says "attacks". Damage names its type, and a splash of the
 * same damage after it is said with it: Ignite Arrows' "foes your bow
 * attacks hit take 15 fire damage, and so do foes adjacent to them".
 */
function describeAttackHits(
  effects: readonly SkillEffect[],
  attackSkillsOnly: boolean,
  weapon: AttackWeaponClass | undefined,
  physicalOnly: boolean,
  ranks: ReadonlyMap<string, number>,
): string[] {
  const attacks = attackSkillsOnly
    ? `${weapon === undefined ? "" : `${weapon} `}attack skills`
    : `${weapon ?? (physicalOnly ? "physical" : "")} attacks`.trim();
  const parts: string[] = [];
  for (const [index, effect] of effects.entries()) {
    const before = effects[index - 1];
    if (effect.kind === "apply-status") {
      parts.push(
        `foes your ${attacks} hit get ${statusName(effect.statusId)} ` +
          `for ${seconds(effect.durationSeconds)}`,
      );
    } else if (effect.kind === "damage") {
      parts.push(`foes your ${attacks} hit take ${riderDamage(effect, ranks)}`);
    } else if (
      effect.kind === "splash" &&
      effect.hits === "foes" &&
      effect.radius === AREA_ADJACENT &&
      effect.maxTargets === undefined &&
      before?.kind === "damage" &&
      effect.effects.length === 1 &&
      effect.effects[0]?.kind === "damage" &&
      riderDamage(effect.effects[0], ranks) === riderDamage(before, ranks)
    ) {
      parts.push(`${String(parts.pop())}, and so do foes adjacent to them`);
    } else if (effect.kind === "life-steal") {
      // Said of the bearer's attacks, never "your": a spirit's aura
      // steals for the spirit (#1777).
      const amount = shown(describeMagnitude(effect.amount, ranks));
      parts.push(`${attacks} steal up to ${amount} Health`);
    } else if (effect.kind === "heal" && effect.recipient === "owner") {
      // Only a pet bears it (Predatory Bond, #1865), cast from its
      // Ranger's bar: the pet's attacks heal whoever reads this.
      const amount = shown(describeMagnitude(effect.amount, ranks));
      parts.push(`your pet's attacks heal you for ${amount}`);
    } else {
      parts.push(...describeEffects(effect, ranks).map(({ text }) => `your ${attacks}: ${text}`));
    }
  }
  return parts;
}

/**
 * What a status does to foes that block the bearer's attacks (#1974):
 * "foes that block your bow attacks get Bleeding for 18s".
 */
function describeAttackBlocks(
  effects: readonly SkillEffect[],
  attackSkillsOnly: boolean,
  weapon: AttackWeaponClass | undefined,
  ranks: ReadonlyMap<string, number>,
): string[] {
  const attacks = attackSkillsOnly
    ? `${weapon === undefined ? "" : `${weapon} `}attack skills`
    : `${weapon ?? "physical"} attacks`;
  return effects.flatMap((effect) =>
    effect.kind === "apply-status"
      ? [
          `foes that block your ${attacks} get ${statusName(effect.statusId)} ` +
            `for ${seconds(effect.durationSeconds)}`,
        ]
      : describeEffects(effect, ranks).map(
          ({ text }) => `foes that block your ${attacks}: ${lowerFirst(text)}`,
        ),
  );
}

/** A rider's damage: "20 fire damage", "13 damage" when it is typeless. */
function riderDamage(effect: DamageEffect, ranks: ReadonlyMap<string, number>): string {
  const amount = shown(describeMagnitude(effect.amount, ranks));
  return `${amount}${typeWord(effect.type)} damage`;
}

/**
 * A status's typed armor (#1437), as GW1 words it: "+30 elemental armor".
 * Only the damage-type conditions are a status's; any other is a catalog
 * bug, not data.
 */
function statusArmorText(bonus: ConditionalArmor): string {
  const against = bonus.conditions.map((condition) => {
    switch (condition.kind) {
      case "vs-physical":
        return "physical";
      case "vs-elemental":
        return "elemental";
      case "vs-type":
        return condition.type;
      default:
        throw new Error(`a status's armor holds only against a damage type, not ${condition.kind}`);
    }
  });
  return `${signed(bonus.amount)} ${[...against, "armor"].join(" ")}`;
}

/** What the bearer does that a trigger answers, as its tooltip says it. */
export const TRIGGER_WHEN: Record<StatusTriggerEvent, string> = {
  "bearer-casts-spell": "casts a spell",
  "bearer-attacks": "attacks",
  "bearer-attack-begins": "attacks",
  "bearer-uses-skill": "uses a skill",
  "bearer-applies-hex": "applies a hex",
  "bearer-hits": "hits with an attack",
  "bearer-fails-to-hit": "fails to hit",
  "bearer-takes-physical-damage": "takes physical damage",
  "bearer-takes-damage-from-foe": "takes damage or life steal from a foe",
  "bearer-health-drops-below": "has its Health dropped below a line by damage",
  "bearer-fatal-damage-negated": "has fatal damage negated",
  "bearer-hit-by-attack": "is hit by a foe's attack",
  "bearer-healed-by-skill": "is healed by a skill",
  "bearer-blocks-melee": "blocks a melee attack",
  "bearer-blocks-projectile": "blocks a projectile attack",
  "bearer-blocks": "blocks",
  "bearer-interrupted": "is interrupted",
  "bearer-knocked-down": "is knocked down",
  "bearer-gains-hex-or-enchantment": "gains a hex or an enchantment",
  "bearer-gains-enchantment": "gains an enchantment",
  "bearer-loses-enchantment": "loses an enchantment",
  "bearer-loses-condition": "loses a condition",
  "bearer-creates-creature": "creates a creature",
  "bearer-gains-condition": "gains a new condition",
  "bearer-chant-or-shout-ends": "has a chant or shout end on it",
  "bearer-energy-empty": "has no energy left",
  "bearer-energy-drops-empty": "drops to 0 Energy",
  "bearer-dies": "dies",
  ends: "ends",
  "ends-early": "ends prematurely",
  expires: "expires",
};

/** A third-person leading verb (#1841), in the second person. */
const SECOND_PERSON: Readonly<Record<string, string>> = {
  applies: "apply",
  attacks: "attack",
  blocks: "block",
  casts: "cast",
  creates: "create",
  dies: "die",
  drops: "drop",
  ends: "end",
  expires: "expire",
  fails: "fail",
  gains: "gain",
  has: "have",
  hits: "hit",
  is: "are",
  loses: "lose",
  takes: "take",
  uses: "use",
};

/**
 * A `TRIGGER_WHEN` or `kindBoundWhen` phrase said to its holder (#1841):
 * "casts a spell" -> "cast a spell", "has its Health dropped" -> "have
 * your Health dropped". A leading word it does not know throws.
 */
export function secondPerson(phrase: string): string {
  const [verb = "", ...rest] = phrase.split(" ");
  const base = SECOND_PERSON[verb];
  if (base === undefined) {
    throw new Error(`no second person for "${phrase}"`);
  }
  return [base, ...rest]
    .join(" ")
    .replace(/^have its /, "have your ")
    .replace(/ on it$/, " on you");
}

/** A trigger's line, and whether it follows a comma or stands alone. */
interface TriggerLine {
  readonly text: string;
  readonly clause: boolean;
}

/**
 * A status's triggers, those that do the same thing said once (#935):
 * Spiteful Spirit's "whenever it uses a skill or attacks". One that ends
 * when its bearer uses a skill answers only the next use (#949), and one
 * that ends when triggered only the next time (#1022).
 */
function describeTriggers(
  triggers: readonly StatusTrigger[],
  ranks: ReadonlyMap<string, number>,
  once: boolean,
  nextOnly: boolean,
  bearerIsFoe: boolean,
  dropped: boolean,
): TriggerLine[] {
  const groups = new Map<string, { trigger: StatusTrigger; on: StatusTriggerEvent[] }>();
  for (const trigger of triggers) {
    const key = JSON.stringify([
      trigger.effects,
      trigger.target,
      trigger.weapon,
      trigger.blocked,
      trigger.profession,
      trigger.usedSkill,
      trigger.damageType,
      trigger.whileUsingSkill,
      trigger.minDamage,
      trigger.healthBelow,
      trigger.appliedHex,
    ]);
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, { trigger, on: [trigger.on] });
    } else {
      group.on.push(trigger.on);
    }
  }
  const whenOf = (event: StatusTriggerEvent, trigger: StatusTrigger): string =>
    trigger.weapon !== undefined
      ? weaponBoundWhen(event, trigger.weapon)
      : (kindBoundWhen(event, trigger) ?? TRIGGER_WHEN[event]);
  return [...groups.values()].flatMap(({ trigger, on }) => {
    if (on.includes("bearer-dies")) {
      return [{ text: describeDeath(trigger, ranks, bearerIsFoe), clause: false }];
    }
    const lines = describeTrigger(
      trigger,
      on.includes("bearer-creates-creature")
        ? CREATES
        : dropped && on.includes("ends")
          ? DROPPED
          : on.includes("bearer-chant-or-shout-ends")
            ? CHANT_OR_SHOUT_ENDS
            : on.includes("bearer-energy-empty")
              ? ENERGY_EMPTY
              : on.includes("ends") || on.includes("ends-early") || on.includes("expires")
                ? `when it ${on.map((event) => whenOf(event, trigger)).join(" or ")}`
                : once && on.includes("bearer-uses-skill")
                  ? NEXT_SKILL
                  : nextOnly
                    ? `the next time it ${on.map((event) => whenOf(event, trigger)).join(" or ")}`
                    : `whenever it ${on.map((event) => whenOf(event, trigger)).join(" or ")}`,
      ranks,
      bearerIsFoe,
    );
    // A heal on the bearer and the same on the allies around (#1951):
    // Mist Form's, said once.
    const [self, splash] = trigger.effects;
    const [first, second] = lines;
    if (
      !dropped &&
      lines.length === 2 &&
      first !== undefined &&
      second !== undefined &&
      self?.kind === "heal" &&
      splash?.kind === "splash" &&
      splash.effects.length === 1 &&
      JSON.stringify(splash.effects[0]) === JSON.stringify(self)
    ) {
      const when = first.text.slice(0, first.text.indexOf(": ") + 2);
      return [{ ...second, text: `${when}you and ${second.text.slice(when.length)}` }];
    }
    // A drop is said once, all it does after it (#1434).
    if (!dropped || lines.length < 2) {
      return lines;
    }
    const healed = partyHealed(trigger.effects, ranks);
    if (healed !== undefined) {
      return [
        { text: `${DROPPED}: you and all party members are healed for ${healed}`, clause: false },
      ];
    }
    const what = lines.map(({ text }) => text.replace(`${DROPPED}: `, ""));
    return [{ text: `${DROPPED}: ${what.join(", ")}`, clause: false }];
  });
}

/**
 * What the bearer does with a weapon that a bound trigger answers
 * (#1354, #1359): "attacks with a sword", "hits with a melee attack".
 */
function weaponBoundWhen(event: StatusTriggerEvent, weapon: AttackWeaponClass): string {
  if (event === "bearer-hits") {
    return weapon === "melee" ? "hits with a melee attack" : `hits with ${NEEDED_WEAPON[weapon]}`;
  }
  return `${TRIGGER_WHEN[event]} with ${NEEDED_WEAPON[weapon]}`;
}

/**
 * A death trigger's (#1762), one sentence in the corpus's words: "if
 * target foe dies while hexed with this, you gain 13 Energy and all your
 * skills are recharged", "if an ally dies while enchanted with this, your
 * party is healed for 41".
 */
function describeDeath(
  trigger: StatusTrigger,
  ranks: ReadonlyMap<string, number>,
  bearerIsFoe: boolean,
): string {
  const amount = (magnitude: Magnitude): string => shown(describeMagnitude(magnitude, ranks));
  const answer = (effect: TriggerEffect): string[] => {
    if (effect.kind === "energy-gain") {
      return [`you gain ${amount(effect.amount)} Energy`];
    }
    if (effect.kind === "recharge-others" && effect.which === "all") {
      return ["all your skills are recharged"];
    }
    if (effect.kind === "splash") {
      return effect.effects.map((inner) =>
        effect.hits === "party" && inner.kind === "heal"
          ? `your party is healed for ${amount(inner.amount)}`
          : inner.kind === "damage"
            ? `${lowerFirst(foesWithin(effect.radius, effect.hits))} take ${amount(inner.amount)}${typeWord(inner.type)} damage`
            : `${lowerFirst(foesWithin(effect.radius, effect.hits))}: ${lowerFirst(describeEffect(inner, ranks).text)}`,
      );
    }
    return effect.kind === "spread-gained-condition" ||
      effect.kind === "echo" ||
      effect.kind === "mirror-stance" ||
      effect.kind === "cancel-attack" ||
      effect.kind === "pay-energy-or-end"
      ? []
      : describeEffects(effect, ranks).map(({ text }) => lowerFirst(text));
  };
  const who = bearerIsFoe
    ? "if target foe dies while hexed with this"
    : "if an ally dies while enchanted with this";
  return `${who}, ${trigger.effects.flatMap(answer).join(" and ")}`;
}

/** An echo's (#1423), in the corpus's words. */
const CHANT_OR_SHOUT_ENDS = "whenever a chant or shout ends on it";

/** An energy-empty trigger's (#1583), in the corpus's words: Wither's. */
const ENERGY_EMPTY = "if its energy reaches 0";

/**
 * The heal of a drop that heals its bearer and then, the same, the rest
 * of the party (#1434): Protective Was Kaolai's "all party members are
 * healed", said as one heal, not two. `undefined`: any other drop.
 */
function partyHealed(
  effects: readonly TriggerEffect[],
  ranks: ReadonlyMap<string, number>,
): string | undefined {
  const [self, splash, ...rest] = effects;
  if (
    rest.length > 0 ||
    self?.kind !== "heal" ||
    splash?.kind !== "splash" ||
    splash.hits !== "party" ||
    splash.effects.length !== 1
  ) {
    return undefined;
  }
  const [party] = splash.effects;
  if (party?.kind !== "heal") {
    return undefined;
  }
  const amount = shown(describeMagnitude(self.amount, ranks));
  return amount === shown(describeMagnitude(party.amount, ranks)) ? amount : undefined;
}

/** An item status's end (#1434), every one a drop: "Drop effect: …". */
const DROPPED = "drop effect";

/**
 * What the bearer does that a trigger bound to a kind of skill or
 * enchantment answers (#1437): "uses a Dervish attack skill", "loses a
 * Dervish enchantment", to a type of damage (#1540): "takes fire damage
 * from a foe", or to a kind of block (#1549): "blocks a melee attack".
 * `undefined`: bound to none.
 */
function kindBoundWhen(event: StatusTriggerEvent, trigger: StatusTrigger): string | undefined {
  // Spinal Shivers' (#1931).
  if (
    event === "bearer-takes-damage-from-foe" &&
    trigger.damageType !== undefined &&
    trigger.whileUsingSkill === true
  ) {
    return `is struck for ${trigger.damageType} damage while using a skill`;
  }
  if (event === "bearer-takes-damage-from-foe" && trigger.damageType !== undefined) {
    return `takes ${trigger.damageType} damage from a foe`;
  }
  // Spirit Bond's (#1754).
  if (event === "bearer-takes-damage-from-foe" && trigger.minDamage !== undefined) {
    return `takes more than ${String(trigger.minDamage)} damage from a foe`;
  }
  // Watchful Intervention's (#1789).
  if (event === "bearer-health-drops-below" && trigger.healthBelow !== undefined) {
    return `has its Health dropped below ${String(Math.round(trigger.healthBelow * 100))}% by damage`;
  }
  if (event === "bearer-blocks" && trigger.blocked !== undefined) {
    return `blocks a ${trigger.blocked} attack`;
  }
  if (event === "bearer-loses-enchantment" && trigger.profession !== undefined) {
    return `loses a ${getProfession(trigger.profession).name} enchantment`;
  }
  // Elemental Flame's (#1951).
  if (event === "bearer-applies-hex" && trigger.appliedHex !== undefined) {
    const words = `${scopeAdjective(trigger.appliedHex.attributes)} hex`;
    return `applies ${/^[aeiou]/i.test(words) ? "an" : "a"} ${words} to a foe`;
  }
  // Mist Form's (#1951).
  if (event === "bearer-casts-spell" && trigger.usedSkill?.attributes !== undefined) {
    const words = `${scopeAdjective(trigger.usedSkill.attributes)} spell`;
    return `casts ${/^[aeiou]/i.test(words) ? "an" : "a"} ${words}`;
  }
  if (event === "bearer-uses-skill" && trigger.usedSkill !== undefined) {
    const { type, attributes, profession, elite, adrenal } = trigger.usedSkill;
    const words = [
      ...(elite === undefined ? [] : ["elite"]),
      ...(adrenal === undefined ? [] : ["adrenal"]),
      ...(profession === undefined ? [] : [getProfession(profession).name]),
      ...(attributes === undefined ? [] : [scopeAdjective(attributes)]),
      ...(type === undefined ? [] : [TYPE_TEXT[type].replace(/\.$/, "").toLowerCase()]),
      "skill",
    ];
    return `uses ${/^[aeiou]/i.test(words[0] ?? "") ? "an" : "a"} ${words.join(" ")}`;
  }
  return undefined;
}

/** The one use a status that ends on it answers (#949), as its tooltip says it. */
const NEXT_SKILL = "the next time it uses a skill";

/**
 * A creation trigger's (#1316), in the corpus's words: the Ritualist
 * wears it, so "you", not "it".
 */
const CREATES = "whenever you create a creature";

/** Where round the new creature a splash reaches: "near that creature" (#1316). */
const AREA_AROUND_CREATED: ReadonlyMap<number, string> = new Map([
  [AREA_ADJACENT, "adjacent to that creature"],
  [AREA_NEARBY, "near that creature"],
  [AREA_EARSHOT, "in earshot of that creature"],
]);

/**
 * What a creation trigger does, one sentence (#1316): "whenever you
 * create a creature: you gain 41 Health and 5 Energy", "up to 5 foes near
 * that creature take 56 lightning damage", "all allies near that creature
 * gain 41 Health and lose 1 condition".
 */
function describeCreation(
  trigger: StatusTrigger,
  when: string,
  ranks: ReadonlyMap<string, number>,
): string {
  const amount = (magnitude: Magnitude): string => shown(describeMagnitude(magnitude, ranks));
  const answer = (effect: TriggerEffect): string => {
    switch (effect.kind) {
      case "heal":
        return `${amount(effect.amount)} Health`;
      case "energy-gain":
        return `${amount(effect.amount)} Energy`;
      case "damage":
        return `take ${amount(effect.amount)}${typeWord(effect.type)} damage`;
      case "remove-status":
        return `lose ${effect.count === "all" ? "all" : String(countAt(effect.count, ranks))} ${effect.category}${effect.count === 1 ? "" : "s"}`;
      case "splash": {
        const side = SPLASH_SIDE[effect.hits];
        const who =
          effect.maxTargets === undefined
            ? `all ${side}`
            : `up to ${String(countAt(effect.maxTargets, ranks))} ${side}`;
        const where =
          AREA_AROUND_CREATED.get(effect.radius) ??
          `within ${String(effect.radius)} of that creature`;
        const what = effect.effects.map((inner) =>
          inner.kind === "heal" ? `gain ${answer(inner)}` : answer(inner),
        );
        return `${who} ${where} ${what.join(" and ")}`;
      }
      // None answers a creation.
      case "spread-gained-condition":
      case "echo":
      case "mirror-stance":
      case "cancel-attack":
      case "pay-energy-or-end":
        return "";
      default:
        return describeEffects(effect, ranks)
          .map(({ text }) => lowerFirst(text))
          .join(", ");
    }
  };
  const gains = trigger.effects.every(({ kind }) => kind === "heal" || kind === "energy-gain");
  const answers = trigger.effects.map(answer).join(" and ");
  return `${when}: ${gains ? `you gain ${answers}` : answers}`;
}

/**
 * A status's answer to its bearer (#469): "takes 119 damage whenever it
 * casts a spell", "heals its caster for 102 when it ends" (#887), "its
 * adjacent allies take 34 damage whenever it takes physical damage"
 * (#935). A `clause` follows a comma; the rest, "when it ends: …",
 * stand alone (#944).
 */
function describeTrigger(
  trigger: StatusTrigger,
  when: string,
  ranks: ReadonlyMap<string, number>,
  bearerIsFoe: boolean,
): TriggerLine[] {
  const amount = (magnitude: Magnitude): string => shown(describeMagnitude(magnitude, ranks));
  const clause = (text: string): TriggerLine => ({ text, clause: true });
  const sentence = (text: string): TriggerLine => ({ text, clause: false });
  // The caster's foes beside a hexed or conditioned bearer are the
  // bearer's allies; beside one wearing its own enchantment, its foes (#1021).
  const splashed = (effect: SplashEffect): string => {
    const area = AREA_TEXT.get(effect.radius);
    return !bearerIsFoe
      ? lowerFirst(foesWithin(effect.radius, effect.hits))
      : area === "adjacent"
        ? "its adjacent allies"
        : `its allies ${area ?? `within ${String(effect.radius)}`}`;
  };
  // A stance's answer to its own block (#1329), in GW1's words.
  if (trigger.on === "bearer-blocks-melee" || trigger.on === "bearer-blocks-projectile") {
    const kind = trigger.on === "bearer-blocks-melee" ? "melee" : "projectile";
    // Shield Guardian's (#1974): a heal on the blocker and, by a splash,
    // the same on its allies around, said once.
    const [self, splash] = trigger.effects;
    if (
      trigger.effects.length === 2 &&
      self?.kind === "heal" &&
      splash?.kind === "splash" &&
      splash.hits === "allies" &&
      JSON.stringify(splash.effects) === JSON.stringify([self])
    ) {
      const area = AREA_TEXT.get(splash.radius) ?? `within ${String(splash.radius)}`;
      return [
        sentence(`when you block, you and allies ${area} are healed for ${amount(self.amount)}`),
      ];
    }
    const answers = trigger.effects.flatMap((effect): TriggerLine[] => {
      // Distortion's (#1974): the block stands, paid or not.
      if (effect.kind === "pay-energy-or-end" && trigger.target === "bearer") {
        return [sentence(`each block costs you ${String(effect.amount)} Energy or this ends`)];
      }
      if (effect.kind === "energy-gain" && trigger.target === "bearer") {
        return [
          sentence(
            `you gain ${amount(effect.amount)} Energy for each successful ${kind} attack blocked`,
          ),
        ];
      }
      if (effect.kind === "damage" && trigger.target === "offender") {
        return [
          sentence(
            `whenever you block a ${kind} attack this way, the attacker suffers ${amount(effect.amount)}${typeWord(effect.type)} damage`,
          ),
        ];
      }
      if (effect.kind === "splash" && trigger.target === "bearer") {
        const foes = `${AREA_TEXT.get(effect.radius) ?? `within ${String(effect.radius)} of you`} foes`;
        return effect.effects.map((inner) =>
          sentence(
            inner.kind === "apply-status"
              ? `if you block a ${kind} attack, ${foes} suffer from ${statusName(inner.statusId)} for ${String(inner.durationSeconds)} seconds`
              : `if you block a ${kind} attack, ${foes}: ${lowerFirst(describeEffect(inner, ranks).text)}`,
          ),
        );
      }
      return [];
    });
    if (answers.length > 0) {
      return answers;
    }
  }
  if (trigger.on === "bearer-creates-creature") {
    return [sentence(describeCreation(trigger, when, ranks))];
  }
  // The bearer on the foe that set it off (#1022), all said at once:
  // "...: steals 68 Health from that foe, loses 2 conditions".
  if (trigger.target === "offender") {
    const answers = trigger.effects.flatMap((effect): string[] => {
      if (effect.kind === "life-steal") {
        return [`steals ${amount(effect.amount)} Health from that foe`];
      }
      if (effect.kind === "remove-status" && effect.from === "caster") {
        const count = effect.count === "all" ? "all" : countAt(effect.count, ranks);
        return [`loses ${String(count)} ${categoryNoun(count, effect.category)}`];
      }
      return effect.kind === "spread-gained-condition" ||
        effect.kind === "echo" ||
        effect.kind === "mirror-stance" ||
        effect.kind === "cancel-attack" ||
        effect.kind === "pay-energy-or-end"
        ? []
        : describeEffects(effect, ranks).map(({ text }) => lowerFirst(text));
    });
    return [sentence(`${when}: ${answers.join(", ")}`)];
  }
  // Clumsiness's (#1593), said as one: "the next time it attacks, that
  // attack is interrupted and it takes 66 damage"; Wandering Eye's
  // (#1627) "...and its allies nearby take 76 damage" after it.
  const [first, ...after] = trigger.effects;
  const hurts = (effect: TriggerEffect): boolean =>
    effect.kind === "damage" ||
    (effect.kind === "splash" && effect.effects.every(({ kind }) => kind === "damage"));
  if (
    first?.kind === "cancel-attack" &&
    trigger.target === "bearer" &&
    after.length > 0 &&
    after.every(hurts)
  ) {
    const hurt = after.map((effect) =>
      effect.kind === "damage"
        ? `it takes ${amount(effect.amount)}${typeWord(effect.type)} damage`
        : effect.kind === "splash"
          ? effect.effects
              .map((inner) =>
                inner.kind === "damage"
                  ? `${splashed(effect)} take ${amount(inner.amount)}${typeWord(inner.type)} damage`
                  : "",
              )
              .join(" and ")
          : "",
    );
    return [sentence(`${when}, that attack is interrupted and ${hurt.join(" and ")}`)];
  }
  // Spinal Shivers' (#1931), said as one: "whenever it is struck for cold
  // damage while using a skill, it is interrupted and you lose 4 Energy or
  // this ends".
  if (
    first?.kind === "pay-energy-or-end" &&
    trigger.target === "bearer" &&
    after.length > 0 &&
    after.every(({ kind }) => kind === "interrupt")
  ) {
    return [
      sentence(
        `${when}, it is interrupted and you lose ${String(first.amount)} Energy or this ends`,
      ),
    ];
  }
  // An attunement's and Aura of Restoration's (#1614), said at once:
  // "whenever it casts a spell: gains 1 energy and is healed for 360% of
  // that skill's energy cost".
  const perCost = trigger.effects.flatMap((effect) =>
    (effect.kind === "energy-gain" && effect.toTarget !== true) || effect.kind === "heal"
      ? [effect]
      : [],
  );
  if (
    trigger.target === "bearer" &&
    perCost.length === trigger.effects.length &&
    perCost.some((effect) => effect.perUsedSkillEnergy === true)
  ) {
    const share = (magnitude: Magnitude): string => {
      const described = describeMagnitude(magnitude, ranks);
      return shown(described, percentOf(described.current));
    };
    const gains = perCost.flatMap((effect) =>
      effect.kind !== "energy-gain"
        ? []
        : effect.perUsedSkillEnergy === true
          ? [`${share(effect.amount)} of that skill's base energy cost`]
          : [`${amount(effect.amount)} energy`],
    );
    const heals = perCost.flatMap((effect) =>
      effect.kind !== "heal"
        ? []
        : effect.perUsedSkillEnergy === true
          ? [`is healed for ${share(effect.amount)} of that skill's energy cost`]
          : [`is healed for ${amount(effect.amount)}`],
    );
    const what = [...(gains.length === 0 ? [] : [`gains ${gains.join(" plus ")}`]), ...heals];
    return [sentence(`${when}: ${what.join(" and ")}`)];
  }
  return trigger.effects.flatMap((effect): TriggerLine[] => {
    if (effect.kind === "spread-gained-condition") {
      return [sentence(`${when}: foes in the area suffer it too`)];
    }
    // "the next time it uses a skill: if a spell, it takes this skill's
    // slot for 20 seconds" (#469).
    if (effect.kind === "echo") {
      const which = effect.spellsOnly ? "if a spell, it" : "that skill";
      return [
        sentence(`${when}: ${which} takes this skill's slot for ${String(effect.seconds)} seconds`),
      ];
    }
    // "whenever target foe enters a stance, you enter the same stance" (#1965).
    if (effect.kind === "mirror-stance") {
      return [sentence(`${when}: you enter the same stance`)];
    }
    if (effect.kind === "pay-energy-or-end") {
      return [sentence(`${when}: you lose ${String(effect.amount)} Energy or this ends`)];
    }
    // A cancel with nothing to say after it (#1593).
    if (effect.kind === "cancel-attack") {
      return [sentence(`${when}, that attack is interrupted`)];
    }
    if (effect.kind === "damage" && trigger.target === "bearer") {
      return [clause(`takes ${amount(effect.amount)}${typeWord(effect.type)} damage ${when}`)];
    }
    // Judge's Intervention's (#1789): "... that would kill it is negated,
    // and the foe who dealt it takes 150 holy damage".
    if (effect.kind === "damage" && trigger.target === "source-on-offender") {
      const then = trigger.on === "bearer-fatal-damage-negated" ? "and" : `${when},`;
      return [
        clause(
          `${then} the foe who dealt it takes ${amount(effect.amount)}${typeWord(effect.type)} damage`,
        ),
      ];
    }
    // Scourge Enchantment's (#1403): "whenever it gains an enchantment,
    // its caster takes 63 holy damage".
    if (effect.kind === "damage" && trigger.target === "gained-source") {
      const gained =
        trigger.on === "bearer-gains-enchantment" ? "enchantment" : "hex or enchantment";
      return [
        clause(
          `${when}, the caster of that ${gained} takes ${amount(effect.amount)}${typeWord(effect.type)} damage`,
        ),
      ];
    }
    // Soul Bind's (#1913): "whenever it is healed by a skill, the healer
    // takes 68 damage".
    if (effect.kind === "damage" && trigger.target === "healer") {
      return [
        clause(`${when}, the healer takes ${amount(effect.amount)}${typeWord(effect.type)} damage`),
      ];
    }
    if (effect.kind === "heal" && trigger.target === "source") {
      return [clause(`heals its caster for ${amount(effect.amount)} ${when}`)];
    }
    // Arcane Conundrum's (#1570): "its caster gains 6 energy when it ends".
    if (effect.kind === "energy-gain" && trigger.target === "source") {
      return [clause(`its caster gains ${amount(effect.amount)} energy ${when}`)];
    }
    if (effect.kind === "lengthen-recharge" && when === NEXT_SKILL) {
      return [
        clause(`the next skill it uses takes ${amount(effect.seconds)} seconds longer to recharge`),
      ];
    }
    if (effect.kind === "life-steal" && trigger.target === "bearer") {
      return [clause(`its caster steals ${amount(effect.amount)} Health ${when}`)];
    }
    if (effect.kind === "splash" && trigger.target === "bearer") {
      const allies = splashed(effect);
      // A drop's splash is one clause (#1434): "foes in the area: deals 63
      // damage, knocks down for 2s".
      if (when === DROPPED) {
        const what = effect.effects.map((inner) =>
          inner.kind === "apply-status"
            ? suffered(inner, ranks)
            : lowerFirst(describeEffect(inner, ranks).text),
        );
        const joint = effect.effects[0]?.kind === "apply-status" ? " " : ": ";
        return [sentence(`${when}: ${allies}${joint}${what.join(", ")}`)];
      }
      return effect.effects.map((inner) =>
        inner.kind === "damage" && when !== DROPPED
          ? clause(`${allies} take ${amount(inner.amount)}${typeWord(inner.type)} damage ${when}`)
          : inner.kind === "apply-status"
            ? sentence(`${when}: ${allies} ${suffered(inner, ranks)}`)
            : sentence(`${when}: ${allies}: ${lowerFirst(describeEffect(inner, ranks).text)}`),
      );
    }
    // The bearer is "it" in its own tooltip (#988): "when it ends, if it
    // is attacking: heals for 88".
    if (effect.kind === "if" && trigger.target === "bearer") {
      const condition = lowerFirst(conditionText(effect.condition).replace(/^If target/, "If it"));
      return effect.effects.map((inner) =>
        sentence(`${when}, ${condition}: ${lowerFirst(describeEffect(inner, ranks).text)}`),
      );
    }
    // Energizing Finale's (#1485): "whenever a chant or shout ends on it:
    // it gains 2 energy".
    return describeEffects(effect, ranks).map(({ text }) =>
      sentence(
        `${when}: ${lowerFirst(trigger.target === "bearer" ? text.replace(/^Target gains/, "it gains") : text)}`,
      ),
    );
  });
}

/** A chant's rider (#758), as its tooltip says it: "next attack skill: …". */
function describeNextAttackSkill(
  effect: SkillEffect,
  ranks: ReadonlyMap<string, number>,
): string[] {
  if (effect.kind === "apply-status") {
    return [`next attack skill: ${statusName(effect.statusId)} ${seconds(effect.durationSeconds)}`];
  }
  return describeEffects(effect, ranks).map(({ text }) => `next attack skill: ${text}`);
}

/** What each of a chant's next skills of a kind does (#1483): "with your next spell: gain 5 Energy". */
const NEXT_SKILL_KIND: Readonly<Record<NextSkill["which"], readonly [string, string]>> = {
  "attack-skill": ["attack skill", "attack skills"],
  spell: ["spell", "spells"],
  signet: ["signet", "signets"],
  "shout-or-chant": ["shout or chant", "shouts or chants"],
  any: ["skill", "skills"],
};

function describeNextSkill(
  { which, count, effects }: NextSkill,
  ranks: ReadonlyMap<string, number>,
): string[] {
  const [one, many] = NEXT_SKILL_KIND[which];
  const next = count === 1 ? one : `${String(count)} ${many}`;
  return effects.flatMap((effect) =>
    describeEffects(effect, ranks).map(({ text }) => `with your next ${next}: ${lowerFirst(text)}`),
  );
}

/**
 * How a status changes its bearer's own skills of a kind (#1761): "your
 * Monk spells cost 5 less Energy (minimum 1)", "your next Dervish
 * enchantment lasts 122% longer".
 */
function describeOwnSkillModifier({
  filter,
  energyBase,
  energyDiscount,
  energyFloor,
  energySurcharge,
  activationMultiplier,
  rechargeFaster,
  rechargeSlower,
  durationMultiplier,
  healMultiplier,
  notEasilyInterrupted,
  uses,
}: OwnSkillModifier): string {
  const one = uses === 1;
  const percent = (share: number): string => `${String(Math.round(Math.abs(share) * 100))}%`;
  const verb = (plural: string, singular: string): string => (one ? singular : plural);
  const changes = [
    energyBase === undefined ? undefined : `${verb("cost", "costs")} ${String(energyBase)} Energy`,
    energyDiscount === 0
      ? undefined
      : `${verb("cost", "costs")} ${String(energyDiscount)} less Energy (minimum ${String(energyFloor)})`,
    energySurcharge === 0
      ? undefined
      : `${verb("cost", "costs")} ${String(energySurcharge)} more Energy`,
    activationMultiplier === 1
      ? undefined
      : `${verb("cast", "casts")} ${percent(1 - activationMultiplier)} ${activationMultiplier < 1 ? "faster" : "slower"}`,
    rechargeFaster === 0
      ? undefined
      : `${verb("recharge", "recharges")} ${percent(rechargeFaster)} faster`,
    rechargeSlower === 0
      ? undefined
      : `${verb("recharge", "recharges")} ${percent(rechargeSlower)} slower`,
    durationMultiplier === 1
      ? undefined
      : `${verb("last", "lasts")} ${percent(durationMultiplier - 1)} ${durationMultiplier > 1 ? "longer" : "shorter"}`,
    healMultiplier === 1
      ? undefined
      : `${verb("heal", "heals")} ${percent(1 - healMultiplier)} ${healMultiplier < 1 ? "less" : "more"}`,
    // Trapper's Focus's (#1966).
    notEasilyInterrupted ? `${verb("are", "is")} not easily interrupted` : undefined,
  ].filter((change) => change !== undefined);
  const kind = filter.type === undefined ? "skill" : filter.type.replaceAll("-", " ");
  const named = [
    filter.profession === undefined ? undefined : getProfession(filter.profession).name,
    filter.attributeId === undefined
      ? undefined
      : (getAttribute(filter.attributeId)?.name ?? filter.attributeId),
    one ? kind : `${kind}s`,
  ].filter((word) => word !== undefined);
  const which = uses === undefined ? "your" : one ? "your next" : `your next ${String(uses)}`;
  return `${which} ${named.join(" ")} ${changes.join(" and ")}`;
}

/** How a chant's next skill of a kind goes (#1505): "your next skill cannot be interrupted". */
function describeNextSkillRule({
  which,
  uninterruptible,
  unblockable,
  energyDiscount,
  castsInstantly,
  extraRechargeSeconds,
  rechargesInstantly,
  losesAllEnergy,
  rechargeFasterIfType,
  resetsOwnRechargeIfType,
  skillId,
}: NextSkillRule): string[] {
  // One clause for all a rule does to the skill (#1730): "your next
  // spell casts instantly and takes 30s longer to recharge".
  const does = [
    ...(uninterruptible ? ["cannot be interrupted"] : []),
    ...(unblockable ? ["cannot be blocked"] : []),
    ...(energyDiscount > 0 ? [`costs ${String(energyDiscount)} less energy`] : []),
    ...(castsInstantly ? ["casts instantly"] : []),
    ...(rechargesInstantly
      ? ["recharges instantly"]
      : extraRechargeSeconds > 0
        ? [`takes ${String(extraRechargeSeconds)}s longer to recharge`]
        : []),
  ];
  return [
    ...(does.length > 0 ? [`your next ${NEXT_SKILL_KIND[which][0]} ${does.join(" and ")}`] : []),
    ...(losesAllEnergy ? ["you lose all energy as it is cast"] : []),
    ...ifTypeText(rechargeFasterIfType, resetsOwnRechargeIfType, skillId),
  ];
}

/**
 * What a rule does when its skill is of a type (#1941), Ritual Lord's:
 * "for your next skill", "if it is a binding ritual, it recharges 50%
 * faster and Ritual Lord recharges instantly".
 */
function ifTypeText(
  faster: NextSkillRule["rechargeFasterIfType"],
  resets: NextSkillRule["resetsOwnRechargeIfType"],
  skillId: string,
): string[] {
  const type = faster?.type ?? resets;
  if (type === undefined) {
    return [];
  }
  const does = [
    ...(faster === undefined
      ? []
      : [`it recharges ${String(Math.round(faster.fraction * 100))}% faster`]),
    ...(resets === undefined ? [] : [`${getSkill(skillId)?.name ?? skillId} recharges instantly`]),
  ];
  const kind = TYPE_TEXT[type].slice(0, -1).toLowerCase();
  return ["for your next skill", `if it is a ${kind}, ${does.join(" and ")}`];
}

/**
 * A status a splash puts on those it reaches, as the second half of a
 * line (#1021): "nearby foes suffer Bleeding for 13s (…)", not "applies".
 */
function suffered(effect: ApplyStatusEffect, ranks: ReadonlyMap<string, number>): string {
  return (
    `suffer ${statusName(effect.statusId)} for ${seconds(effect.durationSeconds)} ` +
    `(${statusText(effect.statusId, ranks)})`
  );
}

/** "Deals 63 damage" as the second half of a line: "deals 63 damage". */
function lowerFirst(text: string): string {
  return `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

/** "a hex", "an enchantment". */
function aCategory(category: StatusCategory): string {
  return `${category === "enchantment" ? "an" : "a"} ${category.replace("-", " ")}`;
}

/**
 * "a hex", "a Mesmer hex", "a Water Magic hex" (#1765): a `target-has`'s
 * category, named by its filters.
 */
function filteredCategory(condition: {
  readonly category: StatusCategory;
  readonly profession?: ProfessionId;
  readonly attribute?: string;
}): string {
  const owners = [
    ...(condition.profession === undefined ? [] : [getProfession(condition.profession).name]),
    ...(condition.attribute === undefined
      ? []
      : [getAttribute(condition.attribute)?.name ?? condition.attribute]),
  ];
  if (owners.length === 0) {
    return aCategory(condition.category);
  }
  return `a ${owners.join(" ")} ${condition.category.replace("-", " ")}`;
}

/**
 * An `if`'s line said the other way round (#1670), from the line itself:
 * "If target has an enchantment" becomes "If target has no enchantment",
 * "If target is using a skill" "If target is not using a skill".
 */
function negatedText(text: string): string {
  const rules: readonly (readonly [RegExp, (...match: string[]) => string])[] = [
    [/^If (target|you) (is|are) not /, (_, who, verb) => `If ${who} ${verb} `],
    [/^If (target|you) (is|are) /, (_, who, verb) => `If ${who} ${verb} not `],
    [
      /^If (target|you) (has|have) no (\w)/,
      (_, who, verb, initial = "") =>
        `If ${who} ${verb} ${/[aeiou]/i.test(initial) ? "an" : "a"} ${initial}`,
    ],
    [/^If (target|you) (has|have) an? /, (_, who, verb) => `If ${who} ${verb} no `],
    [/^If target has /, () => "If target does not have "],
    [/^If you (\w+) /, (_, verb) => `If you do not ${verb} `],
  ];
  for (const [pattern, replacement] of rules) {
    if (pattern.test(text)) {
      return text.replace(pattern, replacement);
    }
  }
  return `Unless ${text.replace(/^If /, "")}`;
}

/** What an `if` waits for, as the line it leads says it (#521, #794). */
function conditionText(condition: EffectCondition): string {
  switch (condition.kind) {
    case "interrupted":
      return "If it interrupts a skill";
    case "interrupted-spell":
      return "If that action was a spell";
    case "resurrected":
      return "If it resurrects";
    case "removed":
      return condition.from === "caster"
        ? `If ${aCategory(condition.category)} was removed`
        : `If it removes ${aCategory(condition.category)}`;
    case "target-health-below":
      return `If target is below ${String(Math.round(condition.fraction * 100))}% Health`;
    case "target-health-above":
      return `If target is above ${String(Math.round(condition.fraction * 100))}% Health`;
    case "caster-health-below":
      return `If you have less than ${String(Math.round(condition.fraction * 100))}% Health`;
    case "caster-health-below-companion":
      return "If you have less Health than your pet";
    case "companion-health-below-caster":
      return "If your pet has less Health than you";
    case "target-chain-mark":
      return `If it follows ${condition.role === "off-hand" ? "an off-hand" : `a ${condition.role}`} attack`;
    case "target-has":
      return `If target has ${filteredCategory(condition)}`;
    case "target-has-any":
      return `If target has ${condition.categories.map(aCategory).join(" or ")}`;
    case "caster-has":
      return condition.profession === undefined
        ? `If you have ${aCategory(condition.category)}`
        : `If you have a ${getProfession(condition.profession).name} ${condition.category}`;
    case "caster-lacks": {
      const other = condition.excluding === undefined ? "" : "other ";
      return condition.profession === undefined
        ? `If you have no ${other}${condition.category}`
        : `If you have no ${other}${getProfession(condition.profession).name} ${condition.category}`;
    }
    case "target-casting":
      return condition.orChant === true
        ? "If target is casting a spell or chant"
        : "If target is casting a spell";
    case "target-using-skill":
      return "If target is using a skill";
    case "target-lacks-other-hex":
      return `If target has no other ${getProfession(condition.profession).name} hex`;
    case "target-alone":
      return condition.radius === AREA_ADJACENT
        ? "If target is not adjacent to any allies"
        : `If target has no allies within ${String(condition.radius)}`;
    case "target-near-caster-ally":
      return condition.radius === AREA_NEARBY
        ? "If target is near any of your allies"
        : `If any of your allies is within ${String(condition.radius)} of target`;
    case "target-not-moving":
      return "If target is not moving";
    case "target-knocked-down":
      return "If target is knocked down";
    case "target-moving":
      return "If target is moving";
    case "any-of": {
      const [first, ...rest] = condition.conditions.map(conditionText);
      return [first ?? "Never", ...rest.map((text) => text.replace(/^If /, ""))].join(" or ");
    }
    case "not":
      return negatedText(conditionText(condition.condition));
    case "target-has-status":
      return `If target has ${statusName(condition.statusId)}`;
    case "target-lacks-status":
      return `If target does not have ${statusName(condition.statusId)}`;
    case "caster-more-energy":
      return "If you have more Energy than target";
    case "caster-overcast":
      return "If you are Overcast";
    case "caster-wields":
      return `If you wield ${NEEDED_WEAPON[condition.weapon]}`;
    case "caster-holds-shield":
      return "If you hold a shield";
    case "target-less-health":
      return "If target has less Health than you";
    case "target-more-health":
      return "If target has more Health than you";
    case "target-attacking":
      return "If target is attacking";
    case "target-not-attacking":
      return "If target is not attacking";
    case "target-casting-or-attacking":
      return "If target is casting a spell or attacking";
    case "target-is-summoned":
      return "If target is a summoned creature";
    case "caster-no-spirit-within":
      return `If no spirit is ${AREA_TEXT.get(condition.radius) ?? `within ${String(condition.radius)}`} of you`;
    case "caster-spirit-within":
      return `If a spirit is ${AREA_TEXT.get(condition.radius) ?? `within ${String(condition.radius)}`} of you`;
    case "caster-spirit-or-corpse-within":
      return `If a spirit or a corpse is ${AREA_TEXT.get(condition.radius) ?? `within ${String(condition.radius)}`} of you`;
  }
}

/**
 * A damage type as the word before "damage" (#1724): " fire" in "Deals 112
 * fire damage"; typeless damage is not named.
 */
function typeWord(type: DamageType): string {
  return type === "typeless" ? "" : ` ${type}`;
}

/** An attack skill's damage type (#923), as " lightning" in "+18 lightning damage". */
function damageTypeText(skill: Skill): string {
  const type = blowRuleOf(skill)?.damageType;
  return type === undefined ? "" : typeWord(type);
}

/**
 * Leader's Comfort's heal per ally (#923), as the second half of its
 * line: ", +18 Health for each ally in earshot (max 140)".
 */
function perAllyText(effect: HealEffect, ranks: ReadonlyMap<string, number>): string {
  const { perAlly } = effect;
  if (perAlly === undefined) {
    return "";
  }
  const amount = shown(describeMagnitude(perAlly.amount, ranks));
  const area = AREA_TEXT.get(perAlly.radius) ?? `within ${String(perAlly.radius)}`;
  return `, +${amount} Health for each ally ${area} (max ${String(perAlly.max)})`;
}

/** Who a splash reaches, in the plural (#885, #1777). */
const SPLASH_SIDE: Readonly<Record<SplashEffect["hits"], string>> = {
  foes: "foes",
  "foe-creatures": "foe creatures",
  allies: "allies",
  "non-spirit-allies": "non-spirit allies",
  party: "party members",
  "own-spirits": "your spirits",
  "own-minions": "your other minions",
};

/** Who a splash reaches, as GW1 words it (#885): "Adjacent foes". */
function foesWithin(radius: number, hits: SplashEffect["hits"]): string {
  // Protective Was Kaolai's reaches the whole party, at any distance (#1434).
  if (hits === "party") {
    return "All party members";
  }
  // Mirror of Disenchantment's foe's whole party (#1954).
  if (hits === "foes" && radius === Number.POSITIVE_INFINITY) {
    return "All its party members";
  }
  // Feast for the Dead's, wherever they are (#1836).
  if (hits === "own-minions" && radius === Number.POSITIVE_INFINITY) {
    return "Your other minions";
  }
  const area = AREA_TEXT.get(radius);
  // Consume Soul's splash reaches only summoned creatures (#1309);
  // Spirit's Gift's, allies (#1316); Spirit Boon Strike's, your spirits (#1777).
  const who = SPLASH_SIDE[hits];
  const Who = `${who.charAt(0).toUpperCase()}${who.slice(1)}`;
  // "Your spirits in earshot": round you, wherever the target stands.
  if (hits === "own-spirits") {
    return `${Who} ${area ?? `within ${String(radius)}`}`;
  }
  switch (area) {
    case "adjacent":
      return `Adjacent ${who}`;
    case "nearby":
      return `Nearby ${who}`;
    case undefined:
      return `${Who} within ${String(radius)}`;
    default:
      return `${Who} ${area}`;
  }
}

/**
 * What each in a splash loses (#1954): Hex Eater Signet's "lose 1 hex",
 * Mirror of Disenchantment's "lose that same enchantment".
 */
function lostInSplash(effect: RemoveStatusEffect, ranks: ReadonlyMap<string, number>): string {
  if (effect.sameAsRemoved === true) {
    return `lose that same ${effect.category}`;
  }
  if (effect.count === "all" || effect.perRemoved !== undefined) {
    return `lose all ${categoryNoun("all", effect.category)}`;
  }
  const count = countAt(effect.count, ranks);
  return `lose ${String(count)} ${categoryNoun(count, effect.category)}`;
}

/** A splash's reach with its cap (#1618): Cleave's "Up to 2 adjacent foes". */
function upTo(splash: SplashEffect, ranks: ReadonlyMap<string, number>): string {
  // Hex Eater Signet's "adjacent allies with a hex" (#1954).
  const bearing = splash.onlyBearing === undefined ? "" : ` with a ${splash.onlyBearing}`;
  const who = `${foesWithin(splash.radius, splash.hits)}${splash.around === "caster" ? " around you" : ""}${bearing}`;
  return splash.maxTargets === undefined || splash.hits === "party"
    ? who
    : `Up to ${String(countAt(splash.maxTargets, ranks))} ${lowerFirst(who)}`;
}

/**
 * An effect's lines: one, or for an `if`, one per effect inside it, each
 * led by its condition: "If it interrupts: deals 102 damage".
 */
function describeEffects(effect: SkillEffect, ranks: ReadonlyMap<string, number>): Line[] {
  if (effect.kind === "summon") {
    const { kind, aura, attack, deathBurst, onDeathInRange } = effect.creature;
    return [
      describeEffect(effect, ranks),
      // What the spirit projects (#1064): "Non-spirit allies in its range:
      // +3 Health regeneration".
      ...(aura === undefined ? [] : [describeAura(aura, "in its range", ranks)]),
      ...(kind === "spirit" && attack !== undefined && attack.damageMax > 0
        ? [describeSpiritDamage(attack, ranks)]
        : []),
      ...(kind !== "spirit" && attack?.scaling.kind === "level"
        ? [describeMinionDamage(attack, attack.scaling.level, ranks)]
        : []),
      ...(attack?.onHit ?? []).map((onHit) => describeSpiritBlow(onHit, ranks)),
      ...(deathBurst === undefined ? [] : [describeDeathBurst(deathBurst, ranks)]),
      ...(onDeathInRange === undefined ? [] : [describeDeathInRange(onDeathInRange, ranks)]),
      ...describeMinionDeath(effect.creature, ranks),
    ];
  }
  if (effect.kind === "create-ground-effect") {
    const { act } = effect;
    if (act.kind === "aura") {
      // What the ward projects (#1087): "Non-spirit allies in the area: 50%
      // chance to block melee attacks".
      return [describeEffect(effect, ranks), describeAura(act.aura, "in the area", ranks)];
    }
    // What a trap does when sprung (#1105), and a pulse each time
    // (#1113): "When sprung, every 1s for 3s, foes nearby: deals 17
    // damage".
    const pulse = act.kind === "trap" ? act.trap.spring : act.pulse;
    const { radius } = pulse.area;
    const who = [
      ...(act.kind === "trap" ? ["when sprung"] : []),
      // Spirit Rift's (#1270): "after 3s, foes adjacent: ...".
      ...(pulse.delaySeconds > 0 ? [`after ${seconds(pulse.delaySeconds)}`] : []),
      ...(pulse.count > 1
        ? [`every ${seconds(pulse.everySeconds)} for ${seconds(pulse.count * pulse.everySeconds)}`]
        : []),
      `foes ${AREA_TEXT.get(radius) ?? `within ${String(radius)}`}`,
    ].join(", ");
    return [
      describeEffect(effect, ranks),
      ...(act.kind === "trap" && act.trap.springsAtEnd
        ? [{ text: "Springs by itself as its time runs out", magnitude: undefined }]
        : []),
      ...pulse.effects.flatMap((inner) =>
        describeEffects(inner, ranks).map(({ text, magnitude }) => ({
          text: `${who.charAt(0).toUpperCase()}${who.slice(1)}: ${lowerFirst(text)}`,
          magnitude,
        })),
      ),
    ];
  }
  if (effect.kind !== "if") {
    return [describeEffect(effect, ranks)];
  }
  const condition = conditionText(effect.condition);
  return effect.effects.map((inner) => {
    const { text, magnitude } = describeEffect(inner, ranks);
    return { text: `${condition}: ${lowerFirst(text)}`, magnitude };
  });
}

/**
 * What a spirit's blow deals (#1631): "Its attacks deal 17 damage",
 * linear in the rank as GW1 states it when it scales by rank.
 */
function describeSpiritDamage(attack: CreatureAttack, ranks: ReadonlyMap<string, number>): Line {
  const amount: Magnitude =
    attack.scaling.kind === "rank"
      ? {
          scaling: {
            attributeId: attack.attributeId,
            atZero: attack.scaling.atZero,
            atTwelve: attack.damageMax,
          },
        }
      : { flat: attack.damageMax };
  const magnitude = describeMagnitude(amount, ranks);
  return { text: `Its attacks deal ${shown(magnitude)} damage`, magnitude };
}

/**
 * What a spirit's blows land (#1550), one line an effect, an `if` said
 * once: "Its attacks: if target is not moving: knocks down for 2s, this
 * spirit loses 54 Health". Health it loses is the spirit's, not its
 * caster's. The line's scaling is its first number that scales.
 */
function describeSpiritBlow(effect: SkillEffect, ranks: ReadonlyMap<string, number>): Line {
  const parts = (effect.kind === "if" ? effect.effects : [effect]).map((inner): Line => {
    if (inner.kind === "lose-health" && inner.perRemovedOfProfession === undefined) {
      const magnitude = describeMagnitude(inner.amount, ranks);
      return { text: `this spirit loses ${shown(magnitude)} Health`, magnitude };
    }
    return describeEffect(inner, ranks);
  });
  const when = effect.kind === "if" ? `${lowerFirst(conditionText(effect.condition))}: ` : "";
  const what = parts.map(({ text }) => lowerFirst(text)).join(", ");
  const scaled = parts.find(({ magnitude }) => magnitude?.atZero !== undefined);
  return { text: `Its attacks: ${when}${what}`, magnitude: (scaled ?? parts[0])?.magnitude };
}

/**
 * "2 Bone Minion (60 Health, lasts 30 seconds)": who a summon or a
 * replacement makes, with Spawning Power's health and the base in
 * brackets (#1098).
 */
function describeCreature(
  creature: CreatureTemplate,
  count: number,
  ranks: ReadonlyMap<string, number>,
): Line {
  const health = describeMagnitude(creature.maxHealth, ranks);
  const spawned = spawningPowerHealth(spawningPowerOf(ranks), health.current);
  const healthText =
    spawned === health.current
      ? `${shown(health)} Health`
      : `${shown(health, String(spawned))} Health (${shown(health)})`;
  const level = creatureLevel(creature.attack, ranks);
  const levelText =
    level === undefined || creature.attack === undefined
      ? ""
      : `level ${marked(creature.attack.attributeId, String(Math.round(level)))}, `;
  const lasts =
    creature.durationSeconds === undefined
      ? ""
      : `, lasts ${shown(describeMagnitude(creature.durationSeconds, ranks))} seconds`;
  return {
    text: `${String(count)} ${creature.name} (${levelText}${healthText}${lasts})`,
    magnitude: health,
  };
}

/**
 * A minion's GW1 level at its summoner's rank (#1900), linear in the
 * rank; `undefined` when its blows do not scale by level.
 */
function creatureLevel(
  attack: CreatureAttack | undefined,
  ranks: ReadonlyMap<string, number>,
): number | undefined {
  if (attack?.scaling.kind !== "level") {
    return undefined;
  }
  const { atZero, atTwelve } = attack.scaling.level;
  const rank = rankOf(outsideMatch(ranks), attack.attributeId);
  return atZero + ((atTwelve - atZero) * rank) / 12;
}

/**
 * What a minion's blows deal at its summoner's rank (#1900): "Its attacks
 * deal 23–35 damage", its base times `creatureDamageMultiplier`, as the
 * simulation scales them.
 */
function describeMinionDamage(
  attack: CreatureAttack,
  level: CreatureLevel,
  ranks: ReadonlyMap<string, number>,
): Line {
  const atRank = (rank: number): number =>
    Math.round(attack.damageMax * creatureDamageMultiplier(rank, level));
  const rank = rankOf(outsideMatch(ranks), attack.attributeId);
  const multiplier = creatureDamageMultiplier(rank, level);
  const min = Math.round(attack.damageMin * multiplier);
  const max = Math.round(attack.damageMax * multiplier);
  const scaled = (damage: number): string => marked(attack.attributeId, String(damage));
  return {
    text: `Its attacks deal ${min === max ? scaled(max) : `${scaled(min)}–${scaled(max)}`} damage`,
    magnitude: {
      current: max,
      atZero: atRank(0),
      atTwelve: atRank(12),
      attributeId: attack.attributeId,
    },
  };
}

/**
 * What a minion's death leaves (#1836): Flesh Golem's one at a time and
 * its corpses, Shambling Horror's Jagged Horror and what its blows do.
 */
function describeMinionDeath(
  creature: CreatureTemplate,
  ranks: ReadonlyMap<string, number>,
): Line[] {
  const { onePerOwner, leavesCorpses, replacedBy } = creature;
  const corpses = leavesCorpses === undefined ? undefined : describeMagnitude(leavesCorpses, ranks);
  const replacement =
    replacedBy === undefined
      ? undefined
      : describeCreature(replacedBy.creature, replacedBy.count, ranks);
  return [
    ...(onePerOwner
      ? [{ text: "Only one at a time: a new one kills the old", magnitude: undefined }]
      : []),
    ...(corpses === undefined
      ? []
      : [
          {
            text: `Leaves ${shown(corpses)} ${corpses.current === 1 ? "corpse" : "corpses"} when it dies`,
            magnitude: corpses,
          },
        ]),
    ...(replacedBy === undefined || replacement === undefined
      ? []
      : [
          {
            text: [
              `When it dies, ${replacement.text} stands up in its place`,
              ...(replacedBy.creature.attack?.onHit ?? []).map((onHit) =>
                lowerFirst(describeSpiritBlow(onHit, ranks).text),
              ),
            ].join("; "),
            magnitude: replacement.magnitude,
          },
        ]),
  ];
}

/**
 * A spirit's death burst (#1550): "When it dies, non-spirit foes in the
 * area take 8 damage per second it lived (max 150)", or Lacerate's
 * status (#1956): "When it dies, non-spirit creatures in its range under
 * 90% Health begin Bleeding for 21 seconds".
 */
function describeDeathBurst(burst: DeathBurst, ranks: ReadonlyMap<string, number>): Line {
  const where = AREA_TEXT.get(burst.radius) ?? "in its range";
  const who = `${AURA_WHO[burst.affects].toLowerCase()} ${where}`;
  if (burst.effect === "apply-status") {
    const duration = describeMagnitude(burst.durationSeconds, ranks);
    const below = `${String(Math.round(burst.belowHealthFraction * 100))}%`;
    return {
      text: `When it dies, ${who} under ${below} Health begin ${statusName(burst.statusId)} for ${shown(duration)} seconds`,
      magnitude: duration,
    };
  }
  const rate = describeMagnitude(burst.perSecondAlive, ranks);
  const amount = shown(rate);
  const what =
    burst.effect === "damage" ? `take ${amount} damage` : `are healed for ${amount} Health`;
  const max = burst.max === undefined ? "" : ` (max ${String(burst.max)})`;
  return {
    text: `When it dies, ${who} ${what} per second it lived${max}`,
    magnitude: rate,
  };
}

/**
 * A spirit's answer to a death in its range (#1886): "When a non-spirit
 * dies in its range, each of its type in its range below 90% Health takes
 * 43 damage".
 */
function describeDeathInRange(rule: DeathInRange, ranks: ReadonlyMap<string, number>): Line {
  const when = "When a non-spirit dies in its range";
  if (rule.kind === "spread-conditions") {
    const where = AREA_TEXT.get(rule.radius) ?? "nearby";
    return {
      text: `${when}, its conditions spread to each non-spirit ${where} that has a condition`,
      magnitude: undefined,
    };
  }
  const damage = describeMagnitude(rule.damage, ranks);
  const below = `${String(Math.round(rule.belowHealthFraction * 100))}%`;
  return {
    text: `${when}, each of its type in its range below ${below} Health takes ${shown(damage)} damage`,
    magnitude: damage,
  };
}

/** Who an aura reaches and what they wear: "Non-spirit allies in its range: …". */
function describeAura(aura: Aura, where: string, ranks: ReadonlyMap<string, number>): Line {
  const who = AURA_WHO[aura.affects];
  return { text: `${who} ${where}: ${statusText(aura.statusId, ranks)}`, magnitude: undefined };
}

const AURA_WHO: Record<Aura["affects"], string> = {
  all: "Non-spirit creatures",
  allies: "Non-spirit allies",
  foes: "Non-spirit foes",
};

const GROUND_ANCHOR_TEXT: Record<CreateGroundEffect["anchor"], string> = {
  caster: "at your location",
  corpse: "at its location",
  target: "at your target's location",
};

/** A share of health as GW1 words it (#936): "half", or "25%". */
function share(fraction: number): string {
  return fraction === 0.5 ? "half" : `${String(Math.round(fraction * 100))}% of`;
}

/** " per foe hit", for an amount the caster gains once for each target hit (#977). */
function perFoeHit(effect: { readonly perTarget?: true }): string {
  return effect.perTarget === undefined ? "" : " per foe hit";
}

/** Defensive Stance's " for each melee attack skill on your bar (at most 3)" (#1978). */
function perOwnMeleeAttackSkill(effect: AdrenalineGainEffect): string {
  const per = effect.perOwnMeleeAttackSkill;
  return per === undefined
    ? ""
    : ` for each melee attack skill on your bar (at most ${String(per.max)})`;
}

/**
 * Signet of Creation's count and cap (#1316), in the corpus's words: " for
 * every summoned creature you control within earshot (maximum 10 Energy)".
 */
function perOwnCreatureText(effect: EnergyGainEffect, ranks: ReadonlyMap<string, number>): string {
  const per = effect.perOwnCreatureWithin;
  if (per === undefined) {
    return "";
  }
  const area = AREA_TEXT.get(per.radius) ?? `within ${String(per.radius)}`;
  const where = area === "in earshot" ? "within earshot" : area;
  const max = shown(describeMagnitude(per.max, ranks));
  return ` for every summoned creature you control ${where} (maximum ${max} Energy)`;
}

/** The line's scaled number: a zero base's `per` amount (#1760), else the base. */
function countedMagnitude(
  base: Magnitude,
  per: PerCount | undefined,
  ranks: ReadonlyMap<string, number>,
): MagnitudeDescription {
  return describeMagnitude(
    per !== undefined && "flat" in base && base.flat === 0 ? per.amount : base,
    ranks,
  );
}

/**
 * `text`, the effect's own amount, with its `per` (#1760) in the
 * corpus's words: "Deals 60 shadow damage, +20 shadow damage for each
 * enchantment on them". With a zero base, the count alone: `alone` and
 * `unit` round the per amount, as "You gain 68 Health" and " Health".
 */
function withPerText(
  text: string,
  base: Magnitude,
  per: PerCount | undefined,
  ranks: ReadonlyMap<string, number>,
  words: { readonly alone: string; readonly unit: string; readonly onTarget: string },
): string {
  if (per === undefined) {
    return text;
  }
  const each = `${shown(describeMagnitude(per.amount, ranks))}${words.unit} ${perCountText(per, ranks, words.onTarget)}`;
  return "flat" in base && base.flat === 0 ? `${words.alone} ${each}` : `${text}, +${each}`;
}

/**
 * What a `per` counts, and its cap (#1760): "for each enchantment on
 * them (maximum 60)", "for each of your recharging Beast Mastery skills"
 * (#1957).
 */
function perCountText(per: PerCount, ranks: ReadonlyMap<string, number>, onTarget: string): string {
  const { count } = per;
  const what =
    count.kind === "statuses"
      ? `${count.categories.join(" or ")} ${count.on === "caster" ? "on you" : onTarget}`
      : count.kind === "foes-within"
        ? `foe ${AREA_TEXT.get(count.radius) ?? `within ${String(count.radius)}`}`
        : `of your recharging ${getAttribute(count.attributeId)?.name ?? count.attributeId} skills`;
  const max = per.max === undefined ? "" : ` (maximum ${shown(describeMagnitude(per.max, ranks))})`;
  return `for each ${what}${max}`;
}

/** Warrior's Endurance's cap (#1359): ", never above 55". */
function upToText(effect: EnergyGainEffect): string {
  return effect.upTo === undefined ? "" : `, never above ${String(effect.upTo)}`;
}

/**
 * A count at the ranks: as it is, or a `Magnitude`'s current value, as
 * Divert Hexes' "up to 3 hexes" (#1954).
 */
function countAt(count: number | Magnitude, ranks: ReadonlyMap<string, number>): number {
  return typeof count === "number" ? count : resolveMagnitudeAtRanks(count, ranks);
}

/** `category` as a noun for `count` of it (#1954): "hex", "hexes". */
function categoryNoun(count: number | "all", category: StatusCategory): string {
  if (count === 1) {
    return category;
  }
  return category === "hex" ? "hexes" : `${category}s`;
}

/** " for each hex removed", for a gain per status taken off (#1954). */
function perRemovedText(effect: EnergyGainEffect): string {
  return effect.toTarget === true || effect.perRemoved === undefined
    ? ""
    : ` for each ${effect.perRemoved} removed`;
}

/** " per point lost", for an amount multiplied by the energy taken before it (#793). */
function perPointLost(effect: { readonly perEnergyLost?: true }): string {
  return effect.perEnergyLost === undefined ? "" : " per point lost";
}

/** A per-cost share as a percentage (#1614): 0.3 is "30%", 3.6 "360%". */
function percentOf(share: number): string {
  return `${String(Math.round(share * 100))}%`;
}

function describeEffect(effect: UnconditionalEffect, ranks: ReadonlyMap<string, number>): Line {
  switch (effect.kind) {
    case "damage": {
      const magnitude = countedMagnitude(effect.amount, effect.per, ranks);
      const penetration =
        effect.armorPenetration > 0
          ? ` (${String(Math.round(effect.armorPenetration * 100))}% armor penetration)`
          : "";
      const text = `Deals ${shown(magnitude)}${typeWord(effect.type)} damage${perPointLost(effect)}${penetration}`;
      // Mystic Twister's "if you are enchanted, 50 more" (#977).
      const bonus = effect.conditionalBonus;
      const counted = withPerText(text, effect.amount, effect.per, ranks, {
        alone: "Deals",
        unit: `${typeWord(effect.type)} damage`,
        onTarget: "on them",
      });
      return {
        text:
          bonus === undefined
            ? counted
            : `${counted}; ${lowerFirst(conditionText(bonus.condition))}: +${shown(describeMagnitude(bonus.amount, ranks))}`,
        magnitude,
      };
    }
    case "heal": {
      const magnitude = countedMagnitude(effect.amount, effect.per, ranks);
      const amount = shown(magnitude);
      const text =
        effect.perRemoved !== undefined
          ? `Heals ${amount} for each ${effect.perRemoved} removed`
          : effect.perDestroyedSpirit === true
            ? `Heals ${amount} for each spirit destroyed`
            : effect.perEnergyLost === true
              ? `${effect.recipient === "caster" ? "You are healed" : "Heals"} ${amount} for each point of Energy lost`
              : effect.perUsedSkillEnergy === true
                ? `Heals for ${shown(magnitude, percentOf(magnitude.current))} of the spell's energy cost`
                : effect.recipient === "caster"
                  ? `You gain ${amount} health`
                  : effect.recipient === "companion"
                    ? `Your pet gains ${amount} health`
                    : effect.recipient === "owner"
                      ? `Heals its owner for ${amount}`
                      : `Heals for ${amount}`;
      const counted = withPerText(text, effect.amount, effect.per, ranks, {
        alone: effect.recipient === "caster" ? "You gain" : "Heals",
        unit: " Health",
        onTarget: effect.recipient === "caster" ? "on target foe" : "on them",
      });
      // Mist Form's (#1951): ", under 80% Health".
      const below =
        effect.onlyBelowHealthFraction === undefined
          ? ""
          : `, under ${String(Math.round(effect.onlyBelowHealthFraction * 100))}% Health`;
      return { text: `${counted}${perAllyText(effect, ranks)}${below}`, magnitude };
    }
    case "energy-gain": {
      const magnitude = countedMagnitude(
        effect.amount,
        effect.toTarget === true ? undefined : effect.per,
        ranks,
      );
      if (effect.toTarget !== true && effect.perUsedSkillEnergy === true) {
        return {
          text: `Gain ${shown(magnitude, percentOf(magnitude.current))} of the skill's base energy cost`,
          magnitude,
        };
      }
      const gains =
        effect.toTarget === true
          ? "Target gains"
          : effect.recipient === "owner"
            ? "You gain"
            : "Gain";
      const text = `${gains} ${shown(magnitude)} energy${perPointLost(effect)}${perFoeHit(effect)}${perOwnCreatureText(effect, ranks)}${perRemovedText(effect)}`;
      return {
        text: `${effect.toTarget === true ? text : withPerText(text, effect.amount, effect.per, ranks, { alone: "Gain", unit: " energy", onTarget: "on target foe" })}${upToText(effect)}`,
        magnitude,
      };
    }
    case "adrenaline-gain": {
      const strikes = effect.strikes === 1 ? "1 strike" : `${String(effect.strikes)} strikes`;
      return {
        text: `${effect.recipient === "owner" ? "You gain" : "Gain"} ${strikes} of adrenaline${perFoeHit(effect)}${perOwnMeleeAttackSkill(effect)}`,
        magnitude: undefined,
      };
    }
    case "energy-loss": {
      const magnitude = describeMagnitude(effect.amount, ranks);
      return { text: `Target loses ${shown(magnitude)} energy`, magnitude };
    }
    case "energy-steal": {
      const magnitude = describeMagnitude(effect.amount, ranks);
      return { text: `Steals up to ${shown(magnitude)} energy`, magnitude };
    }
    case "life-steal": {
      const magnitude = describeMagnitude(effect.amount, ranks);
      return { text: `Steals up to ${shown(magnitude)} Health`, magnitude };
    }
    case "steal-from-corpse": {
      const magnitude = describeMagnitude(effect.amount, ranks);
      return { text: `You steal ${shown(magnitude)} Health`, magnitude };
    }
    case "sacrifice-health":
      return {
        text: `You sacrifice ${String(effect.percentOfMax)}% of your maximum health`,
        magnitude: undefined,
      };
    case "lose-health": {
      // "For each Monk enchantment removed, you lose 31 Health" (#944), or
      // once, flat (#1550): "You lose 54 health"; the target's (#1648):
      // "Target foe loses 53 Health".
      const magnitude = describeMagnitude(effect.amount, ranks);
      if (effect.recipient === "target") {
        return { text: `Target foe loses ${shown(magnitude)} Health`, magnitude };
      }
      const lose = `You lose ${shown(magnitude)} health`;
      if (effect.perRemovedOfProfession === undefined) {
        return { text: lose, magnitude };
      }
      const whose = getProfession(effect.perRemovedOfProfession).name;
      return { text: `${lose} for each ${whose} enchantment removed`, magnitude };
    }
    // Shadow Form's end (#1951): "Lose all but 41 Health".
    case "lose-health-to": {
      const magnitude = describeMagnitude(effect.keep, ranks);
      return { text: `Lose all but ${shown(magnitude)} Health`, magnitude };
    }
    case "transfer-conditions":
      return transferText(effect, ranks);
    // Epidemic's (#1501): "Adjacent foes get the target's conditions...";
    // Extend Conditions' "...with 81% more time (max 30 s)" (#1954).
    case "spread-conditions": {
      const extend =
        effect.extendPercent === undefined
          ? undefined
          : describeMagnitude(effect.extendPercent, ranks);
      const max = effect.maxSeconds === undefined ? "" : ` (max ${seconds(effect.maxSeconds)})`;
      return {
        text: `${foesWithin(effect.radius, "foes")} get the target's conditions, ${extend === undefined ? "with the time each has left" : `with ${shown(extend)}% more time${max}`}`,
        magnitude: extend,
      };
    }
    case "give-health": {
      const magnitude = describeMagnitude(effect.healPercent, ranks);
      return {
        text: `Lose ${share(effect.fractionOfCurrent)} your health; heal for ${shown(magnitude)}% of it`,
        magnitude,
      };
    }
    case "apply-status":
      // A stance, a preparation or a glyph is yours alone and one at a
      // time (#523, #525, #526), so it reads as what it is rather than as
      // something applied. The type line already says which (#524).
      switch (findStatusDefinition(effect.statusId)?.category) {
        case "stance":
        case "preparation":
        case "glyph": {
          // One with no end of its own (#1941), as Glyph of Energy, lasts
          // until what it holds is spent.
          const what = statusText(effect.statusId, ranks);
          return {
            text: Number.isFinite(effect.durationSeconds)
              ? `For ${seconds(effect.durationSeconds)}, ${what}`
              : `${what.charAt(0).toUpperCase()}${what.slice(1)}`,
            magnitude: undefined,
          };
        }
        default:
          break;
      }
      return {
        text:
          `Applies ${statusName(effect.statusId)}${effect.on === "caster" ? " to you" : ""} ` +
          // No end of its own (#1789): Faithful Intervention's.
          (Number.isFinite(effect.durationSeconds)
            ? `for ${statusDuration(effect, ranks)} `
            : "until it ends ") +
          `(${statusText(effect.statusId, ranks)})`,
        magnitude: undefined,
      };
    case "maintain-status": {
      // GW1 words upkeep as the caster's energy degeneration (#837).
      const what = statusText(effect.statusId, ranks);
      return {
        text:
          `Maintained${effect.on === "caster" ? " on you" : ""}: −1 Energy regeneration while it lasts. ` +
          `${what.charAt(0).toUpperCase()}${what.slice(1)}.`,
        magnitude: undefined,
      };
    }
    case "remove-status": {
      // Mirror of Disenchantment's "lose that same enchantment" (#1954).
      if (effect.sameAsRemoved === true) {
        return { text: `Loses that same ${effect.category}`, magnitude: undefined };
      }
      // Contemplation of Purity's "lose one hex for each one lost" (#1205).
      const { perRemoved } = effect;
      if (perRemoved !== undefined) {
        const max = shown(describeMagnitude(perRemoved.max, ranks));
        const verb = effect.from === "caster" ? "Lose" : "Removes";
        return {
          text: `${verb} one ${effect.category} for each ${perRemoved.category} removed (max ${max})`,
          magnitude: undefined,
        };
      }
      if (effect.statusId !== undefined) {
        // "Charge!"'s "lose the Crippled condition" (#1549).
        const verb = effect.from === "caster" ? "Lose" : "Removes";
        return { text: `${verb} ${statusName(effect.statusId)}`, magnitude: undefined };
      }
      if (effect.from === "caster") {
        // "Lose 1 Dervish enchantment" (#845), or all of them (#1205).
        const whose =
          effect.profession === undefined ? "" : `${getProfession(effect.profession).name} `;
        const count = effect.count === "all" ? "all" : countAt(effect.count, ranks);
        return {
          text: `Lose ${String(count)} ${whose}${categoryNoun(count, effect.category)}`,
          magnitude: undefined,
        };
      }
      if (effect.category === "stance") {
        return { text: "Ends the target's stance", magnitude: undefined };
      }
      const count = effect.count === "all" ? "all" : countAt(effect.count, ranks);
      // Mend Body and Soul's "for each spirit within earshot" (#1064).
      const near = effect.perSpiritNear;
      const perSpirit =
        near === undefined
          ? ""
          : ` for each spirit ${AREA_AROUND_TARGET.get(near) ?? `within ${String(near)} of it`}`;
      // A target with fewer loses what it has (#1678): "up to 3".
      const upTo = typeof count === "number" && count > 1 ? "up to " : "";
      // Shatter Delusions' "remove one Mesmer hex" (#1765).
      const whose =
        effect.profession === undefined ? "" : `${getProfession(effect.profession).name} `;
      return {
        text: `Removes ${upTo}${String(count)} ${whose}${categoryNoun(count, effect.category)}${perSpirit}`,
        magnitude: undefined,
      };
    }
    case "interrupt":
      return {
        text:
          effect.only === "spell"
            ? "Interrupts the target's spell, if they are casting one"
            : effect.only === "spell-or-chant"
              ? "Interrupts the target's spell or chant, if they are casting one"
              : effect.only === "skill"
                ? "Interrupts the target's skill, if they are using one"
                : "Interrupts the target's action: a skill or an attack",
        magnitude: undefined,
      };
    case "knockdown":
      return {
        text: `Knocks down for ${seconds(effect.durationSeconds)}`,
        magnitude: undefined,
      };
    case "shadow-step":
      return {
        text:
          effect.to === "target"
            ? "Shadow steps to the target"
            : effect.to === "swap"
              ? "You and the target Shadow Step to each other's location"
              : "Shadow Step to a nearby location directly away from your target",
        magnitude: undefined,
      };
    case "resurrect": {
      // "13% health and 3% energy per party member in earshot",
      // "your health after losing half and 17% energy" (#474).
      const energy = describeMagnitude(effect.energyPercent, ranks);
      const health =
        effect.health.kind === "percent"
          ? describeMagnitude(effect.health.percent, ranks)
          : undefined;
      const healthText =
        effect.health.kind === "percent"
          ? `${shown(describeMagnitude(effect.health.percent, ranks))}% health`
          : `your health after losing ${share(effect.health.casterLosesFractionOfCurrent)}`;
      const radius = effect.perPartyMemberWithin;
      const per =
        radius === undefined
          ? ""
          : ` per party member ${AREA_TEXT.get(radius) ?? `within ${String(radius)}`}`;
      const teleport = effect.at === "caster" ? ", and teleports the target to you" : "";
      return {
        text: `Returns the target to life with ${healthText} and ${shown(energy)}% energy${per}${teleport}`,
        magnitude: health ?? energy,
      };
    }
    case "resurrect-companions": {
      // "Returns every dead allied pet nearby to life with 77% health" (#1108).
      const health = describeMagnitude(effect.healthPercent, ranks);
      const where = AREA_TEXT.get(effect.radius) ?? `within ${String(effect.radius)}`;
      return {
        text: `Returns every dead allied pet ${where} to life with ${shown(health)}% health`,
        magnitude: health,
      };
    }
    case "drain-own-energy":
      return { text: "You lose all your remaining energy", magnitude: undefined };
    case "caster-gains-status":
      // Ice Spear's "you gain +1...4 Health regeneration for 5 seconds" (#1367).
      return {
        text:
          `You gain ${statusName(effect.statusId)} for ${seconds(effect.durationSeconds)} ` +
          `(${statusText(effect.statusId, ranks)})`,
        magnitude: undefined,
      };
    // Run as One's "you and your pet run 25% faster" (#1865).
    case "companion-gains-status":
      return {
        text:
          `Your pet gains ${statusName(effect.statusId)} for ${seconds(effect.durationSeconds)} ` +
          `(${statusText(effect.statusId, ranks)})`,
        magnitude: undefined,
      };
    // Strike as One's "your animal companion instantly moves to your target" (#1966).
    case "companion-steps-to-target":
      return { text: "Your pet moves to your target and attacks it", magnitude: undefined };
    case "pull-to-caster":
      return { text: "Teleports target to you", magnitude: undefined };
    case "destroy-target-spirit":
      return { text: "Destroys target allied spirit", magnitude: undefined };
    case "destroy-target-minion":
      return { text: "Destroys target minion", magnitude: undefined };
    case "drain-nearest-spirit": {
      // Spirit Transfer's (#1947): what it takes, then what each point is worth.
      const magnitude = describeMagnitude(effect.health, ranks);
      return {
        text:
          `Nearest spirit loses ${shown(magnitude)} Health; ` +
          `target ally is healed ${String(effect.healPerPoint)} per point`,
        magnitude,
      };
    }
    case "owner-gains-damage-dealt":
      return { text: "Its owner gains Health equal to the damage it deals", magnitude: undefined };
    case "destroy-allied-spirits":
      return {
        text: `Destroys every allied spirit ${AREA_TEXT.get(effect.radius) ?? `within ${String(effect.radius)}`}`,
        magnitude: undefined,
      };
    case "recharge-faster":
      return {
        // Bitter Chill's "recharges instantly" (#1640).
        text:
          effect.fraction === 1
            ? "This skill recharges instantly"
            : `This skill recharges ${String(Math.round(effect.fraction * 100))}% faster`,
        magnitude: undefined,
      };
    case "recharge-reset":
      return { text: "This skill recharges instantly", magnitude: undefined };
    case "recharge-others":
      return {
        text:
          effect.which === "all"
            ? "Recharges all your skills"
            : "Recharges all your other attack skills",
        magnitude: undefined,
      };
    case "summon": {
      // "Summons 2 Bone Minion (60 Health, lasts 30 seconds)" (#1052), with
      // Spawning Power's health and the base in brackets (#1098).
      const { text, magnitude } = describeCreature(effect.creature, effect.count, ranks);
      return {
        text:
          `Summons ${text}` +
          (effect.perExploitedCorpse === true ? ", plus one per corpse exploited" : ""),
        magnitude,
      };
    }
    case "create-ground-effect": {
      // "Creates a ward at your location for 17 seconds" (#1087), "Sets a
      // trap at your location for 90 seconds" (#1105), a well "at its
      // location", the corpse's (#1104), a symbol at your target's
      // (#1113), or Lava Font's burning ground where you stood (#1540).
      const magnitude = describeMagnitude(effect.durationSeconds, ranks);
      const what =
        effect.act.kind === "trap"
          ? "Sets a trap"
          : effect.act.kind === "pulse"
            ? effect.anchor === "target"
              ? "Creates a symbol"
              : "Marks the ground"
            : effect.anchor === "corpse"
              ? "Creates a well"
              : "Creates a ward";
      const where = GROUND_ANCHOR_TEXT[effect.anchor];
      return {
        text: `${what} ${where} for ${shown(magnitude)} seconds`,
        magnitude,
      };
    }
    case "disable-skill": {
      const magnitude = describeMagnitude(effect.seconds, ranks);
      const time = `${shown(magnitude)} seconds`;
      return {
        text:
          effect.which === "all"
            ? `All of the target's skills are disabled for ${time}`
            : effect.which === "elite"
              ? `The target's elite skill is disabled for ${time}`
              : effect.which === "random-spell"
                ? `One of the target's spells, at random, is disabled for ${time}`
                : effect.which === "interrupted"
                  ? `The interrupted skill is disabled for ${time}`
                  : `That skill and all skills of the same attribute are disabled for ${time}`,
        magnitude,
      };
    }
    // Inspired Enchantment's and Arcane Thievery's (#1928).
    case "copy-removed":
      return {
        text: `This skill becomes the one you removed for ${String(effect.seconds)} seconds`,
        magnitude: undefined,
      };
    case "copy-disabled":
      return { text: "This skill becomes that spell for as long", magnitude: undefined };
    // Arcane Mimicry's and Signet of Binding's (#1965).
    case "copy-elite":
      return {
        text: `This skill becomes target ally's non-form elite skill for ${String(effect.seconds)} seconds`,
        magnitude: undefined,
      };
    case "take-control":
      return { text: "Take control of target enemy spirit", magnitude: undefined };
    case "disable-own-skills": {
      const magnitude = describeMagnitude(effect.seconds, ranks);
      return { text: disableOwnText(effect, false, shown(magnitude)), magnitude };
    }
    case "chain-mark":
      return {
        text: effect.role === "lead" ? "Counts as a lead attack" : "Counts as an off-hand attack",
        magnitude: undefined,
      };
    case "overcast": {
      const magnitude = describeMagnitude(effect.amount, ranks);
      return { text: `Target suffers ${shown(magnitude)} overcast`, magnitude };
    }
    case "lengthen-recharge": {
      const magnitude = describeMagnitude(effect.seconds, ranks);
      const which = effect.of === "this-skill" ? "This skill" : "That skill";
      return {
        text: `${which} takes ${shown(magnitude)} seconds longer to recharge`,
        magnitude,
      };
    }
    case "splash": {
      // "Adjacent foes take 40 damage" (#885).
      const inner = effect.effects.map((each) => ({
        each,
        description: describeEffect(each, ranks),
      }));
      const parts = inner.map(({ each, description }) =>
        each.kind === "damage"
          ? `take ${shown(describeMagnitude(each.amount, ranks))}${typeWord(each.type)} damage` +
            (each.perEnergyLost === undefined ? "" : " for each point of energy lost")
          : each.kind === "interrupt"
            ? each.only === undefined
              ? "are interrupted"
              : "are interrupted if casting"
            : each.kind === "knockdown"
              ? `are knocked down for ${String(each.durationSeconds)}s`
              : each.kind === "apply-status"
                ? effect.hits === "foes" || effect.hits === "foe-creatures"
                  ? suffered(each, ranks)
                  : `gain ${suffered(each, ranks).slice("suffer ".length)}`
                : each.kind === "heal" && each.recipient === undefined
                  ? `gain ${shown(describeMagnitude(each.amount, ranks))} Health`
                  : each.kind === "lose-health" && each.recipient === "target"
                    ? `lose ${shown(describeMagnitude(each.amount, ranks))} Health`
                    : each.kind === "remove-status" && each.from === undefined
                      ? lostInSplash(each, ranks)
                      : lowerFirst(description.text),
      );
      const last = parts.pop();
      const what = parts.length === 0 ? (last ?? "") : `${parts.join(", ")} and ${String(last)}`;
      return {
        text: `${upTo(effect, ranks)} ${what}`,
        magnitude: inner.find(({ description }) => description.magnitude !== undefined)?.description
          .magnitude,
      };
    }
  }
}

/** `effect`'s number, as a card's headline puts it; `undefined` without one. */
function headlineOf(
  effect: SkillEffect,
  ranks: ReadonlyMap<string, number>,
): { readonly text: string; readonly scales: boolean } | undefined {
  switch (effect.kind) {
    case "damage":
    case "heal":
    case "energy-gain": {
      const magnitude = describeMagnitude(effect.amount, ranks);
      const amount = shown(magnitude);
      const text =
        effect.kind === "damage"
          ? `${amount}${typeWord(effect.type)} damage${perPointLost(effect)}`
          : effect.kind === "heal"
            ? `heals ${amount}`
            : `+${amount} energy${perPointLost(effect)}`;
      return { text, scales: magnitude.attributeId !== undefined };
    }
    case "energy-loss": {
      const magnitude = describeMagnitude(effect.amount, ranks);
      return {
        text: `drains ${shown(magnitude)} energy`,
        scales: magnitude.attributeId !== undefined,
      };
    }
    case "energy-steal": {
      const magnitude = describeMagnitude(effect.amount, ranks);
      return {
        text: `steals ${shown(magnitude)} energy`,
        scales: magnitude.attributeId !== undefined,
      };
    }
    case "life-steal": {
      const magnitude = describeMagnitude(effect.amount, ranks);
      return {
        text: `steals ${shown(magnitude)} health`,
        scales: magnitude.attributeId !== undefined,
      };
    }
    case "steal-from-corpse": {
      const magnitude = describeMagnitude(effect.amount, ranks);
      return {
        text: `steals ${shown(magnitude)} health`,
        scales: magnitude.attributeId !== undefined,
      };
    }
    case "resurrect": {
      if (effect.health.kind === "caster-current") {
        const energy = describeMagnitude(effect.energyPercent, ranks);
        return {
          text: `resurrects, ${shown(energy)}% energy`,
          scales: energy.attributeId !== undefined,
        };
      }
      const health = describeMagnitude(effect.health.percent, ranks);
      return {
        text: `resurrects, ${shown(health)}% health`,
        scales: health.attributeId !== undefined,
      };
    }
    case "resurrect-companions": {
      const health = describeMagnitude(effect.healthPercent, ranks);
      return {
        text: `resurrects pets, ${shown(health)}% health`,
        scales: health.attributeId !== undefined,
      };
    }
    case "give-health": {
      const percent = describeMagnitude(effect.healPercent, ranks);
      return {
        text: `heals ${shown(percent)}% of ${share(effect.fractionOfCurrent)} your health`,
        scales: percent.attributeId !== undefined,
      };
    }
    case "if": {
      // Power Spike's card leads with its damage, though it needs a spell.
      const inner = effect.effects.flatMap((each) => headlineOf(each, ranks) ?? []);
      return inner.find((number) => number.scales) ?? inner[0];
    }
    case "create-ground-effect": {
      // A trap's card leads with what its spring deals (#1105), a pulse's
      // with what each pulse deals (#1113).
      const { act } = effect;
      if (act.kind === "aura") {
        return undefined;
      }
      const pulse = act.kind === "trap" ? act.trap.spring : act.pulse;
      const inner = pulse.effects.flatMap((each) => headlineOf(each, ranks) ?? []);
      return inner.find((number) => number.scales) ?? inner[0];
    }
    default:
      return undefined;
  }
}

/** An attack skill's weapon line (#417). */
const WEAPON_TEXT: Record<AttackWeaponClass, string> = {
  axe: "Axe attack",
  sword: "Sword attack",
  hammer: "Hammer attack",
  daggers: "Dagger attack",
  scythe: "Scythe attack",
  spear: "Spear attack",
  bow: "Bow attack",
  melee: "Melee attack",
};

/** A chain role as GW1 names the attack (#831): "Lead attack.". */
const CHAIN_ROLE_TEXT: Record<ChainRole, string> = {
  lead: "Lead attack.",
  "off-hand": "Off-hand attack.",
  dual: "Dual attack.",
};

/** What a chain attack must follow (#831), as GW1 words it. */
const FOLLOWS_TEXT: Record<ChainRole, string> = {
  lead: "Must follow a lead attack.",
  "off-hand": "Must follow an off-hand attack.",
  dual: "Must follow a dual attack.",
};

/**
 * "Only if target is knocked down" (#1041): a chain's state requirement,
 * from `conditionText`, every case of which starts "If ".
 */
function requiresText(requires: StateCondition): string {
  return conditionText(requires).replace(/^If /, "Only if ");
}

/**
 * A chain attack's line (#831): "Off-hand attack. Must follow a lead
 * attack.", then its requirement (#1041): "Off-hand attack. Only if
 * target is knocked down."
 */
function chainText(chain: ChainStep): string {
  return [
    CHAIN_ROLE_TEXT[chain.role],
    ...(chain.follows === undefined ? [] : [FOLLOWS_TEXT[chain.follows]]),
    ...(chain.requires === undefined ? [] : [`${requiresText(chain.requires)}.`]),
  ].join(" ");
}

/**
 * What an `if` waited for, lower case for the middle of a log line
 * (#1735), the tooltip's own words: "only if target has Burning", "unless
 * target is moving".
 */
export function conditionRequirementText(condition: EffectCondition): string {
  const text = conditionText(condition);
  return text.startsWith("If ") ? `only ${lowerFirst(text)}` : lowerFirst(text);
}

/**
 * What a chain attack needs to hit, lower case for the middle of a line
 * (#1041): "must follow a lead attack", "only if target is knocked
 * down", both joined by "; "; `undefined` for neither, or no chain.
 */
export function chainRequirementText(skill: Skill): string | undefined {
  const chain = skill.attack?.chain;
  const parts = [
    ...(chain?.follows === undefined ? [] : [FOLLOWS_TEXT[chain.follows]]),
    ...(chain?.requires === undefined ? [] : [requiresText(chain.requires)]),
  ].map((text) => `${text.charAt(0).toLowerCase()}${text.slice(1).replace(/\.$/, "")}`);
  return parts.length === 0 ? undefined : parts.join("; ");
}

const NEEDED_WEAPON: Record<AttackWeaponClass, string> = {
  axe: "an axe",
  sword: "a sword",
  hammer: "a hammer",
  daggers: "daggers",
  scythe: "a scythe",
  spear: "a spear",
  bow: "a bow",
  melee: "a melee weapon",
};

/**
 * What an attack skill needs in hand, for "Needs an axe." (#417): the
 * HUD's refusal and the build editor's warning say it the same way.
 */
export function neededWeaponText(weapon: AttackWeaponClass): string {
  return NEEDED_WEAPON[weapon];
}

/**
 * A `transfer-conditions` line (#1511): "Moves up to 3 of your conditions
 * to the target", or "Moves all of target's conditions to you; you are
 * healed for 22 for each", or "Moves all of your conditions with 180% of
 * their remaining durations to the target" (#1540).
 */
function transferText(effect: TransferConditionsEffect, ranks: ReadonlyMap<string, number>): Line {
  const count = effect.count === Infinity ? "all" : `up to ${String(effect.count)}`;
  const lasting =
    effect.durationMultiplier === 1
      ? ""
      : ` with ${String(Math.round(effect.durationMultiplier * 100))}% of their remaining durations`;
  const moves =
    effect.from === "caster"
      ? `Moves ${count} of your conditions${lasting} to the target`
      : `Moves ${count} of target's conditions${lasting} to you`;
  if (effect.healPerCondition === undefined) {
    return { text: moves, magnitude: undefined };
  }
  const magnitude = describeMagnitude(effect.healPerCondition, ranks);
  return {
    text: `${moves}; you are healed for ${shown(magnitude)} for each`,
    magnitude,
  };
}

const TYPE_TEXT: Record<SkillType, string> = {
  attack: "Attack.",
  spell: "Spell.",
  enchantment: "Enchantment Spell.",
  hex: "Hex Spell.",
  signet: "Signet.",
  shout: "Shout.",
  stance: "Stance.",
  preparation: "Preparation.",
  glyph: "Glyph.",
  chant: "Chant.",
  echo: "Echo.",
  "weapon-spell": "Weapon Spell.",
  "nature-ritual": "Nature Ritual.",
  "binding-ritual": "Binding Ritual.",
  ward: "Ward Spell.",
  well: "Well Spell.",
  "item-spell": "Item Spell.",
  trap: "Trap.",
  "pet-attack": "Pet Attack.",
  form: "Form.",
  skill: "Skill.",
};

/**
 * A `disable-own-skills` line (#1473): "All of your skills" (#1570), "All
 * of your spells", "All of your Smiting Prayers" (#1511), or "All of your
 * non-Mesmer skills except signets", "are disabled for 10 seconds". A
 * skill of the attribute it disables spares itself: "All of your other
 * Healing Prayers" (#1748). "All of your other attack skills" (#1914). "Your
 * enchantment spells and stances" (#1930).
 */
function disableOwnText(effect: DisableOwnSkillsEffect, others: boolean, seconds: string): string {
  const time = `are disabled for ${seconds} seconds`;
  if (effect.which === "all") {
    return `All of your skills ${time}`;
  }
  if (effect.which === "attacks") {
    return `All of your other attack skills ${time}`;
  }
  if (effect.which === "types") {
    const types = effect.types.map(
      (type) => `${TYPE_TEXT[type].replace(/\.$/, "").toLowerCase()}s`,
    );
    return `Your ${types.join(" and ")} ${time}`;
  }
  if (effect.which === "spells") {
    return `All of your spells ${time}`;
  }
  if (effect.which === "attribute") {
    const name = getAttribute(effect.attributeId)?.name ?? effect.attributeId;
    return `All of your ${others ? "other " : ""}${name} ${time}`;
  }
  const except = effect.exceptTypes.map(
    (type) => `${TYPE_TEXT[type].replace(/\.$/, "").toLowerCase()}s`,
  );
  const exceptText = except.length === 0 ? "" : ` except ${except.join(" and ")}`;
  return `All of your non-${getProfession(effect.profession).name} skills${exceptText} ${time}`;
}

/** GW1's words for the area radii (`distances.ts`). */
const AREA_TEXT: ReadonlyMap<number, string> = new Map([
  [AREA_ADJACENT, "adjacent"],
  [AREA_NEARBY, "nearby"],
  [AREA_IN_THE_AREA, "in the area"],
  [AREA_EARSHOT, "in earshot"],
]);

/** Where round its target a target-centred area reaches: "nearby it" (#998). */
const AREA_AROUND_TARGET: ReadonlyMap<number, string> = new Map([
  [AREA_ADJACENT, "adjacent to it"],
  [AREA_NEARBY, "nearby it"],
  [AREA_IN_THE_AREA, "in the area around it"],
  [AREA_EARSHOT, "in earshot of it"],
]);

const TARGET_TEXT: Record<Skill["target"], string> = {
  self: "Self",
  "single-enemy": "One foe",
  "single-ally": "One ally",
  "single-other-ally": "Another ally",
  "single-any": "Any one target",
  "single-dead-ally": "A dead ally",
  "allied-spirit": "An allied spirit",
  "enemy-spirit": "An enemy spirit",
  "own-minion": "One of your minions",
  "allied-minion": "An allied minion",
  "allied-summoned-creature": "An allied summoned creature",
  "single-ally-not-spirit": "One ally, not a spirit",
  companion: "Your pet",
  "living-companion": "Your living pet",
};

const AREA_WHO: Record<RadiusArea["affects"], string> = {
  enemies: "Foes",
  allies: "Allies",
  all: "Everyone",
};

/**
 * Who and how far: "Allies in earshot, 350 radius" for a shout, which
 * reaches round its caster rather than at a target (#524).
 */
function targetAndRange(skill: Skill): {
  readonly target: string;
  readonly range: string | undefined;
} {
  const area = skill.area;
  if (area?.origin === "party") {
    // Heal Party (#1013): every team-mate, however far.
    return { target: "Your whole party", range: undefined };
  }
  if (skill.target === "self" && area?.origin === "caster") {
    const where = AREA_TEXT.get(area.radius) ?? `within ${String(area.radius)}`;
    return { target: `${AREA_WHO[area.affects]} ${where}`, range: `${String(area.radius)} radius` };
  }
  if (area?.origin === "caster") {
    // Cyclone Axe (#936): its target, and everyone round its user.
    const where = AREA_TEXT.get(area.radius) ?? `within ${String(area.radius)}`;
    return {
      target: `${TARGET_TEXT[skill.target]}, and ${AREA_WHO[area.affects].toLowerCase()} ${where} around you`,
      range: `${String(skill.range)} range`,
    };
  }
  if (area?.origin === "target") {
    // Fireball, Meteor (#998): its target, and those round it. maxTargets
    // counts the primary.
    const who = AREA_WHO[area.affects].toLowerCase();
    const count =
      area.maxTargets === undefined ? who : `up to ${String(area.maxTargets - 1)} ${who}`;
    const where = AREA_AROUND_TARGET.get(area.radius) ?? `within ${String(area.radius)} of it`;
    return {
      target: `${TARGET_TEXT[skill.target]}, and ${count} ${where}`,
      range: `${String(skill.range)} range, ${String(area.radius)} radius`,
    };
  }
  return {
    target: TARGET_TEXT[skill.target],
    range: skill.target === "self" ? undefined : `${String(skill.range)} range`,
  };
}

/** "5 energy (10)": what it costs at these ranks, the base in brackets when they differ. */
function costText(skill: Skill, ranks: ReadonlyMap<string, number>): string {
  if (skill.cost === undefined) {
    return "Free";
  }
  if (skill.cost.kind === "adrenaline") {
    return `${String(skill.cost.amount)} adrenaline`;
  }
  const cost = energyCostOf(skill, outsideMatch(ranks));
  const base = cost === skill.cost.amount ? "" : ` (${String(skill.cost.amount)})`;
  return `${String(cost)} energy${base}${overcastText(skill)}`;
}

/** ", 5 overcast" after an energy cost (#461), or nothing for a skill without. */
export function overcastText(skill: Skill): string {
  return skill.overcast > 0 ? `, ${String(skill.overcast)} overcast` : "";
}

/** "1.1s (2s)": how long it activates at these ranks, with no status on, the base in brackets when they differ. */
function castTimeText(skill: Skill, ranks: ReadonlyMap<string, number>): string {
  if (skill.activationSeconds === 0) {
    return "Instant";
  }
  const activation = seconds(effectiveActivationSeconds(skill, outsideMatch(ranks)));
  const base = seconds(skill.activationSeconds);
  return activation === base ? base : `${activation} (${base})`;
}

/**
 * `effect` as the owner reads it (#1957): a pet attack's caster is the
 * pet, so its heal of the caster heals "your pet", Predator's Pounce's.
 */
function petReads(skill: Skill, effect: SkillEffect): SkillEffect {
  return skill.petAttack !== undefined && effect.kind === "heal" && effect.recipient === "caster"
    ? { ...effect, recipient: "companion" }
    : effect;
}

/**
 * Describe a skill at the given attribute ranks.
 *
 * `ranks` is normally the character being edited. An empty map describes
 * the skill at rank 0, which is what an unallocated character would
 * actually get — not a hypothetical "typical" value. Cost and cast time
 * are what a primary attribute makes of them at these ranks (#531).
 */
export function describeSkill(
  skill: Skill,
  ranks: ReadonlyMap<string, number> = new Map(),
): SkillDescription {
  // "Lose all adrenaline" (#1097), before anything, as GW1 prints it.
  const lossLine =
    skill.cost?.kind === "adrenaline" && skill.cost.losesAll === true
      ? [{ text: "Lose all adrenaline", magnitude: undefined }]
      : [];
  // A pet attack's (#1046) reads as an attack skill's.
  const rule = blowRuleOf(skill);
  // A chain attack's place in its chain (#831), first, as GW1 prints it.
  const chain = rule?.chain;
  const chainLine = chain === undefined ? [] : [{ text: chainText(chain), magnitude: undefined }];
  // An attack skill's "+16 damage" (#417): its bonus over the weapon's
  // blow, first, as GW1 writes it. Broad Head Arrow has none. One whose
  // weapon's own roll counts for nothing (#1038) "deals only" its bonus,
  // or, with none, "deals no damage" (Distracting Blow).
  const bonusDamage = rule?.bonusDamage;
  const bonus = bonusDamage === undefined ? undefined : describeMagnitude(bonusDamage, ranks);
  // Then its bonus while a state holds (#794): Mystic Sweep's "If you
  // have an enchantment: +10 damage".
  const conditionalBonus = rule?.conditionalBonus;
  const more =
    conditionalBonus === undefined ? undefined : describeMagnitude(conditionalBonus.amount, ranks);
  const weaponless = rule?.weaponDamage === 0;
  const bonusLine = [
    ...(bonus === undefined
      ? weaponless
        ? [{ text: "Deals no damage", magnitude: undefined }]
        : []
      : [
          {
            text: weaponless
              ? `Deals only ${shown(bonus)}${damageTypeText(skill)} damage`
              : `+${shown(bonus)}${damageTypeText(skill)} damage`,
            magnitude: bonus,
          },
        ]),
    ...(conditionalBonus === undefined || more === undefined
      ? []
      : [
          {
            text: `${conditionText(conditionalBonus.condition)}: +${shown(more)} damage`,
            magnitude: more,
          },
        ]),
    // Enraged Lunge's "+19 damage for each of your recharging Beast
    // Mastery skills (maximum 60)" (#1957).
    ...(rule?.bonusPer === undefined
      ? []
      : [
          {
            text: `+${shown(describeMagnitude(rule.bonusPer.amount, ranks))} damage ${perCountText(rule.bonusPer, ranks, "on them")}`,
            magnitude: describeMagnitude(rule.bonusPer.amount, ranks),
          },
        ]),
  ];
  // An attack that rolls no block (#1038): Wild Throw, Crippling Shot. Or
  // none while a state holds (#1354): Pure Strike out of a stance.
  const unblockable = rule?.unblockable ?? false;
  const unblockableLine =
    unblockable === false
      ? []
      : [
          {
            text:
              unblockable === true
                ? "Cannot be blocked"
                : `${conditionText(unblockable)}: cannot be blocked`,
            magnitude: undefined,
          },
        ];
  // A critical whatever the roll (#1315): Critical Strike's always,
  // Malicious Strike's on a conditioned foe.
  const criticalWhen = rule?.criticalWhen;
  const criticalLine =
    criticalWhen === undefined
      ? []
      : [
          {
            text:
              criticalWhen === "always"
                ? "Results in a critical hit"
                : `${conditionText(criticalWhen)}: results in a critical hit`,
            magnitude: undefined,
          },
        ];
  // A scythe's attack skill cleaves as its swing does (#977), unless it
  // has an area of its own.
  const cleaves = skill.attack?.weapon === "scythe" && skill.area === undefined;
  const cleaveLine = cleaves
    ? [
        {
          text: `Hits up to ${String(WEAPONS.scythe.cleaveTargets)} adjacent foes too`,
          magnitude: undefined,
        },
      ]
    : [];
  // Eremite's Attack's every adjacent foe while a state holds (#1021).
  const cleavesAllWhen = cleaves ? skill.attack.cleavesAllWhen : undefined;
  const cleaveAllLine =
    cleavesAllWhen === undefined
      ? []
      : [
          {
            text: `${conditionText(cleavesAllWhen)}: hits every adjacent foe`,
            magnitude: undefined,
          },
        ];
  // Its own armor penetration (#923): Spear of Lightning's 25%.
  const armorPenetration = rule?.armorPenetration ?? 0;
  const penetrationLine =
    armorPenetration > 0
      ? [
          {
            text: `${String(Math.round(armorPenetration * 100))}% armor penetration`,
            magnitude: undefined,
          },
        ]
      : [];
  // An attack skill's if-blocked effects (#534), after the ones a hit gets.
  const onBlocked = (rule?.onBlocked ?? []).flatMap((effect) =>
    describeEffects(effect, ranks).map(({ text, magnitude }) => ({
      text: `If blocked: ${lowerFirst(text)}`,
      magnitude,
    })),
  );
  // On a critical hit, after its effects; if it fails to hit (#1486).
  const onCritical = (rule?.onCritical ?? []).flatMap((effect) =>
    describeEffects(effect, ranks).map(({ text, magnitude }) => ({
      text: `On a critical hit: ${lowerFirst(text)}`,
      magnitude,
    })),
  );
  const onFailedToHit = (rule?.onFailedToHit ?? []).flatMap((effect) =>
    describeEffects(effect, ranks).map(({ text, magnitude }) => ({
      text: `If it fails to hit: ${lowerFirst(text)}`,
      magnitude,
    })),
  );
  // Barrage's and Volley's (#1629), before anything else it does.
  const preparationsLine =
    rule?.removesPreparations === true
      ? [{ text: "All your preparations are removed", magnitude: undefined }]
      : [];
  // A throw faster than the weapon's (#1486): Mighty Throw's ×3.
  const flightSpeed = rule?.flightSpeed;
  const flightLine =
    flightSpeed === undefined
      ? []
      : [
          {
            text:
              flightSpeed.when === undefined
                ? `Flies ×${String(flightSpeed.multiplier)} as fast`
                : `${conditionText(flightSpeed.when)}: flies ×${String(flightSpeed.multiplier)} as fast`,
            magnitude: undefined,
          },
        ];
  // Dual Shot's arrows (#1539): "Shoot two arrows simultaneously at target
  // foe. These arrows deal 25% less damage".
  const strikes = rule?.strikes ?? 1;
  const count = typeof strikes === "number" ? strikes : strikes.count;
  // Forked Arrow's (#1914): "only one arrow" while its state holds.
  const fewer =
    typeof strikes === "number" ? "" : `; ${conditionText(strikes.oneWhile).toLowerCase()}, only 1`;
  const weaponDamage = rule?.weaponDamage ?? 1;
  const weaker =
    weaponDamage > 0 && weaponDamage < 1
      ? `, each dealing ${String(Math.round((1 - weaponDamage) * 100))}% less damage`
      : "";
  // Sun and Moon Slash's, a dual attack's (#1618): "Strikes twice".
  const strikesText = count === 2 ? "Strikes twice" : `Strikes ${String(count)} times`;
  const arrowsLine =
    count <= 1
      ? []
      : skill.attack?.weapon === "bow"
        ? [
            {
              text: `Shoots ${String(count)} arrows at once${weaker}${fewer}`,
              magnitude: undefined,
            },
          ]
        : [{ text: `${strikesText}${weaker}${fewer}`, magnitude: undefined }];
  // A status borne while activating (#524): Healing Signet's armor loss.
  const whileActivating =
    skill.whileActivating === undefined
      ? []
      : [
          {
            text: `While activating: ${statusText(skill.whileActivating, ranks)}`,
            magnitude: undefined,
          },
        ];
  // A trap (#1105), or a skill that says so (#1629): any attack that lands
  // while it is being used interrupts it.
  const easilyInterrupted = isEasilyInterrupted(skill)
    ? [{ text: "Easily interrupted", magnitude: undefined }]
    : [];
  // Natural Healing's (#1916): "if you are not enchanted, this spell activates 50% faster".
  const activationWhileLine =
    skill.activationWhile === undefined
      ? []
      : [
          {
            text: `${conditionText(skill.activationWhile.condition)}: activates ${String(Math.round(Math.abs(1 - skill.activationWhile.multiplier) * 100))}% ${skill.activationWhile.multiplier < 1 ? "faster" : "slower"}`,
            magnitude: undefined,
          },
        ];
  // Healing Touch's (#1754).
  const divineFavorLine =
    skill.divineFavorDoubled === true
      ? [{ text: "Health gain from Divine Favor is doubled", magnitude: undefined }]
      : [];
  // A spell that flies (#535) lands only if it reaches its target.
  // Several (#1914): Dancing Daggers' three, Lava Arrows' one a foe.
  const shots = skill.projectile?.shots ?? 1;
  const projectile =
    skill.projectile === undefined
      ? []
      : [
          {
            text:
              shots > 1
                ? `${String(shots)} projectiles: each can be dodged`
                : skill.projectile.spread === true
                  ? "A projectile at each foe: each can be dodged"
                  : "Projectile: can be dodged",
            magnitude: undefined,
          },
        ];
  // "This spell has half the normal range" (#1326): Caltrops, the daggers.
  const halfRange =
    skill.target !== "self" && skill.range === RANGE_SPELL / 2
      ? [{ text: "Half the normal range", magnitude: undefined }]
      : [];
  // A skill that exploits a corpse (#466) says so before what it does,
  // and which: its own, or its target's (#1583).
  const corpseLine =
    skill.corpse === undefined
      ? []
      : [
          {
            text:
              (skill.corpse.near === "target"
                ? "Exploits the corpse nearest your target"
                : skill.corpse.all === true
                  ? `Exploits every fresh corpse ${AREA_TEXT.get(skill.corpse.radius) ?? `within ${String(skill.corpse.radius)}`}`
                  : "Exploits the nearest corpse") +
              // A well's price for none (#1730).
              (skill.corpse.elseSacrificePercent === undefined
                ? ""
                : `, or sacrifices ${String(skill.corpse.elseSacrificePercent)}% Health if none is near`),
            magnitude: undefined,
          },
        ];
  // A pet that comes with the skill on the bar (#1046): Charm Animal's.
  const companionHealth =
    skill.companion === undefined ? undefined : describeMagnitude(skill.companion.maxHealth, ranks);
  const companionLine =
    skill.companion === undefined || companionHealth === undefined
      ? []
      : [
          {
            text: `While on your bar, a ${skill.companion.name} (${shown(companionHealth)} Health) fights beside you`,
            magnitude: companionHealth,
          },
        ];
  // A form's lockout (#1437), beside the recharge the card shows.
  const disabledLine =
    skill.disabledAfterUseSeconds === undefined
      ? []
      : [
          {
            text: `Disabled for ${seconds(skill.disabledAfterUseSeconds)} after use`,
            magnitude: undefined,
          },
        ];
  const effects = [
    ...lossLine,
    ...preparationsLine,
    ...chainLine,
    ...bonusLine,
    ...unblockableLine,
    ...criticalLine,
    ...cleaveLine,
    ...cleaveAllLine,
    ...penetrationLine,
    ...flightLine,
    ...arrowsLine,
    ...corpseLine,
    ...skill.effects.flatMap((effect) =>
      effect.kind === "disable-own-skills" &&
      effect.which === "attribute" &&
      effect.attributeId === skill.attributeId
        ? [
            {
              text: disableOwnText(effect, true, shown(describeMagnitude(effect.seconds, ranks))),
              magnitude: describeMagnitude(effect.seconds, ranks),
            },
          ]
        : // Martyr's (#1954): its targets are the party it takes from.
          effect.kind === "transfer-conditions" &&
            effect.from === "target" &&
            skill.area?.origin === "party"
          ? [
              {
                text: "Take all conditions from your allies, with the time each has left",
                magnitude: undefined,
              },
            ]
          : describeEffects(petReads(skill, effect), ranks),
    ),
    ...onCritical,
    ...onBlocked,
    ...onFailedToHit,
    ...whileActivating,
    ...activationWhileLine,
    ...divineFavorLine,
    ...easilyInterrupted,
    ...projectile,
    ...halfRange,
    ...companionLine,
    ...disabledLine,
  ];
  const { target, range } = targetAndRange(skill);
  const numbers = [
    ...bonusLine.flatMap(({ text, magnitude }) =>
      magnitude === undefined ? [] : [{ text, scales: magnitude.attributeId !== undefined }],
    ),
    ...skill.effects.flatMap((effect) => headlineOf(effect, ranks) ?? []),
  ];
  const headline = (numbers.find((number) => number.scales) ?? numbers[0])?.text;
  return {
    id: skill.id,
    name: skill.name,
    typeText: `${skill.elite ? "Elite " : ""}${skill.flash ? "Flash " : ""}${TYPE_TEXT[skill.type]}`,
    elite: skill.elite,
    weaponText: skill.attack === undefined ? undefined : WEAPON_TEXT[skill.attack.weapon],
    attributeId: skill.attributeId,
    attributeName:
      skill.attributeId === undefined
        ? undefined
        : (getAttribute(skill.attributeId)?.name ?? skill.attributeId),
    effects: effects.map((line) => ({
      ...line,
      text: plain(line.text),
      parts: partsOf(line.text),
    })),
    cost: costText(skill, ranks),
    castTime: castTimeText(skill, ranks),
    recharge:
      skill.rechargesOnMoraleBoost === true ? "Morale boost" : seconds(skill.rechargeSeconds),
    rangeText: range,
    targetText: target,
    scalesWithAttribute: effects.some((effect) => effect.magnitude?.attributeId !== undefined),
    headline: headline === undefined ? undefined : plain(headline),
    headlineParts: headline === undefined ? undefined : partsOf(headline),
  };
}
