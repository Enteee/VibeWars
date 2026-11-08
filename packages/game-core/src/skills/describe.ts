import { AREA_ADJACENT, AREA_EARSHOT, AREA_NEARBY, RANGE_SPELL } from "../distances.js";
import { WEAPONS } from "../equipment/weapons.js";
import {
  SPAWNING_POWER_ATTRIBUTE,
  spawningPowerHealth,
  spawningPowerMultiplier,
} from "../primary-attributes.js";
import type { ProfessionId } from "../professions.js";

import { energyCostOf } from "./activation.js";
import { creatureDamageMultiplier } from "./damage.js";
import { resolveMagnitudeAtRanks, statAt, statAtTwelve } from "./scaling.js";
import { isSelfOnlyStatus } from "./self-only.js";
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
  type RenewEvent,
  type SourceAttacks,
  type StatusCategory,
  type StatusConditionalArmor,
  type StatusDefinition,
  type StatusStat,
  type StatusTrigger,
  type StatusTriggerEvent,
  type TriggerEffect,
} from "./status.js";
import { effectiveActivationSeconds, outsideMatch, rankOf } from "./tick.js";
import { blowRuleOf, isEasilyInterrupted } from "./types.js";
import type { DescribeNames, DescribeWords } from "./describe-words.js";
import type {
  AdrenalineGainEffect,
  ApplyStatusEffect,
  RadiusArea,
  AttackWeaponClass,
  Aura,
  CreatureTemplate,
  DeathBurst,
  DeathInRange,
  ChainStep,
  CreatureAttack,
  CreatureLevel,
  DisableOwnSkillsEffect,
  EffectCondition,
  EnergyGainEffect,
  HealEffect,
  Magnitude,
  PerCount,
  CountRule,
  RemoveStatusEffect,
  Skill,
  SkillEffect,
  SkillType,
  StateCondition,
  UnconditionalEffect,
  SplashEffect,
  SpiritPulse,
  DamageEffect,
  TransferConditionsEffect,
} from "./types.js";

/** What a description is said with: the player's language, or English. */
interface Say {
  readonly words: DescribeWords;
  readonly names: DescribeNames;
}

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

/** The Spawning Power rank these ranks hold (#1098). */
function spawningPowerOf(ranks: ReadonlyMap<string, number>): number {
  return rankOf(outsideMatch(ranks), SPAWNING_POWER_ATTRIBUTE);
}

/**
 * "31.1s (21s)": how long a status lasts at these ranks, the base in
 * brackets when Spawning Power lengthens a weapon spell (#1098).
 */
function statusDuration(
  say: Say,
  effect: ApplyStatusEffect,
  ranks: ReadonlyMap<string, number>,
): string {
  if (effect.per !== undefined) {
    // "Lead the Way!"'s (#1955): "4s for each ally in earshot (maximum 30)".
    return withPerText(
      say,
      lasting(say, effect.durationSeconds, ranks),
      effect.durationSeconds,
      effect.per,
      ranks,
      {
        alone: "",
        unit: say.words.s(),
        onTarget: say.words.onTarget(),
      },
    ).trim();
  }
  const base = lasting(say, effect.durationSeconds, ranks);
  if (findStatusDefinition(effect.statusId)?.category !== "weapon-spell") {
    return base;
  }
  const at = resolveMagnitudeAtRanks(effect.durationSeconds, ranks);
  const lasts = at * spawningPowerMultiplier(spawningPowerOf(ranks));
  return say.words.composedLastsAtBase({ lasts, at, base });
}

/** "16s": `duration` at these ranks, marked when it scales (#2041). */
function lasting(say: Say, duration: Magnitude, ranks: ReadonlyMap<string, number>): string {
  const magnitude = describeMagnitude(duration, ranks);
  return shown(magnitude, say.words.seconds(magnitude.current));
}

/** Whether `duration` has an end at all (#1789, #1941): Glyph of Energy's has none. */
function ends(duration: Magnitude): boolean {
  return !("flat" in duration) || Number.isFinite(duration.flat);
}

/**
 * A sure block that its own first block ends (#2500): Shield of Force's
 * "blocks the next 1 attacks", Riposte's "the next melee attack". It ends
 * when triggered, and a block trigger fires on every block it makes: an
 * unfiltered one, or one for each kind it blocks.
 */
function blocksOnce(definition: StatusDefinition): boolean {
  if (definition.block?.chance !== 1 || !definition.endsWhenTriggered) {
    return false;
  }
  const kinds = new Set(
    definition.triggers
      .filter((trigger) => trigger.on === "bearer-blocks")
      .map((trigger) => trigger.blocked ?? "all"),
  );
  return (
    kinds.has("all") ||
    kinds.has(definition.block.against) ||
    (kinds.has("melee") && kinds.has("projectile"))
  );
}

/**
 * The attributes a `scope` holds (#1929, #1941): "attributes", "primary
 * attribute", "elemental attributes", "Ritualist attributes", "Marksmanship".
 */
function scopeText(say: Say, scope: AttributeScope): string {
  if (typeof scope === "object") {
    return "profession" in scope
      ? say.words.attributes({ name: say.names.profession(scope.profession) })
      : say.names.attribute(scope.attributeId);
  }
  return scope === "all" ? say.words.attributes2() : say.words.attributePrimaryS({ scope });
}

/**
 * A scope before a noun (#1951): "Fire Magic skill", "elemental hex",
 * "Ritualist spell".
 */
function scopeAdjective(say: Say, scope: AttributeScope): string {
  if (typeof scope === "object") {
    return "profession" in scope
      ? say.names.profession(scope.profession)
      : say.names.attribute(scope.attributeId);
  }
  return scope === "all" ? "" : scope;
}

/** What an `attributeSet` does (#1929): "attributes set to 0", "elemental attributes set to 13". */
function attributeSetText(say: Say, { scope, rank }: AttributeSet): string {
  return say.words.setTo({ scope: scopeText(say, scope), rank: String(rank) });
}

/** What an attribute delta does (#762, #1941): "−1 to all attributes", "+1 to Marksmanship". */
function attributeDeltaText(say: Say, { scope, amount }: AttributeDelta): string {
  return say.words.toAllAllAttributes({
    amount: signed(amount),
    value: scope === "all" ? say.words.allAttributes() : scopeText(say, scope),
  });
}

/** `n` with its sign, a minus as GW1 prints it: "+3", "−66". */
function signed(n: number): string {
  return n > 0 ? `+${String(n)}` : `−${String(-n)}`;
}

/** What renews a status (#2501), as "renewed whenever you cast a spell". */
function renewText(say: Say, event: RenewEvent, selfOnly: boolean): string {
  switch (event) {
    case "chant-or-shout-ends":
      return say.words.renewedWheneverAChantOrShoutEnds({ selfOnly });
    case "bearer-casts-spell":
      return say.words.renewedWheneverYouCastItCastsA({ selfOnly });
    // Lyssa's Aura's (#2132).
    case "bearer-casts-spell-at-foe":
      return say.words.reappliedWheneverYouCastItCastsA({ selfOnly });
    case "bearer-takes-elemental-damage":
      return say.words.renewedWheneverYouTakeItTakesElemental({ selfOnly });
    case "bearer-enchantment-ends":
      return say.words.renewedWheneverAnEnchantmentOnYouIt({ selfOnly });
  }
}

/**
 * A change in how fast adrenaline builds: "gain adrenaline 33% faster",
 * or, slowed, as Soothing's (#1550), "gain adrenaline 50% slower".
 */
function adrenalineGainText(
  say: Say,
  faster: StatusStat,
  ranks: ReadonlyMap<string, number> | undefined,
): string {
  const shown = statText(faster, ranks, percent);
  return say.words.gainAdrenalineFasterSlower({ shown, faster: statAtTwelve(faster) });
}

/**
 * "enchantments and stances on the bearer expire 20...60% faster"
 * (#2373): one line when the two match, as Mark of Insecurity's does.
 */
function fasterExpiryText(
  say: Say,
  definition: StatusDefinition,
  ranks: ReadonlyMap<string, number> | undefined,
): string[] {
  const { enchantmentsExpireFaster: enchantments, stancesExpireFaster: stances } = definition;
  const line = (what: string, stat: StatusStat): string =>
    say.words.onTheBearerExpireFaster({ what, stat: statText(stat, ranks, percent) });
  if (statAtTwelve(enchantments) !== 0 && statAtTwelve(stances) !== 0) {
    const same = statText(enchantments, ranks, percent) === statText(stances, ranks, percent);
    if (same) {
      return [line(say.words.enchantmentsAndStances(), enchantments)];
    }
  }
  return [
    ...(statAtTwelve(enchantments) === 0 ? [] : [line(say.words.enchantments(), enchantments)]),
    ...(statAtTwelve(stances) === 0 ? [] : [line(say.words.stances(), stances)]),
  ];
}

/**
 * What a hex gives its source's attacks against its bearer (#2502), in the
 * corpus's words: Siphon Strength's "your attacks against it have +50%
 * critical chance", Shadowy Burden's "−28 armor against your attacks
 * while it has no other hexes".
 */
function sourceAttacksText(
  say: Say,
  { criticalChanceBonus, armorModifier, onlyWhileNoOtherHex }: SourceAttacks,
  ranks: ReadonlyMap<string, number> | undefined,
): string[] {
  return [
    ...(criticalChanceBonus === 0
      ? []
      : [
          say.words.yourAttacksAgainstItHaveCriticalChance({
            criticalChanceBonus: signed(Math.round(criticalChanceBonus * 100)),
          }),
        ]),
    ...(statAtTwelve(armorModifier) === 0
      ? []
      : [
          say.words.armorAgainstYourAttacksWhileItHas({
            armorModifier: signedStat(armorModifier, ranks),
            onlyWhileNoOtherHex,
          }),
        ]),
  ];
}

/** "45%": a share as its line prints it, whatever its sign. */
function percent(share: number): string {
  return `${String(Math.round(Math.abs(share) * 100))}%`;
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

/** "+5", "−8": a whole status stat with its sign, scaled as `statText` (#2191). */
function signedStat(stat: StatusStat, ranks: ReadonlyMap<string, number> | undefined): string {
  return `${statAtTwelve(stat) > 0 ? "+" : "−"}${statText(stat, ranks, whole)}`;
}

function whole(value: number): string {
  return String(Math.abs(Math.round(value)));
}

/** "2.6": to the tenth, Energy Boon's Health a point (#2503). */
function tenths(value: number): string {
  return String(Math.round(value * 10) / 10);
}

/**
 * What a status actually does, so a tooltip does not just name it.
 * `ranks` are its caster's, for a trigger an attribute scales (#944),
 * Patient Spirit's heal, and for a stat (#1976), Endure Pain's Health.
 * Without them, as for a status on a bearer, whose source's ranks the
 * client does not have, a trigger reads at rank 0 and a stat as its range.
 */
export function describeStatus(
  id: string,
  ranks: ReadonlyMap<string, number> | undefined,
  words: DescribeWords,
  names: DescribeNames,
): string {
  const say: Say = { words, names };
  return plain(statusText(say, id, ranks));
}

/**
 * `describeStatus`, its scaled numbers still marked for the skill line it
 * sits in. `holdingSaid`: the line already says "holding an item", as an
 * aura's does, so Empowerment's stats do not say it twice (#2493).
 */
function statusText(
  say: Say,
  id: string,
  ranks: ReadonlyMap<string, number> | undefined,
  holdingSaid = false,
): string {
  const definition = findStatusDefinition(id);
  if (definition === undefined) {
    return id;
  }
  const triggerRanks = ranks ?? NO_RANKS;
  // Only its caster's own reads "you" (#2341); one an ally can bear, "the bearer".
  const selfOnly = isSelfOnlyStatus(id);
  const bearer = say.words.youTheBearer({ selfOnly });
  const endsIf = (phrase: string): string =>
    say.words.endsIfYouEndsIfTheBearer({ selfOnly, phrase });
  const healthPips = statAtTwelve(definition.healthPips);
  const armorModifier = statAtTwelve(definition.armorModifier);
  const physicalDamageTakenBonus = statAtTwelve(definition.physicalDamageTakenBonus);
  const attackDurationMultiplier = statAtTwelve(definition.attackDurationMultiplier);
  const parts: string[] = [];
  // In pips, as GW1 words it: "−3 Health degeneration".
  if (healthPips < 0) {
    parts.push(
      say.words.healthDegeneration({ healthPips: statText(definition.healthPips, ranks, whole) }),
    );
  }
  if (healthPips > 0) {
    parts.push(
      say.words.healthRegeneration({ healthPips: statText(definition.healthPips, ranks, whole) }),
    );
  }
  if (definition.healthPipsPerEnchantment !== undefined) {
    const { pips, max } = definition.healthPipsPerEnchantment;
    parts.push(
      say.words.healthRegenerationForEachEnchantmentOnYou({ pips: String(pips), max: String(max) }),
    );
  }
  // Blood is Power's at its caster's rank (#2328); none at a rank that
  // gives none, Lyssa's Aura's at 0.
  const energyPips =
    ranks === undefined
      ? statAtTwelve(definition.energyPips)
      : Math.round(statAt(definition.energyPips, ranks));
  if (energyPips < 0) {
    parts.push(
      say.words.energyDegeneration({ energyPips: statText(definition.energyPips, ranks, whole) }),
    );
  }
  if (energyPips > 0) {
    parts.push(
      say.words.energyRegeneration({ energyPips: statText(definition.energyPips, ranks, whole) }),
    );
  }
  // Melandru's Resilience's (#2189), Conviction's scaled (#2217).
  if (statAtTwelve(definition.healthPipsPerCondition) !== 0) {
    parts.push(
      say.words.healthRegenerationForEachConditionOnYou({
        healthPipsPerCondition: signedStat(definition.healthPipsPerCondition, ranks),
      }),
    );
  }
  for (const [pips, what, each] of [
    [definition.healthPipsPerHex, say.words.health(), say.words.hex()],
    [definition.energyPipsPerCondition, say.words.energy(), say.words.condition()],
    [definition.energyPipsPerHex, say.words.energy(), say.words.hex()],
  ] as const) {
    if (pips !== 0) {
      parts.push(say.words.regenerationForEachOnYou({ pips: signed(pips), what, each }));
    }
  }
  if (armorModifier !== 0) {
    const sign = armorModifier > 0 ? "+" : "-";
    // Dwarven Battle Stance's "if you are wielding a hammer" (#2335).
    const weapon = definition.armorModifierWeapon;
    parts.push(
      say.words.armorWhileWielding({
        sign,
        armorModifier: statText(definition.armorModifier, ranks, whole),
        weapon,
      }),
    );
  }
  for (const bonus of definition.conditionalArmor) {
    parts.push(statusArmorText(say, bonus, ranks));
  }
  if (definition.armorWhileStill !== 0) {
    parts.push(
      say.words.armorWhileNotMoving({ armorWhileStill: signed(definition.armorWhileStill) }),
    );
  }
  if (definition.healthPerSecondWhileMoving !== 0) {
    parts.push(
      say.words.healthPerSecondWhileMoving({
        healthPerSecondWhileMoving: String(definition.healthPerSecondWhileMoving),
      }),
    );
  }
  if (definition.healthPerSecond !== 0) {
    parts.push(say.words.healthPerSecond({ healthPerSecond: String(definition.healthPerSecond) }));
  }
  if (definition.healthPerSecondNearSpirit !== 0) {
    parts.push(
      say.words.healthPerSecondMoreInEarshotOf({
        healthPerSecondNearSpirit: String(definition.healthPerSecondNearSpirit),
      }),
    );
  }
  if (definition.spellRechargeFasterNearSpirit !== 0) {
    const faster = String(Math.round(definition.spellRechargeFasterNearSpirit * 100));
    parts.push(say.words.spellsCastInEarshotOfASpirit({ faster }));
  }
  if (definition.doubleStrikeChanceBonus !== 0) {
    const chance = String(Math.round(definition.doubleStrikeChanceBonus * 100));
    const weapon = definition.doubleStrikeChanceBonusWeapon;
    parts.push(say.words.chanceToDoubleStrikeWhileWielding({ chance, weapon }));
  }
  if (definition.armorReduction !== undefined) {
    const { amount, floor } = definition.armorReduction;
    parts.push(say.words.armorNotBelow({ amount: String(amount), floor: String(floor) }));
  }
  if (definition.moveSpeedMultiplier !== 1) {
    const speed = statText(definition.moveSpeedMultiplier, ranks, (multiplier) =>
      String(Math.round(multiplier * 100)),
    );
    parts.push(say.words.movesAtSpeed({ speed }));
  }
  if (definition.moveSpeedWhileEnchanted !== 1) {
    // On top of its own: Icy Shackles' 66% slower is 90% while enchanted (#2453).
    const speed = String(
      Math.round(
        statAt(definition.moveSpeedMultiplier, triggerRanks) *
          definition.moveSpeedWhileEnchanted *
          100,
      ),
    );
    parts.push(say.words.movesAtSpeedWhileEnchanted({ speed }));
  }
  if (definition.preventsSpeedBoosts) {
    parts.push(say.words.speedBoostsHaveNoEffect());
  }
  if (definition.preventsAdrenalineGain) {
    parts.push(say.words.cannotGainAdrenaline());
  }
  if (definition.returnsSource !== undefined) {
    parts.push(say.words.whenThisEndsYouReturnToWhere());
  }
  if (definition.stepsToTarget !== undefined) {
    const seconds = String(definition.stepsToTarget.disableSeconds);
    parts.push(say.words.whenThisEndsYouShadowStepTo({ seconds }));
  }
  if (definition.attackMissChance !== 0) {
    parts.push(
      say.words.ofAttacksMiss({
        attackMissChance: String(Math.round(definition.attackMissChance * 100)),
      }),
    );
  }
  if (definition.maxHealthLoss !== undefined) {
    const { fraction, cap } = definition.maxHealthLoss;
    parts.push(
      say.words.maximumHealthAtMost({
        fraction: String(Math.round(fraction * 100)),
        cap: String(cap),
      }),
    );
  }
  if (statAtTwelve(definition.maxHealthBonus) !== 0) {
    parts.push(
      say.words.maximumHealth({
        maxHealthBonus: statText(definition.maxHealthBonus, ranks, whole),
      }),
    );
  }
  if (definition.maxHealthBonusPerEnchantment !== 0) {
    parts.push(
      say.words.maximumHealthPerEnchantment({
        maxHealthBonusPerEnchantment: String(definition.maxHealthBonusPerEnchantment),
      }),
    );
  }
  if (definition.maxEnergyBonus !== 0) {
    parts.push(say.words.maximumEnergy({ maxEnergyBonus: String(definition.maxEnergyBonus) }));
  }
  if (statAtTwelve(definition.maxHealthPerMaxEnergy) !== 0) {
    const per = statText(definition.maxHealthPerMaxEnergy, ranks, tenths);
    parts.push(say.words.maximumHealthPerPointOfMaximumEnergy({ per }));
  }
  if (definition.minionDamageBonus !== 0) {
    parts.push(
      say.words.yourMinionsDealDamage({ minionDamageBonus: signed(definition.minionDamageBonus) }),
    );
  }
  if (definition.minionHitHealthLossPercent !== 0) {
    parts.push(
      say.words.loseMaximumHealthEachTimeAMinion({
        minionHitHealthLossPercent: String(definition.minionHitHealthLossPercent),
      }),
    );
  }
  if (definition.redirectsConditionsToMinion) {
    parts.push(say.words.conditionsYouWouldReceiveGoToYour());
  }
  if (statAtTwelve(definition.healingMultiplier) !== 1) {
    const more = statAtTwelve(definition.healingMultiplier) > 1;
    const change = statText(definition.healingMultiplier, ranks, (value) => percent(value - 1));
    parts.push(say.words.healing({ more, change }));
  }
  if (definition.weaponDamageMultiplier !== 1) {
    const change = Math.round((definition.weaponDamageMultiplier - 1) * 100);
    parts.push(say.words.weaponDamage({ change: signed(change) }));
  }
  // Vengeance's (#2311).
  if (statAtTwelve(definition.damageDealtMultiplier) !== 1) {
    const more = statAtTwelve(definition.damageDealtMultiplier) > 1;
    const change = statText(definition.damageDealtMultiplier, ranks, (value) =>
      percent(Math.abs(value - 1)),
    );
    parts.push(say.words.dealsDamage({ more, change }));
  }
  if (definition.noDeathPenalty) {
    parts.push(say.words.noDeathPenalty());
  }
  // Death Pact Signet's (#2479).
  if (definition.killsSourceOnDeath) {
    parts.push(say.words.whenTheBearerDiesSoDoesIts());
  }
  // "We Shall Return!"'s (#2479).
  if (definition.resurrectionBonus !== undefined) {
    const { healthPercent, energyPercent } = definition.resurrectionBonus;
    const health = statText(healthPercent, ranks, (value) => `${whole(value)}%`);
    const energy = statText(energyPercent, ranks, (value) => `${whole(value)}%`);
    parts.push(say.words.alliesYouResurrectReturnWithHealthAnd({ health, energy }));
  }
  if (definition.killsBearerOnEnd) {
    parts.push(say.words.youDieTheBearerDiesWhenIt({ selfOnly }));
    if (definition.exploitsCorpseOnDeath) {
      parts.push(say.words.leavesAnExploitedCorpse());
    }
  }
  if (physicalDamageTakenBonus !== 0) {
    const sign = physicalDamageTakenBonus > 0 ? "+" : "−";
    const amount = statText(definition.physicalDamageTakenBonus, ranks, whole);
    parts.push(say.words.takeFromPhysicalDamage({ sign, amount }));
  }
  if (definition.elementalDamageTakenAs !== undefined) {
    parts.push(
      say.words.elementalDamageTakenIsDamage({
        elementalDamageTakenAs: definition.elementalDamageTakenAs,
      }),
    );
  }
  if (definition.physicalDamageTakenAs !== undefined) {
    parts.push(
      say.words.physicalDamageTakenIsDamage({
        physicalDamageTakenAs: definition.physicalDamageTakenAs,
      }),
    );
  }
  if (definition.physicalDamageDealtAs !== undefined) {
    parts.push(
      say.words.physicalDamageDealtIsDamage({
        physicalDamageDealtAs: definition.physicalDamageDealtAs,
      }),
    );
  }
  if (definition.elementalDamageDealtAs !== undefined) {
    parts.push(
      say.words.elementalDamageDealtIsDamage({
        elementalDamageDealtAs: definition.elementalDamageDealtAs,
      }),
    );
  }
  if (definition.damageFromSpiritAttacks !== 0) {
    parts.push(
      say.words.takeFromSpiritsAttacks({
        damageFromSpiritAttacks: signed(definition.damageFromSpiritAttacks),
      }),
    );
  }
  if (definition.attackDamageType !== undefined) {
    const weapon = definition.attackDamageTypeWeapon;
    parts.push(
      say.words.attacksAttacksDealDamage({ weapon, attackDamageType: definition.attackDamageType }),
    );
  }
  if (definition.attackArmorPenetration !== 0) {
    parts.push(
      say.words.attacksHaveArmorPenetration({
        attackArmorPenetration: String(Math.round(definition.attackArmorPenetration * 100)),
      }),
    );
  }
  if (statAtTwelve(definition.attackDamageDelta) !== 0) {
    const weapon = definition.attackDamageDeltaWeapon;
    const delta = statAtTwelve(definition.attackDamageDelta);
    const amount = statText(definition.attackDamageDelta, ranks, (value) =>
      String(Math.abs(Math.round(value))),
    );
    parts.push(say.words.attacksAttacksDealLessMoreDamage({ weapon, amount, delta }));
  }
  if (definition.immuneTo.length > 0) {
    const names = definition.immuneTo.map((id) => say.names.status(id));
    parts.push(say.words.immuneToAnd({ names: names.join(say.words.and()) }));
  }
  if (definition.refuses.length > 0) {
    // Frigid Armor's "cannot be set on fire" (#2373).
    const names = definition.refuses.map((id) =>
      id === "burning" ? say.words.setOnFire() : say.names.status(id),
    );
    parts.push(say.words.cannotBeOr({ names: names.join(say.words.or()) }));
  }
  if (statAtTwelve(definition.adrenalineGainFaster) !== 0) {
    parts.push(
      say.words.attacksFromAttacks({
        adrenalineGain: adrenalineGainText(say, definition.adrenalineGainFaster, ranks),
        adrenalineGainFasterFrom: definition.adrenalineGainFasterFrom,
      }),
    );
  }
  parts.push(...definition.attributeDeltas.map((value) => attributeDeltaText(say, value)));
  if (definition.attributeSet !== undefined) {
    parts.push(attributeSetText(say, definition.attributeSet));
  }
  if (definition.borrowsAttribute !== undefined) {
    const { attributeId, skillType, uses } = definition.borrowsAttribute;
    const name = say.names.attribute(attributeId);
    if (uses === undefined) {
      // Symbols of Inspiration's "elite skills you cast" (#2502).
      parts.push(say.words.yourEliteEliteSkillSUse({ skillType, name }));
    } else {
      const next =
        uses === 1
          ? say.words.uses({ skillType })
          : say.words.sUse({ uses: String(uses), skillType });
      parts.push(say.words.yourNext({ next, name }));
    }
  }
  if (definition.castTimeMultiplier !== 1) {
    parts.push(
      say.words.spellsTakeAsLongToCast({
        castTimeMultiplier: String(definition.castTimeMultiplier),
      }),
    );
  }
  if (definition.skillActivationMultiplier !== 1) {
    parts.push(
      say.words.skillsButAttacksTakeAsLongTo({
        skillActivationMultiplier: String(definition.skillActivationMultiplier),
      }),
    );
  }
  if (definition.interruptsSpells) {
    parts.push(say.words.spellsAreInterruptedByAttacks());
  }
  if (attackDurationMultiplier !== 1) {
    // GW1's wording: "50% slower" is 1.5× as long, "33% faster" is 0.67×.
    const change = statText(definition.attackDurationMultiplier, ranks, (multiplier) =>
      String(Math.round(Math.abs(multiplier - 1) * 100)),
    );
    const way = say.words.slowerFaster({ attackDurationMultiplier });
    // Rapid Fire's "while wielding a bow" (#2189).
    const weapon = definition.attackDurationMultiplierWeapon;
    parts.push(say.words.attacksWhileWielding({ change, way, weapon }));
  }
  // Archer's Signet's "150% longer while wielding a bow" (#2321).
  if (statAtTwelve(definition.conditionDurationMultiplier) !== 1) {
    const longer = statText(definition.conditionDurationMultiplier, ranks, (multiplier) =>
      String(Math.round((multiplier - 1) * 100)),
    );
    const weapon = definition.conditionDurationMultiplierWeapon;
    parts.push(say.words.conditionsYouApplyLastLongerWhileWielding({ longer, weapon }));
  }
  if (definition.upkeepMultiplier !== 1) {
    parts.push(
      say.words.enchantmentsYouMaintainCostTheUpkeep({
        upkeepMultiplier: String(definition.upkeepMultiplier),
      }),
    );
  }
  if (definition.overcastSurcharge > 0) {
    parts.push(
      say.words.spellsThatCauseOvercastCauseMoreAs({
        overcastSurcharge: String(definition.overcastSurcharge),
      }),
    );
  }
  if (definition.projectileSpeedMultiplier !== 1) {
    parts.push(
      say.words.arrowsMoveAsFast({
        projectileSpeedMultiplier: String(definition.projectileSpeedMultiplier),
      }),
    );
  }
  if (definition.preventsSpells) {
    parts.push(say.words.cannotCastSpells());
  }
  if (definition.preventsAttacks) {
    parts.push(say.words.cannotAttack());
  }
  if (definition.preventsResurrection) {
    parts.push(say.words.cannotUseResurrectionSkills());
  }
  if (definition.untargetableByFoeSpells) {
    // Spell Shield's (#2189).
    parts.push(say.words.cannotBeTheTargetOfEnemySpells({ whileCasting: definition.whileCasting }));
  }
  if (definition.untargetableBySpells) {
    parts.push(say.words.cannotBeTheTargetOfSpells());
  }
  // Shadow Form's (#1951).
  if (definition.foeSpellsFail) {
    parts.push(say.words.hostileSpellsTargetingYouFail());
  }
  if (definition.attacksAgainstMiss) {
    parts.push(say.words.attacksAgainstYouMiss());
  }
  if (definition.preventsEnchantments) {
    parts.push(say.words.strippedOfAllEnchantmentsAndCannotBe());
  }
  if (definition.refusesEnchantments) {
    parts.push(say.words.cannotBeTheTargetOfEnchantments());
  }
  if (definition.preventsShoutsAndChants) {
    parts.push(say.words.cannotUseShoutsOrChants());
  }
  if (definition.preventsSignets) {
    parts.push(say.words.cannotUseSignets());
  }
  if (definition.unblockableBySource) {
    parts.push(say.words.cannotBlockItsCasterSAttacks());
  }
  if (definition.unblockableByBlinded) {
    parts.push(say.words.cannotBeBlockedByBlindedFoes());
  }
  if (definition.preventsBlocking) {
    parts.push(say.words.cannotBlock());
  }
  if (definition.renewsWhileMoving !== undefined) {
    parts.push(
      say.words.renewedForSecondsIfMovingAsIt({
        renewsWhileMoving: String(definition.renewsWhileMoving),
      }),
    );
  }
  if (definition.preventsKnockdown) {
    parts.push(say.words.cannotBeKnockedDown());
  }
  if (definition.preventsFoeKnockdown) {
    parts.push(say.words.cannotBeKnockedDownByAFoe());
  }
  if (definition.endsOnKnockdownPrevented) {
    parts.push(say.words.endsIfItPreventsAKnockdown());
  }
  if (definition.ignoresCriticalDamage) {
    parts.push(say.words.youDoNotSufferExtraDamageFrom());
  }
  if (definition.preventsCriticals) {
    parts.push(say.words.cannotLandCriticalHits());
  }
  if (definition.preventsCriticalHits) {
    parts.push(say.words.immuneToCriticalHits());
  }
  if (definition.divineFavorDoubledFor !== undefined) {
    const attribute = say.names.attribute(definition.divineFavorDoubledFor);
    parts.push(say.words.spellsHaveDoubleTheDivineFavorBonus({ attribute }));
  }
  // Shield of Force's "blocks the next attack" (#2500).
  const once = blocksOnce(definition);
  if (definition.block !== undefined) {
    // Wary Stance's "attack skills" (#1978).
    const what = say.words.attackSkillAttackSkills({
      once,
      attackSkillsOnly: definition.block.attackSkillsOnly,
      against: definition.block.against,
    });
    const below =
      definition.blockBelowHealth === undefined
        ? ""
        : say.words.whileBelowHealth({
            blockBelowHealth: String(Math.round(definition.blockBelowHealth * 100)),
          });
    // Soldier's Defense's "while under a shout or chant" (#1978).
    const under =
      definition.blockWhileUnder === undefined
        ? ""
        : say.words.whileUnderOr({
            value: [
              ...definition.blockWhileUnder.categories.map(say.words.aCategory),
              ...definition.blockWhileUnder.statusIds.map(say.names.status),
            ].join(say.words.or()),
          });
    // Pensive Guardian's "from enchanted foes" (#2432): "from foes under an enchantment".
    const attacker =
      definition.blockAttackerUnder === undefined
        ? ""
        : say.words.fromFoesUnderOr({
            value: [
              ...definition.blockAttackerUnder.categories.map(say.words.aCategory),
              ...definition.blockAttackerUnder.statusIds.map(say.names.status),
            ].join(say.words.or()),
          });
    // Flashing Blades' "while attacking" (#2374).
    const attacking = say.words.whileAttacking({
      blockWhileAttacking: definition.blockWhileAttacking,
    });
    parts.push(
      say.words.blocksTheNextChanceToBlock({
        once,
        what,
        attacker,
        below,
        under,
        attacking,
        chance: String(Math.round(definition.block.chance * 100)),
      }),
    );
  }
  // Protector's Defense's "allies adjacent to you" (#2096).
  if (definition.projectsAura !== undefined) {
    const { statusId, radius } = definition.projectsAura;
    const around = say.words.within({ radius, radius2: String(radius) });
    parts.push(say.words.alliesTo({ around, bearer, status: statusText(say, statusId, ranks) }));
  }
  if (statAtTwelve(definition.criticalChanceBonus) !== 0) {
    const chance = statText(definition.criticalChanceBonus, ranks, (bonus) =>
      signed(Math.round(bonus * 100)),
    );
    // Way of the Assassin's "while wielding daggers" (#2275), Way of the
    // Master's "while holding a non-dagger weapon" (#2504).
    const weapon = definition.criticalChanceBonusWeapon;
    const holding =
      weapon === undefined
        ? ""
        : typeof weapon === "string"
          ? say.words.whileWielding({ weapon })
          : say.words.whileHoldingAWeaponOtherThan({ not: weapon.not });
    // "Fear Me!"'s "against foes that are not moving" (#2320).
    const versus = say.words.againstFoesThatAreNotMoving({
      criticalChanceBonusVersus: definition.criticalChanceBonusVersus,
    });
    parts.push(say.words.criticalChance({ chance, holding, versus }));
  }
  if (definition.sourceAttacks !== undefined) {
    parts.push(...sourceAttacksText(say, definition.sourceAttacks, ranks));
  }
  if (definition.energyPerCritical !== 0) {
    parts.push(
      say.words.gainEnergyPerCriticalHit({
        energyPerCritical: String(definition.energyPerCritical),
      }),
    );
  }
  if (definition.healthPerCritical !== 0) {
    parts.push(
      say.words.wheneverYouSuccessfullyLandACriticalHit({
        healthPerCritical: String(definition.healthPerCritical),
      }),
    );
  }
  if (definition.refreshesOnCritical) {
    parts.push(say.words.refreshesEveryTimeYouLandACritical());
  }
  if (definition.onCriticalHit !== undefined) {
    const { effects, energyIfRemoved, weapon, endsWhenFired } = definition.onCriticalHit;
    const critical = say.words.theNextTimeYouLandACritical({ endsWhenFired });
    const when = say.words.with({ weapon, critical });
    parts.push(
      ...effects.flatMap((effect) =>
        describeEffects(say, effect, new Map()).map(({ text }) =>
          say.words.removeStatusFromYourTarget({ kind: effect.kind, when, text }),
        ),
      ),
      ...(energyIfRemoved > 0
        ? [say.words.ifOneIsRemovedYouLoseEnergy({ energyIfRemoved: String(energyIfRemoved) })]
        : []),
    );
  }
  if (definition.endsAfterAttacks !== undefined) {
    parts.push(
      say.words.endsAfterIncomingAttackS({
        endsAfterAttacks: String(definition.endsAfterAttacks),
        endsAfterAttacks2: definition.endsAfterAttacks,
      }),
    );
  }
  if (definition.endsAfterAttackCount !== undefined) {
    parts.push(
      say.words.endsAfterYourNextAttackSHit({
        endsAfterAttackCount: String(definition.endsAfterAttackCount),
        endsAfterAttackCount2: definition.endsAfterAttackCount,
      }),
    );
  }
  if (definition.suppressedWhileUnder !== undefined) {
    parts.push(
      say.words.noEffectWhileUnderOr({
        suppressedWhileUnder: definition.suppressedWhileUnder
          .map(say.words.aCategory)
          .join(say.words.or()),
      }),
    );
  }
  if (definition.unblockableAttacks !== undefined) {
    parts.push(
      say.words.yourNextAttackSCannotBeBlocked({
        unblockableAttacks: String(definition.unblockableAttacks),
        unblockableAttacks2: definition.unblockableAttacks,
      }),
    );
  }
  if (definition.attacksUnblockable) {
    // Warrior's Cunning's "your melee attacks" (#2335).
    const weapon = definition.attacksUnblockableWeapon;
    parts.push(say.words.attacksCannotBeBlocked({ weapon }));
  }
  if (definition.onAttackHit !== undefined) {
    const { effects, attackSkillsOnly, weapon, weaponDamage } = definition.onAttackHit;
    const hits = describeAttackHits(
      say,
      effects,
      attackSkillsOnly,
      weapon,
      definition.category !== "weapon-spell" && weaponDamage === undefined,
      triggerRanks,
    );
    // A conjure's (#1984): "while you wield a fire weapon, foes your
    // attacks hit take 17 fire damage"; Ebon Dust Aura's "an earth" (#2513).
    parts.push(
      ...(weaponDamage === undefined
        ? hits
        : hits.map((hit) =>
            say.words.whileYouWieldAnAWeapon({
              test: /^[aeiou]/.test(weaponDamage),
              weaponDamage,
              hit,
            }),
          )),
    );
    // Order of Apostasy's price (#1975), the caster's.
    const price = definition.onAttackHit.sourceLosesPerRemoved;
    if (price !== undefined) {
      const name = say.names.profession(price.profession);
      parts.push(
        say.words.forEachEnchantmentRemovedSCasterLoses({
          name,
          name2: say.names.status(definition.id),
          percentOfMax: String(price.percentOfMax),
        }),
      );
    }
  }
  if (definition.onAttackBlocked !== undefined) {
    const { effects, attackSkillsOnly, weapon } = definition.onAttackBlocked;
    parts.push(...describeAttackBlocks(say, effects, attackSkillsOnly, weapon, triggerRanks));
  }
  if (definition.endsAfterHits !== undefined) {
    const { count, weapon } = definition.endsAfterHits;
    const how = say.words.with2({ weapon });
    parts.push(say.words.endsAfterHitS({ count: String(count), count2: count, how }));
  }
  if (definition.nextSpells !== undefined) {
    const { count, costReduction, noOvercast, rechargeFaster, projectileSpeedMultiplier } =
      definition.nextSpells;
    const one = statAtTwelve(count) === 1;
    const next = say.words.spellSpells({ one, count: statText(count, ranks, whole) });
    if (costReduction > 0) {
      parts.push(
        say.words.yourNextCostsCostLessEnergy({ next, one, costReduction: String(costReduction) }),
      );
    } else if (rechargeFaster > 0) {
      // Glyph of Swiftness' (#2453).
      parts.push(
        say.words.yourNextRechargesRechargeFaster({
          next,
          one,
          rechargeFaster: String(Math.round(rechargeFaster * 100)),
        }),
      );
    } else {
      // Glyph of Elemental Power's (#1941): a boost for the next spells alone.
      parts.push(say.words.forYourNext({ next }));
    }
    if (projectileSpeedMultiplier !== 1) {
      parts.push(
        say.words.theirProjectilesMoveAsFast({
          projectileSpeedMultiplier: String(projectileSpeedMultiplier),
        }),
      );
    }
    if (noOvercast) {
      parts.push(say.words.noOvercast());
    }
  }
  if (definition.spreads) {
    parts.push(say.words.spreadsToAdjacentCombatants());
  }
  for (const effect of definition.nextAttackSkill ?? []) {
    parts.push(...describeNextAttackSkill(say, effect, triggerRanks));
  }
  if (definition.nextAttackSkillBonus !== undefined) {
    const { condition, amount } = definition.nextAttackSkillBonus;
    const more = describeMagnitude(amount, triggerRanks);
    parts.push(
      say.words.nextAttackSkillDamage({
        condition: conditionText(say, condition),
        more: shown(more),
      }),
    );
  }
  if (definition.nextSkill !== undefined) {
    parts.push(...describeNextSkill(say, definition.nextSkill, triggerRanks));
  }
  if (definition.nextSkillRule !== undefined) {
    parts.push(...describeNextSkillRule(say, definition.nextSkillRule, ranks));
  }
  if (definition.endsWhenBearerAttacks) {
    parts.push(endsIf(say.words.attacks()));
  }
  if (definition.endsWhenBearerAttacksInMelee) {
    parts.push(endsIf(say.words.makesAMeleeAttack()));
  }
  if (definition.endsWhenBearerMoves) {
    parts.push(endsIf(say.words.moves()));
  }
  if (statAtTwelve(definition.damageTakenMultiplier) !== 1) {
    parts.push(
      say.words.takesDamage({
        damageTakenMultiplier: statText(
          definition.damageTakenMultiplier,
          ranks,
          say.words.damageTaken,
        ),
      }),
    );
  }
  if (definition.attackDamageTakenMultiplier !== 1) {
    parts.push(
      say.words.takesDamageFromTheNextAttack({
        attackDamageTakenMultiplier: definition.attackDamageTakenMultiplier,
      }),
    );
  }
  if (statAtTwelve(definition.damageReduction) > 0) {
    parts.push(
      say.words.damageTaken2({
        damageReduction: statText(definition.damageReduction, ranks, whole),
      }),
    );
  }
  if (definition.damageReductionPerRank !== undefined) {
    const { attributeId, perRank, max } = definition.damageReductionPerRank;
    const now = Math.min(max, perRank * (triggerRanks.get(attributeId) ?? 0));
    const attribute = say.names.attribute(attributeId);
    parts.push(
      say.words.damageTakenPerRankOfAtMost({
        now: String(now),
        perRank: String(perRank),
        attribute,
        max: String(max),
      }),
    );
  }
  if (definition.damageReductionPerHitTaken !== undefined) {
    const step = String(definition.damageReductionPerHitTaken);
    parts.push(say.words.damageTakenMoreEachHit({ step }));
  }
  if (definition.nextDamageReduction !== undefined) {
    parts.push(
      say.words.theNextHitDealsLessDamage({
        nextDamageReduction: statText(definition.nextDamageReduction, ranks, whole),
      }),
    );
  }
  if (definition.damageReductionWhileCasting !== undefined) {
    const { skillType, amount } = definition.damageReductionWhileCasting;
    parts.push(say.words.damageTakenWhileCastingS({ amount: String(amount), skillType }));
  }
  // The elemental mantras' (#1964).
  if (definition.damageTypeTakenMultiplier !== undefined) {
    const { type, multiplier } = definition.damageTypeTakenMultiplier;
    parts.push(say.words.lessDamage({ value: String(Math.round((1 - multiplier) * 100)), type }));
  }
  // Mist Form's (#1951).
  if (definition.damageReductionFromHexedSource !== undefined) {
    const { attributeId, fraction } = definition.damageReductionFromHexedSource;
    parts.push(
      say.words.lessDamageFromFoesWithAHex({
        fraction: String(Math.round(fraction * 100)),
        name: say.names.attribute(attributeId),
      }),
    );
  }
  // "They're on Fire!"'s (#2222).
  if (definition.damageReductionFromSourceWith !== undefined) {
    const { statusId, fraction } = definition.damageReductionFromSourceWith;
    parts.push(
      say.words.lessDamageFromFoesSufferingFrom({
        fraction: String(Math.round(fraction * 100)),
        name: say.names.status(statusId),
      }),
    );
  }
  // Intimidating Aura's (#2207).
  if (statAtTwelve(definition.damageReductionFromWeakerFoe) > 0) {
    parts.push(
      say.words.damageTakenFromFoesWithLessHealth({
        damageReductionFromWeakerFoe: statText(
          definition.damageReductionFromWeakerFoe,
          ranks,
          whole,
        ),
      }),
    );
  }
  if (statAtTwelve(definition.damageReductionFromConditionedFoe) > 0) {
    parts.push(
      say.words.damageTakenFromFoesWithACondition({
        damageReductionFromConditionedFoe: statText(
          definition.damageReductionFromConditionedFoe,
          ranks,
          whole,
        ),
      }),
    );
  }
  if (statAtTwelve(definition.spellDamageTakenMultiplier) !== 1) {
    const less = statText(definition.spellDamageTakenMultiplier, ranks, (multiplier) =>
      String(Math.round((1 - multiplier) * 100)),
    );
    parts.push(say.words.lessDamageFromSpells({ less }));
  }
  if (definition.damagePerSecondCap !== undefined) {
    const cap = statText(definition.damagePerSecondCap, ranks, whole);
    parts.push(say.words.damageOverInASecondIsHealed({ cap }));
  }
  if (definition.redirectsDamage !== undefined) {
    const { share: fraction, from, reduction } = definition.redirectsDamage;
    const hits = say.words.physicalItsPhysicalDamageTheDamageIt({ from });
    const less =
      statAtTwelve(reduction) === 0
        ? ""
        : say.words.whichTakesLessOfIt({ reduction: statText(reduction, ranks, whole) });
    parts.push(say.words.goesToItsCaster({ fraction, hits, less }));
  }
  if (definition.redirectsDamageToMinion > 0) {
    parts.push(
      say.words.theDamageYouTakeGoesToYour({
        redirectsDamageToMinion: definition.redirectsDamageToMinion,
      }),
    );
  }
  if (definition.maxDamageFractionPerHit !== undefined) {
    parts.push(
      say.words.damageFromASingleHitIsCapped({
        maxDamageFractionPerHit: String(Math.round(definition.maxDamageFractionPerHit * 100)),
      }),
    );
  }
  // Protective Bond's (#2187): "each hit it caps costs the caster 4 Energy".
  if (definition.casterEnergyPerReduction !== undefined) {
    parts.push(
      say.words.eachHitItCapsCostsTheCaster({
        casterEnergyPerReduction: statText(definition.casterEnergyPerReduction, ranks, whole),
      }),
    );
  }
  if (definition.attackDamageCapFraction !== undefined) {
    parts.push(
      say.words.damageFromASingleAttackIsCapped({
        attackDamageCapFraction: String(Math.round(definition.attackDamageCapFraction * 100)),
      }),
    );
  }
  if (definition.lifeStealReduction > 0) {
    parts.push(say.words.lifeStolen({ lifeStealReduction: String(definition.lifeStealReduction) }));
  }
  if (definition.sacrificeMultiplier !== 1) {
    parts.push(
      say.words.yourHealthSacrificesAreLarger({
        sacrificeMultiplier: String(Math.round((definition.sacrificeMultiplier - 1) * 100)),
      }),
    );
  }
  if (definition.knockdownMinSeconds !== undefined) {
    parts.push(
      say.words.knockdownsLastAtLeastS({
        knockdownMinSeconds: String(definition.knockdownMinSeconds),
      }),
    );
  }
  if (definition.sourceLosesHealth !== undefined) {
    parts.push(
      say.words.itsSpiritLosesHealthEachTime({
        sourceLosesHealth: String(definition.sourceLosesHealth),
      }),
    );
  }
  for (const event of definition.renewsOn) {
    parts.push(renewText(say, event, selfOnly));
  }
  // Recurring Insecurity's (#2501).
  if (definition.reappliesOnExpiryIf !== undefined) {
    parts.push(say.words.reappliedAsItWouldEndWhileYou({ selfOnly }));
  }
  if (definition.chantShoutDurationMultiplier !== 1) {
    const longer = Math.round((definition.chantShoutDurationMultiplier - 1) * 100);
    parts.push(say.words.chantsAndShoutsLastLongerOnIt({ longer: String(longer) }));
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
      attackDamageDelta,
      moveSpeedMultiplier,
    } = definition.whileUnder;
    const gains = [
      // Spirit's Strength's and Soldier's Speed's (#2501).
      ...(statAtTwelve(attackDamageDelta) === 0
        ? []
        : [
            say.words.attacksDealLessMoreDamage({
              attackDamageDelta: statText(attackDamageDelta, ranks, (n) =>
                String(Math.abs(Math.round(n))),
              ),
              attackDamageDelta2: statAtTwelve(attackDamageDelta),
            }),
          ]),
      ...(moveSpeedMultiplier === 1
        ? []
        : [
            say.words.movesFaster({
              moveSpeedMultiplier: String(Math.round((moveSpeedMultiplier - 1) * 100)),
            }),
          ]),
      ...(attackMissChance === 0
        ? []
        : [
            say.words.ofAttacksMiss({
              attackMissChance: String(Math.round(attackMissChance * 100)),
            }),
          ]),
      ...(statAtTwelve(healthPips) === 0
        ? []
        : [
            say.words.healthRegenerationDegeneration({
              healthPips: signedStat(healthPips, ranks),
              healthPips2: statAtTwelve(healthPips),
            }),
          ]),
      ...(statAtTwelve(armorModifier) === 0
        ? []
        : [say.words.armor({ armorModifier: signedStat(armorModifier, ranks) })]),
      ...(attackDurationMultiplier === 1
        ? []
        : [
            say.words.attacksFaster({
              value: String(Math.round((1 - attackDurationMultiplier) * 100)),
            }),
          ]),
      ...(adrenalineGainFaster === 0 ? [] : [adrenalineGainText(say, adrenalineGainFaster, ranks)]),
    ];
    // Toxicity's (#1873): "while under Poison or Disease".
    const under = [
      ...(categories.length === 0
        ? []
        : [say.words.aOr({ categories: categories.join(say.words.or()) })]),
      ...statusIds.map((id) => say.names.status(id)),
    ];
    parts.push(
      say.words.whileUnderOr2({
        under: under.join(say.words.or()),
        gains: gains.join(say.words.listComma()),
      }),
    );
  }
  if (definition.endsAfterTriggers !== undefined) {
    // Shield Guardian's (#1974): "ends after it takes effect once".
    // Harrier's Grasp's (#2438): "1...3 times" at the caster's ranks.
    const stat = definition.endsAfterTriggers;
    const times =
      (typeof stat === "number"
        ? stat
        : ranks === undefined
          ? undefined
          : Math.round(statAt(stat, ranks))) === 1
        ? say.words.once()
        : say.words.times({ stat: statText(stat, ranks, (n) => String(Math.round(n))) });
    parts.push(say.words.endsAfterItTakesEffect({ times }));
  }
  if (definition.breaksNextHex !== undefined) {
    parts.push(
      say.words.theNextHexFailsAndItsCaster({ damage: String(definition.breaksNextHex.damage) }),
    );
  }
  // Guilt's (#1475): "the next spell it casts at a foe fails: steals up to
  // 12 energy".
  if (definition.failsNextSpell !== undefined) {
    const { on, effects } = definition.failsNextSpell;
    const what = effects
      .flatMap((effect) => describeEffects(say, effect, triggerRanks))
      .map(({ text }) => say.words.lowerFirst(text));
    parts.push(say.words.theNextSpellItCastsAtFoe({ on, what: what.join(say.words.listComma()) }));
  }
  // "Can't Touch This!"'s (#1966).
  if (definition.failsFoeTouchSkills !== undefined) {
    parts.push(
      say.words.theNextTouchSkillsUsedAgainstYou({
        failsFoeTouchSkills: String(definition.failsFoeTouchSkills),
      }),
    );
  }
  // Wastrel's Demise's (#1501): "each second, it and adjacent foes take 8
  // damage, 8 more each second".
  // Balthazar's Aura's (#1754): "each second, adjacent foes take 26 holy
  // damage".
  if (definition.damagePulse !== undefined) {
    const { damage, growth, type, radius, hitsBearer } = definition.damagePulse;
    const area = say.words.areaText.get(radius);
    const foes = say.words.foesWithinFoes({ area, radius: String(radius) });
    const kind = type === "typeless" ? "" : ` ${type}`;
    const more = growth === 0 ? "" : say.words.moreEachSecond({ growth: String(growth) });
    parts.push(
      say.words.eachSecondItAndTakeDamage({ hitsBearer, foes, damage: String(damage), kind, more }),
    );
  }
  // Spotless Mind's (#2187): "every 5 seconds: removes 1 hex".
  if (definition.pulse !== undefined) {
    const what = definition.pulse.effects
      .flatMap((effect) => describeEffects(say, effect, triggerRanks))
      .map(({ text }) => say.words.lowerFirst(text));
    const every = definition.pulse.everySeconds;
    parts.push(
      say.words.everySecondSeconds({
        value: every === 1 ? say.words.second() : say.words.seconds2({ every: String(every) }),
        what: what.join(say.words.listComma()),
      }),
    );
    // Agony's (#2275): "this spirit loses 3...10 Health for each foe hurt".
    const charge = definition.pulse.chargesSourcePerHit;
    if (charge !== undefined) {
      const amount = statText(charge, ranks, (value) => String(Math.round(value)));
      parts.push(say.words.itsSpiritLosesHealthForEachOne({ amount }));
    }
    const healCharge = definition.pulse.chargesSourcePerHeal;
    if (healCharge !== undefined) {
      const amount = statText(healCharge, ranks, (value) => String(Math.round(value)));
      parts.push(say.words.itsSpiritLosesHealthForEachOne2({ amount }));
    }
  }
  // Holy Wrath's (#1754): "66% of the damage of the next 8 attacks that
  // hit it goes back to the attacker as holy damage, up to 41"; Retribution's
  // (#2286) "of every attack", up to its scaled cap.
  if (definition.reflectsAttackDamage !== undefined) {
    const { share, max, type, times } = definition.reflectsAttackDamage;
    const attacks =
      times === undefined
        ? say.words.everyAttack()
        : times === 1
          ? say.words.theNextAttack()
          : say.words.theNextAttacks({ times: String(times) });
    const kind = say.words.typelessAsDamage({ type });
    parts.push(
      say.words.ofTheDamageOfThatHitIt({
        share: String(Math.round(share * 100)),
        attacks,
        kind,
        max: statText(max, ranks, whole),
      }),
    );
  }
  // Calculated Risk's (#2471).
  if (definition.attackBackfire !== undefined) {
    const { chance, max } = definition.attackBackfire;
    parts.push(
      say.words.eachAttackItLandsHasAChance({
        chance: String(Math.round(chance * 100)),
        max: statText(max, ranks, whole),
      }),
    );
  }
  if (definition.reversesNextDamage !== undefined) {
    parts.push(
      say.words.theNextDamageOrLifeStealHeals({
        reversesNextDamage: statText(definition.reversesNextDamage, ranks, whole),
      }),
    );
  }
  // Reversal of Damage's (#2187).
  if (definition.reflectsNextDamage !== undefined) {
    parts.push(
      say.words.theNextDamageIsNegatedAndIts({
        cap: statText(definition.reflectsNextDamage.cap, ranks, whole),
      }),
    );
  }
  // Illusionary Weaponry's (#2472).
  if (definition.replacesMeleeBlows !== undefined) {
    parts.push(
      say.words.meleeAttacksNeitherHitNorFailTo({
        damage: statText(definition.replacesMeleeBlows.damage, ranks, whole),
      }),
    );
  }
  // Mark of Protection's (#2187).
  if (definition.damageToHealing !== undefined) {
    parts.push(
      say.words.allDamageHealsForThatMuchInstead({
        cap: statText(definition.damageToHealing.cap, ranks, whole),
      }),
    );
  }
  if (definition.negatesFatalDamage) {
    parts.push(say.words.theNextDamageOrLifeStealThat({ selfOnly }));
  }
  if (definition.endsEverywhereWhenSpent) {
    parts.push(say.words.whenOneAllySIsSpentIt());
  }
  if (definition.extraStrikesPerHit > 0) {
    parts.push(
      say.words.gainMoreStrikeStrikesOfAdrenalinePer({
        extraStrikesPerHit: String(definition.extraStrikesPerHit),
        extraStrikesPerHit2: definition.extraStrikesPerHit,
      }),
    );
  }
  if (definition.skillRechargeFaster !== 0) {
    parts.push(
      say.words.skillsRechargeFaster({
        skillRechargeFaster: String(Math.round(definition.skillRechargeFaster * 100)),
      }),
    );
  }
  if (definition.energyCostMultiplier !== 1) {
    const change = Math.round((definition.energyCostMultiplier - 1) * 100);
    parts.push(
      say.words.skillsCostMoreLessEnergy({ change: String(Math.abs(change)), change2: change }),
    );
  }
  const { spellRechargeFaster, bindingRitualRechargeFaster } = definition;
  if (spellRechargeFaster !== 0 && spellRechargeFaster === bindingRitualRechargeFaster) {
    const faster = String(Math.round(spellRechargeFaster * 100));
    parts.push(say.words.spellsAndBindingRitualsRechargeFaster({ faster }));
  } else {
    if (spellRechargeFaster !== 0) {
      parts.push(
        say.words.spellsRechargeFaster({
          spellRechargeFaster: String(Math.round(spellRechargeFaster * 100)),
        }),
      );
    }
    if (bindingRitualRechargeFaster !== 0) {
      const faster = String(Math.round(bindingRitualRechargeFaster * 100));
      parts.push(say.words.bindingRitualsRechargeFaster({ faster }));
    }
  }
  if (definition.enchantmentRechargeFaster !== undefined) {
    const { share, profession } = definition.enchantmentRechargeFaster;
    const faster = String(Math.round(share * 100));
    parts.push(
      say.words.enchantmentsRechargeFaster({ name: say.names.profession(profession), faster }),
    );
  }
  parts.push(
    ...definition.ownSkillModifiers.map((modifier) =>
      describeOwnSkillModifier(
        say,
        modifier,
        ranks,
        say.words.hexTheTargetSYour({ category: definition.category }),
      ),
    ),
  );
  if (definition.skillArmorPenetration !== undefined) {
    const { share, profession } = definition.skillArmorPenetration;
    const pierce = String(Math.round(share * 100));
    parts.push(
      say.words.skillsHaveArmorPenetration({ name: say.names.profession(profession), pierce }),
    );
  }
  if (definition.uninterruptible) {
    parts.push(say.words.yourTheBearerSSkillsCannotBe({ selfOnly }));
  }
  if (definition.interruptGuard?.kind === "once") {
    parts.push(say.words.theNextTimeYouWouldBeInterrupted());
  }
  if (definition.interruptGuard?.kind === "pay-energy") {
    const amount = String(definition.interruptGuard.amount);
    parts.push(say.words.youCannotBeInterruptedEachTimeYou({ amount }));
  }
  if (definition.interruptGuard?.kind === "lose-enchantment") {
    const profession = say.names.profession(definition.interruptGuard.profession);
    parts.push(say.words.youCannotBeInterruptedEachTimeYou2({ profession }));
  }
  if (statAtTwelve(definition.conditionsExpireFaster) !== 0) {
    const faster = statText(definition.conditionsExpireFaster, ranks, percent);
    parts.push(say.words.conditionsOnExpireFaster({ bearer, faster }));
  }
  if (definition.hexesExpireFaster !== 0) {
    const faster = String(Math.round(definition.hexesExpireFaster * 100));
    parts.push(say.words.hexesOnExpireFaster({ bearer, faster }));
  }
  parts.push(...fasterExpiryText(say, definition, ranks));
  // Chilling Winds' (#2311).
  const lengthening = definition.nextIncomingHexDurationMultiplier;
  if (lengthening !== undefined) {
    const longer = statText(lengthening.multiplier, ranks, (value) => percent(value - 1));
    const of = say.names.attribute(lengthening.attributeId);
    parts.push(say.words.theNextHexOnLastsLonger({ of, bearer, longer }));
  }
  if (definition.incomingHexCastTimeMultiplier !== 1) {
    const times = String(definition.incomingHexCastTimeMultiplier);
    parts.push(say.words.hexesCastOnTakeAsLongTo({ bearer, times }));
  }
  if (definition.incomingAllySpellCastTimeMultiplier !== 1) {
    const times = String(definition.incomingAllySpellCastTimeMultiplier);
    parts.push(say.words.otherAlliesSpellsOnTakeAsLong({ bearer, times }));
  }
  if (definition.sourceSpellCastTimeMultiplier !== 1) {
    const times = String(definition.sourceSpellCastTimeMultiplier);
    parts.push(say.words.yourSpellsOnTakeAsLongTo({ bearer, times }));
  }
  if (definition.enchantmentsOnBearerCostLess !== 0) {
    const less = String(definition.enchantmentsOnBearerCostLess);
    parts.push(say.words.enchantmentsCastOnCostLessEnergyMinimum({ bearer, less }));
  }
  if (definition.endsWhenBearerHits) {
    parts.push(endsIf(say.words.hitsWithAnAttack()));
  }
  if (definition.endsWhenBearerMisses) {
    parts.push(endsIf(say.words.failsToHit()));
  }
  if (definition.endsWhenBearerHitsWithAttackSkill) {
    parts.push(endsIf(say.words.hitsWithAnAttackSkill()));
  }
  // One that answers the use says so in its trigger's line (#949). Only a
  // stance, a preparation or a signet's effect is always its caster's own;
  // Restful Breeze ends on its bearer's skill, not yours (#2286).
  if (
    definition.endsWhenBearerUsesSkill &&
    !definition.triggers.some(({ on }) => on === "bearer-uses-skill")
  ) {
    parts.push(say.words.skillEffectEndsIfYouUseA({ selfOnly, category: definition.category }));
  }
  if (definition.endsWhenBearerUsesAdrenalSkill) {
    parts.push(say.words.endsIfYouUseAnAdrenalSkill());
  }
  if (definition.endsWhenBearerUsesNonAdrenalSkill) {
    parts.push(say.words.endsIfYouUseANonAdrenal());
  }
  // Hexer's Vigor's (#2411).
  if (definition.endsWhenBearerUsesSkillNot !== undefined) {
    const [kind] = say.words.nextSkillKind[definition.endsWhenBearerUsesSkillNot];
    parts.push(say.words.endsIfYouUseANonSkill({ kind }));
  }
  if (definition.endsWhenBearerUsesAttackSkill) {
    parts.push(say.words.endsIfYouUseAnAttackSkill());
  }
  // Glimmering Mark's (#2282).
  if (definition.endsWhenSourceTargets) {
    parts.push(say.words.endsIfYouUseASkillOn());
  }
  if (definition.endsWhenBearerUsesOtherSkill && definition.nextSkillRule !== undefined) {
    parts.push(
      say.words.endsIfYouUseASkillThat({
        NEXT_SKILL_KIND: say.words.nextSkillKind[definition.nextSkillRule.which][0],
      }),
    );
  }
  if (definition.endsWhenBearerGains.length > 0) {
    const gained = definition.endsWhenBearerGains.map((category) =>
      say.words.hexHexedEnchanted({ category }),
    );
    parts.push(endsIf(say.words.becomesOr({ gained: gained.join(say.words.or()) })));
  }
  if (definition.destroysBearerOnExpiry) {
    parts.push(say.words.theBearerIsDestroyedWhenItExpires());
  }
  // Verata's Aura's (#2092).
  if (definition.bindsCreatures) {
    parts.push(say.words.theMinionsYouItTookBecomeMasterless({ selfOnly }));
  }
  // Jagged Bones's (#1986); Malign Intervention's, nobody's (#2092).
  if (definition.replacedOnDeathBy !== undefined) {
    const { creature, count, masterless } = definition.replacedOnDeathBy;
    const stands = describeCreature(say, creature, count, triggerRanks).text;
    parts.push(say.words.whenTheBearerDiesRisesWhereIt({ masterless, stands }));
  }
  // A trigger that does nothing but end it (#1748): Pacifism's "ends if
  // the target takes damage".
  const enders = definition.endsWhenTriggered
    ? definition.triggers.filter((trigger) => trigger.effects.length === 0)
    : [];
  // A block that ends it is said by "blocks the next" (#2500): Burning
  // Shield's projectile ender is no second way out.
  const said = once ? enders.filter((trigger) => trigger.on !== "bearer-blocks") : enders;
  // Its holder reads it (#1841): "ends if you cast…" on a self-buff, "it"
  // on a hex or condition.
  const onFoe = definition.category === "hex" || definition.category === "condition";
  for (const trigger of said) {
    const when = say.words.composedKindBoundWhenOn({
      kindBoundWhen: kindBoundWhen(say, trigger.on, trigger),
      on: trigger.on,
    });
    parts.push(say.words.endsIfItEndsIfYou({ onFoe, when }));
  }
  // A trigger that reads "when it ends: removes 1 hex" is a sentence of
  // its own (#944), not one more clause after a comma.
  const sentences: string[] = [];
  for (const { text, clause } of describeTriggers(
    say,
    definition.triggers.filter((trigger) => !enders.includes(trigger)),
    triggerRanks,
    definition.endsWhenBearerUsesSkill,
    definition.endsWhenTriggered,
    definition.category === "hex" || definition.category === "condition",
    definition.category === "item",
    selfOnly,
  )) {
    // Burning Shield's (#2500): its one block is the next, of whatever
    // kind, so a kind-bound answer is "if it is a melee attack".
    const answer = say.words.all({ once, against: definition.block?.against, text });
    (clause ? parts : sentences).push(answer);
  }
  if (parts.length === 0 && sentences.length === 0) {
    return say.names.status(definition.id);
  }
  // Empowerment's whole stat line holds only while an item is held (#2493).
  const stats = parts.join(say.words.listComma());
  const said2 = say.words.whileHoldingAnItem({
    onlyWhileHoldingItem: definition.onlyWhileHoldingItem,
    holdingSaid,
    stats,
  });
  return [...(parts.length === 0 ? [] : [said2]), ...sentences]
    .map((text, index) => say.words.composedIndexText({ index, text }))
    .join(say.words.listSentence());
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
  say: Say,
  effects: readonly SkillEffect[],
  attackSkillsOnly: boolean,
  weapon: AttackWeaponClass | undefined,
  physicalOnly: boolean,
  ranks: ReadonlyMap<string, number>,
): string[] {
  const attacks = say.words.attackSkillsPhysicalAttacks({
    attackSkillsOnly,
    weapon,
    value: say.words.physicalAttacks({ weapon, physicalOnly }).trim(),
  });
  const parts: string[] = [];
  for (const [index, effect] of effects.entries()) {
    const before = effects[index - 1];
    if (effect.kind === "apply-status") {
      parts.push(
        say.words.foesYourHitGetFor({
          attacks,
          statusName: say.names.status(effect.statusId),
          durationSeconds: lasting(say, effect.durationSeconds, ranks),
        }),
      );
    } else if (effect.kind === "damage") {
      parts.push(
        say.words.foesYourHitTake({ attacks, riderDamage: riderDamage(say, effect, ranks) }),
      );
    } else if (
      effect.kind === "remove-status" &&
      effect.from !== "caster" &&
      effect.count !== "all" &&
      effect.statusId === undefined &&
      effect.perRemoved === undefined
    ) {
      // Order of Apostasy's strip (#1975).
      const count = countAt(effect.count, new Map());
      parts.push(
        say.words.foesYourHitLose({
          attacks,
          count: String(count),
          count2: count,
          category: effect.category,
        }),
      );
    } else if (
      effect.kind === "splash" &&
      effect.hits === "foes" &&
      effect.radius === AREA_ADJACENT &&
      effect.maxTargets === undefined &&
      before?.kind === "damage" &&
      effect.effects.length === 1 &&
      effect.effects[0]?.kind === "damage" &&
      riderDamage(say, effect.effects[0], ranks) === riderDamage(say, before, ranks)
    ) {
      parts.push(say.words.andSoDoFoesAdjacentToThem({ pop: String(parts.pop()) }));
    } else if (effect.kind === "life-steal") {
      // Said of the bearer's attacks, never "your": a spirit's aura
      // steals for the spirit (#1777).
      const amount = shown(describeMagnitude(effect.amount, ranks));
      parts.push(say.words.stealUpToHealth({ attacks, amount }));
    } else if (effect.kind === "heal" && effect.recipient === "owner") {
      // Only a pet bears it (Predatory Bond, #1865), cast from its
      // Ranger's bar: the pet's attacks heal whoever reads this.
      const amount = shown(describeMagnitude(effect.amount, ranks));
      parts.push(say.words.yourPetSAttacksHealYouFor({ amount }));
    } else if (effect.kind === "interrupt" && effect.only === undefined) {
      // Dwarven Battle Stance's (#2335).
      parts.push(say.words.yourInterruptFoesTheyHit({ attacks }));
    } else {
      parts.push(
        ...describeEffects(say, effect, ranks).map(({ text }) => say.words.your({ attacks, text })),
      );
    }
  }
  return parts;
}

/**
 * What a status does to foes that block the bearer's attacks (#1974):
 * "foes that block your bow attacks get Bleeding for 18s".
 */
function describeAttackBlocks(
  say: Say,
  effects: readonly SkillEffect[],
  attackSkillsOnly: boolean,
  weapon: AttackWeaponClass | undefined,
  ranks: ReadonlyMap<string, number>,
): string[] {
  const attacks = say.words.attackSkillsPhysicalAttacks2({ attackSkillsOnly, weapon });
  return effects.flatMap((effect) =>
    effect.kind === "apply-status"
      ? [
          say.words.foesThatBlockYourGetFor({
            attacks,
            statusName: say.names.status(effect.statusId),
            durationSeconds: lasting(say, effect.durationSeconds, ranks),
          }),
        ]
      : describeEffects(say, effect, ranks).map(({ text }) =>
          say.words.foesThatBlockYour({ attacks, text }),
        ),
  );
}

/** A rider's damage: "20 fire damage", "13 damage" when it is typeless. */
function riderDamage(say: Say, effect: DamageEffect, ranks: ReadonlyMap<string, number>): string {
  const amount = shown(describeMagnitude(effect.amount, ranks));
  return say.words.damage({ amount, type: effect.type });
}

/**
 * A status's typed armor (#1437), as GW1 words it: "+30 elemental armor",
 * or "+60 armor against projectile attacks" (#2180). Only the damage-type
 * and projectile conditions are a status's; any other is a catalog bug,
 * not data.
 */
function statusArmorText(
  say: Say,
  bonus: StatusConditionalArmor,
  ranks: ReadonlyMap<string, number> | undefined,
): string {
  const projectile = bonus.conditions.some(({ kind }) => kind === "vs-projectile");
  const typed = bonus.conditions.filter(({ kind }) => kind !== "vs-projectile");
  const against = typed.map((condition) => {
    switch (condition.kind) {
      case "vs-physical":
        return say.words.physical();
      case "vs-elemental":
        return say.words.elemental();
      case "vs-type":
        return condition.type;
      default:
        throw new Error(`a status's armor holds only against a damage type, not ${condition.kind}`);
    }
  });
  const text = `${signedStat(bonus.amount, ranks)} ${[...against, say.words.armor2()].join(say.words.listSpace())}`;
  return say.words.againstProjectileAttacks({ projectile, text });
}

type TriggerLead = "dropped" | "next-skill" | "you-use" | "other";

interface TriggerLine {
  readonly text: string;
  readonly clause: boolean;
  /** Its `when`, and what follows it, when it reads "when: what". */
  readonly when?: string;
  readonly answer?: string;
}

/**
 * Divine Boon's (#2286), one sentence in GW1's words: "whenever it casts
 * a Protection Prayers or Divine Favor spell on an ally, that ally is
 * healed for 51 and its caster loses 1 energy". Undefined unless every
 * trigger answers an ally-targeted spell of some attributes with a heal
 * on that ally or an energy loss to its caster.
 */
function describeSpellOnAlly(
  say: Say,
  triggers: readonly StatusTrigger[],
  ranks: ReadonlyMap<string, number>,
  bearerIsCaster: boolean,
): string | undefined {
  const scopes: string[] = [];
  const parts: string[] = [];
  for (const { on, usedSkill, effects, target } of triggers) {
    if (
      on !== "bearer-casts-spell" ||
      usedSkill?.targets !== "ally" ||
      usedSkill.attributes === undefined
    ) {
      return undefined;
    }
    scopes.push(scopeAdjective(say, usedSkill.attributes));
    for (const effect of effects) {
      if (effect.kind === "heal" && target === "skill-target") {
        parts.push(
          say.words.thatAllyIsHealedFor({ amount: shown(describeMagnitude(effect.amount, ranks)) }),
        );
      } else if (effect.kind === "energy-loss" && target === "source") {
        const who = say.words.youLoseItsCasterLoses({ bearerIsCaster });
        parts.push(
          say.words.energy2({ who, amount: shown(describeMagnitude(effect.amount, ranks)) }),
        );
      } else {
        return undefined;
      }
    }
  }
  if (triggers.length === 0) {
    return undefined;
  }
  const spell = say.words.orSpell({ value: [...new Set(scopes)].join(say.words.or()) });
  return say.words.wheneverYouCastItCastsAnA({
    bearerIsCaster,
    test: /^[aeiou]/i.test(spell),
    spell,
    value: [...new Set(parts)].join(say.words.and()),
  });
}

/**
 * A status's triggers, those that do the same thing said once (#935):
 * Spiteful Spirit's "whenever it uses a skill or attacks". One that ends
 * when its bearer uses a skill answers only the next use (#949), and one
 * that ends when triggered only the next time (#1022).
 */
function describeTriggers(
  say: Say,
  triggers: readonly StatusTrigger[],
  ranks: ReadonlyMap<string, number>,
  once: boolean,
  nextOnly: boolean,
  bearerIsFoe: boolean,
  dropped: boolean,
  bearerIsCaster: boolean,
): TriggerLine[] {
  const onAlly = describeSpellOnAlly(say, triggers, ranks, bearerIsCaster);
  if (onAlly !== undefined) {
    return [{ text: onAlly, clause: false }];
  }
  const groups = new Map<string, { trigger: StatusTrigger; on: StatusTriggerEvent[] }>();
  for (const trigger of triggers) {
    const key = JSON.stringify([
      trigger.effects,
      trigger.target,
      trigger.weapon,
      trigger.chainRole,
      trigger.blocked,
      trigger.profession,
      trigger.usedSkill,
      trigger.damageType,
      trigger.whileUsingSkill,
      trigger.minDamage,
      trigger.healthBelow,
      trigger.apartBeyond,
      trigger.appliedHex,
      trigger.hitBy,
      trigger.victimHasLessHealth,
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
      ? weaponBoundWhen(say, event, trigger.weapon)
      : say.words.composedKindBoundWhenEvent({
          kindBoundWhen: kindBoundWhen(say, event, trigger),
          event,
        });
  // Its doer (#2341): "you cast a spell" on the caster's own, "it casts a spell" else.
  const doer = (on: readonly StatusTriggerEvent[], trigger: StatusTrigger): string => {
    const phrases = on.map((event) => whenOf(event, trigger));
    return say.words.youOrItOr({
      bearerIsCaster,
      phrases: phrases.map(say.words.secondPerson).join(say.words.or()),
      phrases2: phrases.join(say.words.or()),
    });
  };
  return [...groups.values()].flatMap(({ trigger, on }) => {
    if (on.includes("bearer-dies")) {
      // Incendiary Bonds' "activates early if target foe dies" (#2289).
      const others = on.filter((event) => event !== "bearer-dies");
      const death = describeDeath(say, trigger, ranks, bearerIsFoe);
      return [
        {
          text: say.words.whenItOrOrAtOnce({
            length: others.length,
            death,
            others: others.map((event) => whenOf(event, trigger)).join(say.words.or()),
          }),
          clause: false,
        },
      ];
    }
    const [when, leadKind]: readonly [string, TriggerLead] = on.includes("bearer-creates-creature")
      ? [say.words.creates, "other"]
      : dropped && on.includes("ends")
        ? [say.words.dropped, "dropped"]
        : on.includes("bearer-chant-or-shout-ends")
          ? [say.words.chantOrShoutEnds, "other"]
          : on.includes("bearer-energy-empty")
            ? [say.words.energyEmpty, "other"]
            : on.includes("ends") || on.includes("ends-early") || on.includes("expires")
              ? [
                  say.words.whenItOr({
                    on: on.map((event) => whenOf(event, trigger)).join(say.words.or()),
                  }),
                  "other",
                ]
              : once && on.includes("bearer-uses-skill")
                ? [say.words.composedBearerIsCaster({ bearerIsCaster }), "next-skill"]
                : nextOnly
                  ? [say.words.theNextTime({ doer: doer(on, trigger) }), "other"]
                  : bearerIsCaster && trigger.weapon === "bow"
                    ? [
                        say.words.wheneverYourArrowsOr({
                          on: on
                            .map((event) =>
                              say.words.composedEventWhenOf({
                                event,
                                whenOf: whenOf(event, trigger),
                              }),
                            )
                            .join(say.words.or()),
                        }),
                        "other",
                      ]
                    : [
                        say.words.wheneverOnACreatureWithLessHealth({
                          doer: doer(on, trigger),
                          victimHasLessHealth: trigger.victimHasLessHealth,
                        }),
                        bearerIsCaster && on[0] === "bearer-uses-skill" ? "you-use" : "other",
                      ];
    const lines = describeTrigger(say, trigger, when, leadKind, ranks, bearerIsFoe, bearerIsCaster);
    // Scorpion Wire's step and knockdown (#2504), said as one.
    const [lead] = lines;
    if (on.includes("source-bearer-apart") && lead !== undefined && lines.length > 1) {
      const each = lines.map(({ answer, text }) => answer ?? text);
      return [
        {
          text: say.words.andAnd({ when: lead.when, each: each.join(say.words.and2()) }),
          clause: lead.clause,
        },
      ];
    }
    // A heal on the bearer and the same on the allies around (#1951):
    // Mist Form's, said once; Healing Seed's heals its bearer, not you (#2286).
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
      JSON.stringify(splash.effects[0]) === JSON.stringify(self) &&
      second.when !== undefined &&
      second.answer !== undefined
    ) {
      return [
        {
          ...second,
          text: say.words.youItAnd({ when: second.when, bearerIsCaster, answer: second.answer }),
        },
      ];
    }
    // A drop is said once, all it does after it (#1434).
    if (!dropped || lines.length < 2) {
      return lines;
    }
    const healed = partyHealed(trigger.effects, ranks);
    if (healed !== undefined) {
      return [{ text: say.words.youAndAllPartyMembersAreHealed({ healed }), clause: false }];
    }
    const what = lines.map(({ answer, text }) => answer ?? text);
    return [
      { text: say.words.composedWhat({ what: what.join(say.words.listComma()) }), clause: false },
    ];
  });
}

/**
 * What the bearer does with a weapon that a bound trigger answers
 * (#1354, #1359): "attacks with a sword", "hits with a melee attack".
 */
function weaponBoundWhen(say: Say, event: StatusTriggerEvent, weapon: AttackWeaponClass): string {
  if (event === "bearer-hits") {
    return say.words.meleeHitsWithAMeleeAttackHits({ weapon });
  }
  // Tainted Flesh's (#2313): the weapon is the attacker's.
  if (event === "bearer-hit-by-attack") {
    return say.words.meleeIsHitByAFoeS({ weapon });
  }
  return say.words.with3({ event, weapon });
}

/**
 * A death trigger's (#1762), one sentence in the corpus's words: "if
 * target foe dies while hexed with this, you gain 13 Energy and all your
 * skills are recharged", "if an ally dies while enchanted with this, your
 * party is healed for 41".
 */
function describeDeath(
  say: Say,
  trigger: StatusTrigger,
  ranks: ReadonlyMap<string, number>,
  bearerIsFoe: boolean,
): string {
  const amount = (magnitude: Magnitude): string => shown(describeMagnitude(magnitude, ranks));
  const answer = (effect: TriggerEffect): string[] => {
    if (effect.kind === "energy-gain") {
      return [say.words.youGainEnergy({ amount: amount(effect.amount) })];
    }
    if (effect.kind === "recharge-others" && effect.which === "all") {
      return [say.words.allYourSkillsAreRecharged()];
    }
    if (effect.kind === "splash") {
      return effect.effects.map((inner) =>
        effect.hits === "party" && inner.kind === "heal"
          ? say.words.yourPartyIsHealedFor({ amount: amount(inner.amount) })
          : inner.kind === "damage"
            ? say.words.takeDamage({
                upTo: upTo(say, effect, ranks),
                amount: amount(inner.amount),
                type: inner.type,
              })
            : inner.kind === "heal"
              ? // Blood Bond's (#2314): "adjacent allies are healed for 84".
                say.words.areHealedFor({
                  upTo: upTo(say, effect, ranks),
                  amount: amount(inner.amount),
                })
              : say.words.composedUpToText({
                  upTo: upTo(say, effect, ranks),
                  text: describeEffect(say, inner, ranks).text,
                }),
      );
    }
    return effect.kind === "spread-gained-condition" ||
      effect.kind === "echo" ||
      effect.kind === "mirror-stance" ||
      effect.kind === "cancel-attack" ||
      effect.kind === "pay-energy-or-end"
      ? []
      : describeEffects(say, effect, ranks).map(({ text }) => say.words.lowerFirst(text));
  };
  const who = say.words.ifTargetFoeDiesWhileHexedWith({ bearerIsFoe });
  return say.words.and3({ who, flatMap: trigger.effects.flatMap(answer).join(say.words.and()) });
}

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

/**
 * What the bearer does that a trigger bound to a kind of skill or
 * enchantment answers (#1437): "uses a Dervish attack skill", "loses a
 * Dervish enchantment", to a type of damage (#1540): "takes fire damage
 * from a foe", or to a kind of block (#1549): "blocks a melee attack".
 * `undefined`: bound to none.
 */
function kindBoundWhen(
  say: Say,
  event: StatusTriggerEvent,
  trigger: StatusTrigger,
): string | undefined {
  // Persistence of Memory's (#2132).
  if (event === "bearer-interrupted" && trigger.usedSkill?.spell !== undefined) {
    return say.words.hasASpellInterrupted();
  }
  // Spinal Shivers' (#1931).
  if (
    event === "bearer-takes-damage-from-foe" &&
    trigger.damageType !== undefined &&
    trigger.whileUsingSkill === true
  ) {
    return say.words.isStruckForDamageWhileUsingA({ damageType: trigger.damageType });
  }
  if (event === "bearer-takes-damage-from-foe" && trigger.damageType !== undefined) {
    return say.words.takesDamageFromAFoe({ damageType: trigger.damageType });
  }
  // Spirit Bond's (#1754).
  if (event === "bearer-takes-damage-from-foe" && trigger.minDamage !== undefined) {
    return say.words.takesMoreThanDamageFromAFoe({ minDamage: String(trigger.minDamage) });
  }
  // Watchful Intervention's (#1789).
  if (event === "bearer-health-drops-below" && trigger.healthBelow !== undefined) {
    return say.words.hasItsHealthDroppedBelowByDamage({
      healthBelow: String(Math.round(trigger.healthBelow * 100)),
    });
  }
  // Scorpion Wire's (#2504).
  if (event === "source-bearer-apart" && trigger.apartBeyond !== undefined) {
    return say.words.isMoreThanFromYou({ apartBeyond: String(trigger.apartBeyond) });
  }
  // Way of the Lotus's (#2432).
  if (event === "bearer-hits" && trigger.chainRole !== undefined) {
    return say.words.hitsWithAAttack({ chainRole: trigger.chainRole });
  }
  // Mark of Instability's (#2134).
  if (event === "bearer-hit-by-attack" && trigger.hitBy !== undefined) {
    const role = trigger.hitBy.chainRole;
    return say.words.isHitByAnAttackAAttack({ role });
  }
  if (event === "bearer-blocks" && trigger.blocked !== undefined) {
    return say.words.blocksAAttack({ blocked: trigger.blocked });
  }
  if (event === "bearer-loses-enchantment" && trigger.profession !== undefined) {
    return say.words.losesAEnchantment({ name: say.names.profession(trigger.profession) });
  }
  // Elemental Flame's (#1951).
  if (event === "bearer-applies-hex" && trigger.appliedHex !== undefined) {
    const words = say.words.hex2({
      scopeAdjective: scopeAdjective(say, trigger.appliedHex.attributes),
    });
    return say.words.appliesAnAToAFoe({ test: /^[aeiou]/i.test(words), words });
  }
  // Mist Form's (#1951), Cultist's Fervor's "a Necromancer spell" (#2314),
  // Wielder's Zeal's "a weapon spell on an ally" (#2500).
  if (
    event === "bearer-casts-spell" &&
    (trigger.usedSkill?.attributes !== undefined ||
      trigger.usedSkill?.profession !== undefined ||
      trigger.usedSkill?.type !== undefined)
  ) {
    const { attributes, profession, type, targets } = trigger.usedSkill;
    const words = [
      ...(profession === undefined ? [] : [say.names.profession(profession)]),
      ...(attributes === undefined ? [] : [scopeAdjective(say, attributes)]),
      say.words.spell({ type }),
    ].join(say.words.listSpace());
    const on = targets === undefined ? "" : say.words.onAllyAnAllyAFoe({ targets });
    return say.words.castsAnA({ test: /^[aeiou]/i.test(words), words, on });
  }
  if (
    (event === "bearer-uses-skill" || event === "source-targets-bearer") &&
    trigger.usedSkill !== undefined
  ) {
    const { type, notType, attributes, profession, elite, adrenal, targets } = trigger.usedSkill;
    const words = [
      ...(notType === undefined ? [] : [say.words.non({ notType })]),
      ...(elite === undefined ? [] : [say.words.elite()]),
      ...(adrenal === undefined ? [] : [say.words.adrenal()]),
      ...(profession === undefined ? [] : [say.names.profession(profession)]),
      ...(attributes === undefined ? [] : [scopeAdjective(say, attributes)]),
      ...(type === undefined ? [] : [say.words.typeName(type)]),
      say.words.skill(),
    ];
    // Mind Wrack's "your non-hex Mesmer skill" (#2290).
    if (event === "source-targets-bearer") {
      return say.words.isTargetedByYour({ words: words.join(say.words.listSpace()) });
    }
    // Zealot's Fire's "a skill that targets an ally" (#2282), Signet of
    // Suffering's "skill that targets a foe" (#2333), Boon Signet's "spell
    // that targets an ally", never you (#2499).
    const on = say.words.on({ targets });
    return say.words.usesAnA({
      test: /^[aeiou]/i.test(words[0] ?? ""),
      words: words.join(say.words.listSpace()),
      on,
    });
  }
  return undefined;
}

/**
 * What a creation trigger does, one sentence (#1316): "whenever you
 * create a creature: you gain 41 Health and 5 Energy", "up to 5 foes near
 * that creature take 56 lightning damage", "all allies near that creature
 * gain 41 Health and lose 1 condition".
 */
function describeCreation(
  say: Say,
  trigger: StatusTrigger,
  when: string,
  ranks: ReadonlyMap<string, number>,
): string {
  const amount = (magnitude: Magnitude): string => shown(describeMagnitude(magnitude, ranks));
  const answer = (effect: TriggerEffect): string => {
    switch (effect.kind) {
      case "heal":
        return say.words.health2({ amount: amount(effect.amount) });
      case "energy-gain":
        return say.words.energy3({ amount: amount(effect.amount) });
      case "damage":
        return say.words.takeDamage2({ amount: amount(effect.amount), type: effect.type });
      case "remove-status":
        return say.words.loseAllAllS({
          value: effect.count === "all" ? "all" : String(countAt(effect.count, ranks)),
          category: effect.category,
          count: effect.count,
        });
      case "splash": {
        const side = say.words.splashSide[effect.hits];
        const who =
          effect.maxTargets === undefined
            ? say.words.all2({ side })
            : say.words.upTo({ maxTargets: String(countAt(effect.maxTargets, ranks)), side });
        const where = say.words.withinOfThatCreature({
          radius: effect.radius,
          radius2: String(effect.radius),
        });
        const what = effect.effects.map((inner) =>
          inner.kind === "heal" ? say.words.gain({ answer: answer(inner) }) : answer(inner),
        );
        return `${who} ${where} ${what.join(say.words.and())}`;
      }
      // None answers a creation.
      case "spread-gained-condition":
      case "echo":
      case "mirror-stance":
      case "cancel-attack":
      case "pay-energy-or-end":
        return "";
      default:
        return describeEffects(say, effect, ranks)
          .map(({ text }) => say.words.lowerFirst(text))
          .join(say.words.listComma());
    }
  };
  const gains = trigger.effects.every(({ kind }) => kind === "heal" || kind === "energy-gain");
  const answers = trigger.effects.map(answer).join(say.words.and());
  return say.words.youGain({ when, gains, answers });
}

/**
 * A status's answer to its bearer (#469): "takes 119 damage whenever it
 * casts a spell", "heals its caster for 102 when it ends" (#887), "its
 * adjacent allies take 34 damage whenever it takes physical damage"
 * (#935). A `clause` follows a comma; the rest, "when it ends: …",
 * stand alone (#944).
 */
function describeTrigger(
  say: Say,
  trigger: StatusTrigger,
  when: string,
  leadKind: TriggerLead,
  ranks: ReadonlyMap<string, number>,
  bearerIsFoe: boolean,
  bearerIsCaster: boolean,
): TriggerLine[] {
  const amount = (magnitude: Magnitude): string => shown(describeMagnitude(magnitude, ranks));
  // Rising Bile's "1...6 damage for each second it was in effect" (#2321).
  const dealt = (effect: DamageEffect): string =>
    effect.per === undefined
      ? say.words.damage({ amount: amount(effect.amount), type: effect.type })
      : say.words.damageOnIt({
          value:
            resolveMagnitudeAtRanks(effect.amount, ranks) === 0
              ? ""
              : `${amount(effect.amount)} + `,
          amount: amount(effect.per.amount),
          type: effect.type,
          perCount: perCountText(say, effect.per, ranks, say.words.onIt()),
        });
  const clause = (text: string): TriggerLine => ({ text, clause: true });
  const sentence = (text: string): TriggerLine => ({ text, clause: false });
  const answered = (what: string): TriggerLine => ({
    text: say.words.composedWhenWhat({ when, what }),
    clause: false,
    when,
    answer: what,
  });
  // The caster's foes beside a hexed or conditioned bearer are the
  // bearer's allies; beside one wearing its own enchantment, its foes (#1021).
  const splashed = (effect: SplashEffect): string => {
    const area = say.words.areaText.get(effect.radius);
    // Shield of Force's "adjacent foes that are attacking" (#2500).
    const condition = effect.onlyIf === undefined ? "" : onlyIfText(say, effect.onlyIf, ranks);
    const only = say.words.splashOnlyClause(condition);
    return say.words.itsAdjacentAlliesItsAlliesWithin({
      bearerIsFoe,
      foesWithin: foesWithin(say, effect.radius, effect.hits),
      only,
      value:
        effect.radius === AREA_ADJACENT
          ? say.words.itsAdjacentAllies()
          : say.words.itsAlliesWithin({ area, radius: String(effect.radius) }),
    });
  };
  // A stance's answer to its own block (#1329), in GW1's words.
  if (trigger.on === "bearer-blocks-melee" || trigger.on === "bearer-blocks-projectile") {
    const kind = say.words.bearerBlocksMeleeMeleeProjectile({ on: trigger.on });
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
      const area = say.words.within({ radius: splash.radius, radius2: String(splash.radius) });
      return [
        sentence(say.words.whenYouBlockYouAndAlliesAre({ area, amount: amount(self.amount) })),
      ];
    }
    const answers = trigger.effects.flatMap((effect): TriggerLine[] => {
      // Distortion's (#1974): the block stands, paid or not.
      if (effect.kind === "pay-energy-or-end" && trigger.target === "bearer") {
        return [
          sentence(say.words.eachBlockCostsYouEnergyOrThis({ amount: String(effect.amount) })),
        ];
      }
      if (effect.kind === "energy-gain" && trigger.target === "bearer") {
        return [
          sentence(
            say.words.youGainEnergyForEachSuccessfulAttack({ amount: amount(effect.amount), kind }),
          ),
        ];
      }
      if (effect.kind === "damage" && trigger.target === "offender") {
        return [
          sentence(
            say.words.wheneverYouBlockAAttackThisWay({
              kind,
              amount: amount(effect.amount),
              type: effect.type,
            }),
          ),
        ];
      }
      if (effect.kind === "splash" && trigger.target === "bearer") {
        const foes = say.words.withinOfYouFoes({
          radius: effect.radius,
          radius2: String(effect.radius),
        });
        return effect.effects.map((inner) =>
          sentence(
            inner.kind === "apply-status"
              ? say.words.ifYouBlockAAttackSufferFrom({
                  kind,
                  foes,
                  statusName: say.names.status(inner.statusId),
                  resolveMagnitudeAtRanks: String(
                    resolveMagnitudeAtRanks(inner.durationSeconds, ranks),
                  ),
                })
              : say.words.ifYouBlockAAttack({
                  kind,
                  foes,
                  text: describeEffect(say, inner, ranks).text,
                }),
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
    return [sentence(describeCreation(say, trigger, when, ranks))];
  }
  // The bearer on the foe that set it off (#1022), all said at once:
  // "...: steals 68 Health from that foe, loses 2 conditions".
  if (trigger.target === "offender") {
    const answers = trigger.effects.flatMap((effect): string[] => {
      if (effect.kind === "life-steal") {
        return [say.words.stealsHealthFromThatFoe({ amount: amount(effect.amount) })];
      }
      if (effect.kind === "remove-status" && effect.from === "caster") {
        const count = effect.count === "all" ? "all" : countAt(effect.count, ranks);
        return [
          say.words.loses({ count: String(count), count2: count, category: effect.category }),
        ];
      }
      return effect.kind === "spread-gained-condition" ||
        effect.kind === "echo" ||
        effect.kind === "mirror-stance" ||
        effect.kind === "cancel-attack" ||
        effect.kind === "pay-energy-or-end"
        ? []
        : describeEffects(say, effect, ranks).map(({ text }) => say.words.lowerFirst(text));
    });
    return [answered(answers.join(say.words.listComma()))];
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
        ? say.words.itTakesDamage({ amount: amount(effect.amount), type: effect.type })
        : effect.kind === "splash"
          ? effect.effects
              .map((inner) =>
                inner.kind === "damage"
                  ? say.words.takeDamage3({
                      splashed: splashed(effect),
                      amount: amount(inner.amount),
                      type: inner.type,
                    })
                  : "",
              )
              .join(say.words.and())
          : "",
    );
    return [
      sentence(say.words.thatAttackIsInterruptedAndAnd({ when, hurt: hurt.join(say.words.and()) })),
    ];
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
      sentence(say.words.itIsInterruptedAndYouLoseEnergy({ when, amount: String(first.amount) })),
    ];
  }
  // An attunement's and Aura of Restoration's (#1614), said at once:
  // "whenever it casts a spell: gains 1 energy and is healed for 360% of
  // that skill's energy cost". On the caster's own, "you gain" (#2341).
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
    // A scaled share, Glyph of Restoration's 150...350% (#2438), rounds as a
    // percentage, not first as a multiplier.
    const share = (magnitude: Magnitude): string => {
      const described = describeMagnitude(magnitude, ranks);
      return shown(
        described,
        percentOf("scaling" in magnitude ? statAt(magnitude, ranks) : described.current),
      );
    };
    const gains = perCost.flatMap((effect) =>
      effect.kind !== "energy-gain"
        ? []
        : effect.perUsedSkillEnergy === true
          ? [say.words.ofThatSkillSBaseEnergyCost({ share: share(effect.amount) })]
          : [say.words.energy4({ amount: amount(effect.amount) })],
    );
    const healed = say.words.youAreHealedAreHealedIsHealed({
      bearerIsCaster,
      length: gains.length,
    });
    const heals = perCost.flatMap((effect) =>
      effect.kind !== "heal"
        ? []
        : effect.perUsedSkillEnergy === true
          ? [say.words.forOfThatSkillSEnergyCost({ healed, share: share(effect.amount) })]
          : [say.words.forWord({ healed, amount: amount(effect.amount) })],
    );
    const what = [
      ...(gains.length === 0
        ? []
        : [say.words.youGainGainsPlus({ bearerIsCaster, gains: gains.join(say.words.plus()) })]),
      ...heals,
    ];
    return [answered(what.join(say.words.and()))];
  }
  // Depravity's (#2314), said as one: "whenever it casts a spell: it and
  // the nearest of its allies nearby lose 4 energy".
  const [splash] = after;
  const [drained] = splash?.kind === "splash" ? splash.effects : [];
  if (
    first?.kind === "energy-loss" &&
    trigger.target === "bearer" &&
    after.length === 1 &&
    splash?.kind === "splash" &&
    splash.effects.length === 1 &&
    drained?.kind === "energy-loss" &&
    amount(drained.amount) === amount(first.amount)
  ) {
    const others =
      splash.maxTargets === undefined
        ? splashed(splash)
        : splash.maxTargets === 1
          ? say.words.theNearestOf({ splashed: splashed(splash) })
          : say.words.upTo2({
              maxTargets: String(countAt(splash.maxTargets, ranks)),
              splashed: splashed(splash),
            });
    return [answered(say.words.itAndLoseEnergy({ others, amount: amount(first.amount) }))];
  }
  return trigger.effects.flatMap((effect): TriggerLine[] => {
    if (effect.kind === "spread-gained-condition") {
      // Fevered Dreams' (#2259) are the hexed foe's allies: to its caster, other foes.
      const who = say.words.bearerFoesFoesOtherFoes({ to: effect.to });
      return [answered(say.words.inTheAreaSufferItToo({ who }))];
    }
    // "the next time it uses a skill: if a spell, it takes this skill's
    // slot for 20 seconds" (#469).
    if (effect.kind === "echo") {
      const which = say.words.ifASpellItThatSkill({ spellsOnly: effect.spellsOnly });
      return [
        answered(
          say.words.takesThisSkillSSlotForSeconds({ which, seconds: String(effect.seconds) }),
        ),
      ];
    }
    // "whenever target foe enters a stance, you enter the same stance" (#1965).
    if (effect.kind === "mirror-stance") {
      return [answered(say.words.youEnterTheSameStance())];
    }
    // Ether Prodigy's end (#1984): "when it ends: lose 2 Health for each
    // point of Energy you have"; on a foe, Spoil Victor's "it loses 63
    // Health" (#2282); its caster's, Dark Aura's "you lose 17 Health" (#2313).
    if (
      effect.kind === "lose-health" &&
      effect.recipient === "target" &&
      (trigger.target === "bearer" || trigger.target === "source")
    ) {
      const text = say.words.loseWording(
        describeEffect(say, effect, ranks).text,
        trigger.target === "source",
        bearerIsFoe,
      );
      return [answered(text)];
    }
    if (effect.kind === "pay-energy-or-end") {
      return [answered(say.words.youLoseEnergyOrThisEnds({ amount: String(effect.amount) }))];
    }
    // A cancel with nothing to say after it (#1593).
    if (effect.kind === "cancel-attack") {
      return [sentence(say.words.thatAttackIsInterrupted({ when }))];
    }
    if (effect.kind === "damage" && trigger.target === "bearer") {
      return [clause(say.words.takes({ dealt: dealt(effect), when }))];
    }
    // Judge's Intervention's (#1789): "... that would kill it is negated,
    // and the foe who dealt it takes 150 holy damage".
    if (effect.kind === "damage" && trigger.target === "source-on-offender") {
      const then = say.words.bearerFatalDamageNegatedAnd({ on: trigger.on, when });
      return [
        clause(
          say.words.theFoeWhoDealtItTakesDamage({
            then,
            amount: amount(effect.amount),
            type: effect.type,
          }),
        ),
      ];
    }
    // Blood Bond's (#2314): "whenever it is hit by a foe's attack, that
    // attacker is healed for 17".
    if (
      effect.kind === "heal" &&
      trigger.target === "source-on-offender" &&
      trigger.on === "bearer-hit-by-attack"
    ) {
      return [clause(say.words.thatAttackerIsHealedFor({ when, amount: amount(effect.amount) }))];
    }
    // Scourge Enchantment's (#1403): "whenever it gains an enchantment,
    // its caster takes 63 holy damage".
    if (effect.kind === "damage" && trigger.target === "gained-source") {
      const gained = say.words.bearerGainsEnchantmentEnchantmentHexOrEnchantment({
        on: trigger.on,
      });
      return [
        clause(
          say.words.theCasterOfThatTakesDamage({
            when,
            gained,
            amount: amount(effect.amount),
            type: effect.type,
          }),
        ),
      ];
    }
    // Soul Bind's (#1913): "whenever it is healed by a skill, the healer
    // takes 68 damage".
    if (effect.kind === "damage" && trigger.target === "healer") {
      return [
        clause(
          say.words.theHealerTakesDamage({
            when,
            amount: amount(effect.amount),
            type: effect.type,
          }),
        ),
      ];
    }
    // Zealot's Fire's (#2282): "all foes adjacent to that target are struck
    // for 29 fire damage and you lose 1 Energy".
    if (effect.kind === "splash" && trigger.target === "skill-target") {
      const { what, paid } = splashWhat(say, effect, ranks);
      return [answered(say.words.ofThatTarget({ upTo: upTo(say, effect, ranks), what, paid }))];
    }
    if (effect.kind === "energy-loss" && trigger.target === "source") {
      const who = say.words.youLoseItsCasterLoses({ bearerIsCaster });
      return [answered(say.words.energy2({ who, amount: amount(effect.amount) }))];
    }
    if (effect.kind === "heal" && trigger.target === "source") {
      return [clause(say.words.healsItsCasterFor({ amount: amount(effect.amount), when }))];
    }
    // Arcane Conundrum's (#1570): "its caster gains 6 energy when it ends".
    if (effect.kind === "energy-gain" && trigger.target === "source") {
      return [clause(say.words.itsCasterGainsEnergy({ amount: amount(effect.amount), when }))];
    }
    if (effect.kind === "lengthen-recharge" && leadKind === "next-skill") {
      return [
        clause(
          say.words.theNextSkillYouUseItUses({ bearerIsCaster, seconds: amount(effect.seconds) }),
        ),
      ];
    }
    if (effect.kind === "life-steal" && trigger.target === "bearer") {
      return [clause(say.words.itsCasterStealsHealth({ amount: amount(effect.amount), when }))];
    }
    if (effect.kind === "splash" && trigger.target === "bearer") {
      const allies = splashed(effect);
      // A drop's splash is one clause (#1434): "foes in the area: deals 63
      // damage, knocks down for 2s".
      if (leadKind === "dropped") {
        const what = effect.effects.map((inner) =>
          inner.kind === "apply-status"
            ? suffered(say, inner, ranks)
            : say.words.lowerFirst(describeEffect(say, inner, ranks).text),
        );
        const joint = effect.effects[0]?.kind === "apply-status" ? " " : ": ";
        return [answered(`${allies}${joint}${what.join(say.words.listComma())}`)];
      }
      // Sliver Armor's (#2095): "the nearest of nearby foes takes 29 earth damage".
      const struck =
        effect.maxTargets === 1
          ? say.words.theNearestOfTakes({ allies })
          : effect.maxTargets === undefined
            ? say.words.take({ allies })
            : say.words.upToTake({ maxTargets: String(countAt(effect.maxTargets, ranks)), allies });
      return effect.effects.map((inner) =>
        inner.kind === "damage"
          ? clause(`${struck} ${dealt(inner)} ${when}`)
          : inner.kind === "apply-status"
            ? answered(`${allies} ${suffered(say, inner, ranks)}`)
            : answered(
                say.words.composedAlliesText({
                  allies,
                  text: describeEffect(say, inner, ranks).text,
                }),
              ),
      );
    }
    // Demonic Flesh's (#2313): on a self-buff the user is you, as its
    // enders say (#1841), and a splash round you that leaves the target
    // out strikes the others: "whenever you use a skill on a foe, other
    // foes adjacent to you take 17 shadow damage".
    if (
      effect.kind === "if" &&
      effect.condition.kind === "target-foe" &&
      trigger.target === "skill-target" &&
      !bearerIsFoe &&
      leadKind === "you-use" &&
      effect.effects.every((inner) => inner.kind === "splash" && inner.around === "caster")
    ) {
      const yours = say.words.onAFoe({ when });
      return effect.effects.flatMap((inner) => {
        if (inner.kind !== "splash") {
          return [];
        }
        const area = say.words.areaText.get(inner.radius);
        const reached = say.words.otherAdjacentToYouWithinAroundYou({
          includesCentre: inner.includesCentre,
          hits: inner.hits,
          value:
            inner.radius === AREA_ADJACENT
              ? say.words.adjacentToYou()
              : say.words.withinAroundYou({ area, radius: String(inner.radius) }),
        });
        return inner.effects.map((each) =>
          sentence(
            each.kind === "damage"
              ? say.words.takeDamage4({
                  yours,
                  reached,
                  amount: amount(each.amount),
                  type: each.type,
                })
              : say.words.composedYoursReachedText({
                  yours,
                  reached,
                  text: describeEffect(say, each, ranks).text,
                }),
          ),
        );
      });
    }
    // The bearer is "it" in its own tooltip (#988): "when it ends, if it
    // is attacking: heals for 88"; "if you are attacking" on the caster's
    // own (#2341).
    if (effect.kind === "if" && trigger.target === "bearer") {
      const said = conditionText(say, effect.condition);
      const condition = say.words.lowerFirst(
        say.words.composedBearerIsCasterSaid({ bearerIsCaster, said }),
      );
      return effect.effects.map((inner) =>
        sentence(
          say.words.composedWhenConditionText({
            when,
            condition,
            text: describeEffect(say, inner, ranks).text,
          }),
        ),
      );
    }
    // Energizing Finale's (#1485): "whenever a chant or shout ends on it:
    // it gains 2 energy". On the caster's own preparation or stance, a loss
    // is yours (#2133): Marksman's Wager's "you lose 10 energy".
    const bearer = (text: string): string => say.words.bearerWording(text, bearerIsCaster);
    return describeEffects(say, effect, ranks).map(({ text }) =>
      answered(say.words.bearer({ target: trigger.target, bearer: bearer(text), text })),
    );
  });
}

/** A chant's rider (#758), as its tooltip says it: "next attack skill: …". */
function describeNextAttackSkill(
  say: Say,
  effect: SkillEffect,
  ranks: ReadonlyMap<string, number>,
): string[] {
  if (effect.kind === "apply-status") {
    return [
      say.words.nextAttackSkill({
        statusName: say.names.status(effect.statusId),
        durationSeconds: lasting(say, effect.durationSeconds, ranks),
      }),
    ];
  }
  return describeEffects(say, effect, ranks).map(({ text }) =>
    say.words.nextAttackSkill2({ text }),
  );
}

function describeNextSkill(
  say: Say,
  { which, count, effects, at }: NextSkill,
  ranks: ReadonlyMap<string, number>,
): string[] {
  const [one, many] = say.words.nextSkillKind[which];
  const next =
    count === 1 ? one : `${statText(count, ranks, (n) => String(Math.round(n)))} ${many}`;
  // Keystone Signet's (#2275): around that skill's target, not the bearer.
  const around = say.words.skillTargetAroundItsTarget({ at });
  return effects.flatMap((effect) =>
    describeEffects(say, effect, ranks).map(({ text }) =>
      say.words.withYourNext({ next, around, text }),
    ),
  );
}

/**
 * How a status changes its bearer's own skills of a kind (#1761): "your
 * Monk spells cost 5 less Energy (minimum 1)", "your next Dervish
 * enchantment lasts 122% longer". On a hex they are the hexed foe's
 * (#2337): "the target's signets take 2× as long to cast".
 */
function describeOwnSkillModifier(
  say: Say,
  {
    filter,
    energyBase,
    energyDiscount,
    energyFloor,
    energySurcharge,
    activationMultiplier,
    activationSecondsLess,
    rechargeFaster,
    rechargeSlower,
    durationMultiplier,
    healMultiplier,
    sparesDivineFavor,
    notEasilyInterrupted,
    overcastPerUse,
    energyPercentOff,
    whileHoldingItem,
    uses,
  }: OwnSkillModifier,
  ranks: ReadonlyMap<string, number> | undefined,
  whose: string,
): string {
  // Soul Twisting's "1...3" is plural until a rank makes it 1 (#2478).
  const one =
    uses !== undefined &&
    (typeof uses === "number"
      ? uses === 1
      : ranks !== undefined && Math.round(statAt(uses, ranks)) === 1);
  // A scaled number prints at `ranks` (#2158), as a status stat does.
  const at = (stat: StatusStat, format: (value: number) => string): string =>
    statText(stat, ranks, format);
  const changes = [
    energyBase === undefined
      ? undefined
      : say.words.costsCostEnergy({ one, energyBase: String(energyBase) }),
    // Attuned Was Songkai's (#2501).
    statAtTwelve(energyPercentOff) === 0
      ? undefined
      : say.words.costsCostLessEnergy({ one, energyPercentOff: at(energyPercentOff, percent) }),
    statAtTwelve(energyDiscount) === 0
      ? undefined
      : say.words.costsCostLessEnergyMinimum({
          one,
          energyDiscount: at(energyDiscount, whole),
          energyFloor: String(energyFloor),
        }),
    statAtTwelve(energySurcharge) === 0
      ? undefined
      : say.words.costsCostMoreEnergy({ one, energySurcharge: at(energySurcharge, whole) }),
    statAtTwelve(activationMultiplier) === 1
      ? undefined
      : // Signet of Mystic Speed's (#2501).
        statAtTwelve(activationMultiplier) === 0
        ? say.words.castsCastInstantly({ one })
        : statAtTwelve(activationMultiplier) < 1
          ? say.words.castsCastFaster({
              one,
              activationMultiplier: at(activationMultiplier, (value) => percent(1 - value)),
            })
          : // Rust's "take twice as long to activate" (#2289).
            say.words.takesTakeAsLongToCast({
              one,
              activationMultiplier: at(activationMultiplier, String),
            }),
    statAtTwelve(activationSecondsLess) === 0
      ? undefined
      : say.words.castsCastFaster2({
          one,
          activationSecondsLess: at(activationSecondsLess, say.words.seconds),
        }),
    statAtTwelve(rechargeFaster) === 0
      ? undefined
      : say.words.rechargesRechargeFaster({ one, rechargeFaster: at(rechargeFaster, percent) }),
    rechargeSlower === 0
      ? undefined
      : say.words.rechargesRechargeSlower({ one, rechargeSlower: percent(rechargeSlower) }),
    statAtTwelve(durationMultiplier) === 1
      ? undefined
      : say.words.lastsLastLongerShorter({
          one,
          durationMultiplier: at(durationMultiplier, (value) => percent(value - 1)),
          durationMultiplier2: statAtTwelve(durationMultiplier),
        }),
    healMultiplier === 1
      ? undefined
      : say.words.healsHealLessMoreNotTheDivine({
          one,
          value: percent(1 - healMultiplier),
          healMultiplier,
          sparesDivineFavor,
        }),
    // Trapper's Focus's (#1966).
    notEasilyInterrupted ? say.words.isAreNotEasilyInterrupted({ one }) : undefined,
    // Iron Mist's (#2311).
    overcastPerUse === 0
      ? undefined
      : say.words.overcastYouBy({ overcastPerUse: String(overcastPerUse) }),
  ].filter((change) => change !== undefined);
  // Way of the Empty Palm's "off-hand and dual attacks" (#2134).
  const kind =
    filter.chainRoles !== undefined
      ? say.words.andAttack({ chainRoles: filter.chainRoles.join(say.words.and()) })
      : // Expert Focus's "bow attack skills" (#2189).
        say.words.attackSkillSkill({ weapon: filter.weapon, type: filter.type });
  const named = [
    filter.profession === undefined ? undefined : say.names.profession(filter.profession),
    filter.attributeId === undefined ? undefined : say.names.attribute(filter.attributeId),
    say.words.hexHexesS({ one, kind }),
    // Iron Mist's "spells that target a foe" (#2311).
    filter.targetsFoe ? say.words.thatTargetsAFoeThatTargetA({ one }) : undefined,
    // Signet of Mystic Speed's (#2501).
    filter.targetsSelf ? say.words.thatTargetsYouThatTargetYou({ one }) : undefined,
  ].filter((word) => word !== undefined);
  // Deadly Haste's "half-ranged spells" (#2501).
  const ranged = filter.halfRange ? [say.words.halfRanged(), ...named] : named;
  // Lyssa's Haste and the like are instant already (#2501).
  const flash = say.words.notFlashEnchantments({ notFlash: filter.notFlash });
  // Renewing Memories' (#2501).
  const holding = say.words.whileHoldingAnItem2({ whileHoldingItem });
  const which =
    uses === undefined ? whose : say.words.nextNext({ one, whose, uses: at(uses, whole) });
  return `${holding}${which} ${ranged.join(say.words.listSpace())}${flash} ${changes.join(say.words.and())}`;
}

/**
 * How a chant's next skill of a kind goes (#1505): "your next skill cannot
 * be interrupted". Its scaled numbers at `ranks`, as `statText` (#2502).
 */
function describeNextSkillRule(
  say: Say,
  {
    which,
    uninterruptible,
    unblockable,
    energyDiscount,
    castsInstantly,
    extraRechargeSeconds,
    rechargesInstantly,
    losesAllEnergy,
    energyGainOfCost,
    rechargeFasterIfType,
    resetsOwnRechargeIfType,
    skillId,
  }: NextSkillRule,
  ranks: ReadonlyMap<string, number> | undefined,
): string[] {
  // One clause for all a rule does to the skill (#1730): "your next
  // spell casts instantly and takes 30s longer to recharge".
  const does = [
    ...(uninterruptible ? [say.words.cannotBeInterrupted()] : []),
    ...(unblockable ? [say.words.cannotBeBlocked()] : []),
    ...(energyDiscount > 0
      ? [say.words.costsLessEnergy({ energyDiscount: String(energyDiscount) })]
      : []),
    ...(castsInstantly ? [say.words.castsInstantly()] : []),
    ...(rechargesInstantly
      ? [say.words.rechargesInstantly()]
      : statAtTwelve(extraRechargeSeconds) > 0
        ? [
            say.words.takesSLongerToRecharge({
              extraRechargeSeconds: statText(extraRechargeSeconds, ranks, (value) =>
                say.words.s2({ value: whole(value) }),
              ),
            }),
          ]
        : []),
  ];
  return [
    ...(does.length > 0
      ? [
          say.words.yourNextAnd({
            NEXT_SKILL_KIND: say.words.nextSkillKind[which][0],
            does: does.join(say.words.and()),
          }),
        ]
      : []),
    ...(losesAllEnergy ? [say.words.youLoseAllEnergyAsItIs()] : []),
    // Auspicious Incantation's (#2502).
    ...(statAtTwelve(energyGainOfCost) > 0
      ? [
          say.words.youGainOfItsEnergyCost({
            energyGainOfCost: statText(energyGainOfCost, ranks, percent),
          }),
        ]
      : []),
    ...ifTypeText(say, rechargeFasterIfType, resetsOwnRechargeIfType, skillId),
  ];
}

/**
 * What a rule does when its skill is of a type (#1941), Ritual Lord's:
 * "for your next skill", "if it is a binding ritual, it recharges 50%
 * faster and Ritual Lord recharges instantly".
 */
function ifTypeText(
  say: Say,
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
      : [say.words.itRechargesFaster({ fraction: String(Math.round(faster.fraction * 100)) })]),
    ...(resets === undefined
      ? []
      : [say.words.rechargesInstantly2({ name: say.names.skill(skillId) })]),
  ];
  const kind = say.words.typeName(type);
  return [
    say.words.forYourNextSkill(),
    say.words.ifItIsAAnd({ kind, does: does.join(say.words.and()) }),
  ];
}

/**
 * A status a splash puts on those it reaches, as the second half of a
 * line (#1021): "nearby foes suffer Bleeding for 13s (…)", not "applies".
 */
function suffered(say: Say, effect: ApplyStatusEffect, ranks: ReadonlyMap<string, number>): string {
  return say.words.suffer({ sufferedWhat: sufferedWhat(say, effect, ranks) });
}

/** `suffered`'s status, its duration and its effect, with no verb before it. */
function sufferedWhat(
  say: Say,
  effect: ApplyStatusEffect,
  ranks: ReadonlyMap<string, number>,
): string {
  return say.words.forWord2({
    statusName: say.names.status(effect.statusId),
    durationSeconds: lasting(say, effect.durationSeconds, ranks),
    status: statusText(say, effect.statusId, ranks),
  });
}

/**
 * "a hex", "a Mesmer hex", "a Water Magic hex" (#1765): a `target-has`'s
 * category, named by its filters.
 */
function filteredCategory(
  say: Say,
  condition: {
    readonly category: StatusCategory;
    readonly profession?: ProfessionId;
    readonly attribute?: string;
  },
): string {
  const owners = [
    ...(condition.profession === undefined ? [] : [say.names.profession(condition.profession)]),
    ...(condition.attribute === undefined ? [] : [say.names.attribute(condition.attribute)]),
  ];
  if (owners.length === 0) {
    return say.words.aCategory(condition.category);
  }
  return say.words.a({ owners: owners.join(say.words.listSpace()), category: condition.category });
}

/**
 * What an `if` waits for, as the line it leads says it (#521, #794), an
 * amount at `ranks` (#2132).
 */
function conditionText(
  say: Say,
  condition: EffectCondition,
  ranks: ReadonlyMap<string, number> = new Map(),
): string {
  switch (condition.kind) {
    case "interrupted":
      return say.words.ifItInterruptsASkill();
    case "interrupted-spell":
      return say.words.ifThatActionWasASpell();
    case "interrupted-attack":
      return say.words.ifThatActionWasAnAttack();
    case "target-killed":
      return say.words.ifItKillsTheTarget();
    case "resurrected":
      return say.words.ifItResurrects();
    case "creature-destroyed":
      return say.words.ifASpiritDiedInThisWay();
    case "removed":
      return condition.from === "caster"
        ? say.words.ifWasRemoved({ category: condition.category })
        : say.words.ifItRemoves({ category: condition.category });
    case "target-health-below":
      return say.words.ifTargetIsBelowHealth({
        fraction: String(Math.round(condition.fraction * 100)),
      });
    case "target-health-above":
      return say.words.ifTargetIsAboveHealth({
        fraction: String(Math.round(condition.fraction * 100)),
      });
    case "caster-health-below":
      return say.words.ifYouHaveLessThanHealth({
        fraction: String(Math.round(condition.fraction * 100)),
      });
    case "caster-health-below-companion":
      return say.words.ifYouHaveLessHealthThanYour();
    case "companion-health-below-caster":
      return say.words.ifYourPetHasLessHealthThan();
    case "target-chain-mark":
      return say.words.ifItFollowsOffHandAnOff({ role: condition.role });
    case "target-has":
      return say.words.ifTargetHas({ filteredCategory: filteredCategory(say, condition) });
    case "target-has-any":
      return say.words.ifTargetHasOr({
        categories: condition.categories.map(say.words.aCategory).join(say.words.or()),
      });
    case "caster-has":
      return condition.profession === undefined
        ? say.words.ifYouHave({ category: condition.category })
        : say.words.ifYouHaveA({
            name: say.names.profession(condition.profession),
            category: condition.category,
          });
    case "caster-lacks": {
      const other = say.words.other({ excluding: condition.excluding });
      return condition.profession === undefined
        ? say.words.ifYouHaveNo({ other, category: condition.category })
        : say.words.ifYouHaveNo2({
            other,
            name: say.names.profession(condition.profession),
            category: condition.category,
          });
    }
    case "target-casting":
      return say.words.ifTargetIsCastingASpellOr({ orChant: condition.orChant });
    case "target-using-skill":
      return say.words.ifTargetIsUsingASkill();
    case "target-lacks-other-hex":
      return say.words.ifTargetHasNoOtherHex({ name: say.names.profession(condition.profession) });
    case "target-alone":
      return condition.radius === AREA_ADJACENT
        ? say.words.ifTargetIsNotAdjacentToAny()
        : condition.radius === AREA_NEARBY
          ? say.words.ifTargetIsNotNearAnyAllies()
          : say.words.ifTargetHasNoAlliesWithin({ radius: String(condition.radius) });
    case "target-near-caster-ally":
      return condition.radius === AREA_NEARBY
        ? say.words.ifTargetIsNearAnyOfYour()
        : say.words.ifAnyOfYourAlliesIsWithin({ radius: String(condition.radius) });
    case "target-within":
      return condition.radius === AREA_EARSHOT
        ? say.words.ifTargetIsWithinEarshot()
        : say.words.ifTargetIsWithinOfYou({ radius: String(condition.radius) });
    case "target-not-moving":
      return say.words.ifTargetIsNotMoving();
    case "target-knocked-down":
      return say.words.ifTargetIsKnockedDown();
    case "target-moving":
      return say.words.ifTargetIsMoving();
    case "target-foe":
      return say.words.ifTargetIsAFoe();
    case "target-moving-faster":
      return say.words.ifTargetIsMovingFasterThanNormal();
    case "any-of": {
      return say.words.anyOfWording(
        condition.conditions.map((each) => conditionText(say, each, ranks)),
      );
    }
    case "not":
      return say.words.negatedText(conditionText(say, condition.condition, ranks));
    case "all-of": {
      return say.words.allOfWording(
        condition.conditions.map((each) => conditionText(say, each, ranks)),
      );
    }
    case "count-at-least":
      // "On Your Knees!"'s "if any adjacent foe is knocked down" (#2320),
      // Flame Djinn's Haste's "if any foe is adjacent" (#2414).
      if (condition.atLeast === 1 && condition.count.kind === "foes-within") {
        const where = say.words.within({
          radius: condition.count.radius,
          radius2: String(condition.count.radius),
        });
        return say.words.ifAnyFoeIsKnockedDownIf({
          knockedDown: condition.count.knockedDown,
          where,
        });
      }
      // Farmer's Scythe's "if you hit more than one foe" (#2438).
      if (condition.count.kind === "targets") {
        return say.words.ifYouHitOrMoreFoes({ atLeast: String(condition.atLeast) });
      }
      return say.words.ifNumberOrMore({
        countAll: countAll(say, condition.count),
        atLeast: String(condition.atLeast),
      });
    case "count-at-most":
      return say.words.ifAreNoMoreThan({
        countAll: countAll(say, condition.count),
        countAll2: countAll(say, condition.than),
      });
    case "target-has-status":
      return say.words.ifTargetHas2({ statusName: say.names.status(condition.statusId) });
    case "target-lacks-status":
      return say.words.ifTargetDoesNotHave({ statusName: say.names.status(condition.statusId) });
    case "caster-more-energy":
      return say.words.ifYouHaveMoreEnergyThanTarget();
    case "caster-energy-below":
      return say.words.ifYouHaveLessThanEnergy({
        amount: shown(describeMagnitude(condition.amount, ranks)),
      });
    case "caster-overcast":
      return say.words.ifYouAreOvercast();
    case "caster-wields":
      return say.words.ifYouWield({ weapon: condition.weapon });
    case "caster-holds-shield":
      return say.words.ifYouHoldAShield();
    case "caster-holds-item":
      return say.words.ifYouAreHoldingAnItem();
    case "target-less-health":
      return say.words.ifTargetHasLessHealthThanYou();
    case "target-more-health":
      return say.words.ifTargetHasMoreHealthThanYou();
    case "target-attacking":
      return say.words.ifTargetIsAttacking();
    case "target-not-attacking":
      return say.words.ifTargetIsNotAttacking();
    case "target-casting-or-attacking":
      return say.words.ifTargetIsCastingASpellOr2();
    case "target-is-summoned":
      return say.words.ifTargetIsASummonedCreature();
    case "caster-no-spirit-within":
      return say.words.ifNoSpiritIsWithinOfYou({
        radius: condition.radius,
        radius2: String(condition.radius),
      });
    case "caster-spirit-within":
      return say.words.ifASpiritIsWithinOfYou({
        radius: condition.radius,
        radius2: String(condition.radius),
      });
    case "caster-controls-at-most":
      return say.words.ifYouControlOrFewerS({
        count: String(condition.count),
        creature: condition.creature,
      });
    case "caster-spirit-or-corpse-within":
      return say.words.ifASpiritOrACorpseIs({
        radius: condition.radius,
        radius2: String(condition.radius),
      });
    case "caster-dead-ally-within":
      return say.words.ifAnAllyIsDeadWithin({
        radius: condition.radius,
        radius2: String(condition.radius),
      });
    case "target-near-corpse-or-dead-pet":
      return condition.radius === AREA_NEARBY
        ? say.words.ifTargetIsNearACorpseOr()
        : say.words.ifTargetIsWithinOfACorpse({ radius: String(condition.radius) });
  }
}

/** An attack skill's damage type (#923), as " lightning" in "+18 lightning damage". */
function damageTypeText(say: Say, skill: Skill): string {
  const type = blowRuleOf(skill)?.damageType;
  return say.words.composedType({ type });
}

/**
 * Leader's Comfort's heal per ally (#923), as the second half of its
 * line: ", +18 Health for each ally in earshot (max 140)".
 */
function perAllyText(say: Say, effect: HealEffect, ranks: ReadonlyMap<string, number>): string {
  const { perAlly } = effect;
  if (perAlly === undefined) {
    return "";
  }
  const amount = shown(describeMagnitude(perAlly.amount, ranks));
  const area = say.words.within({ radius: perAlly.radius, radius2: String(perAlly.radius) });
  return say.words.healthForEachAllyMax({ amount, area, max: String(perAlly.max) });
}

/** Who a splash reaches, as GW1 words it (#885): "Adjacent foes". */
function foesWithin(say: Say, radius: number, hits: SplashEffect["hits"]): string {
  // Protective Was Kaolai's reaches the whole party, at any distance (#1434).
  if (hits === "party" && radius === Number.POSITIVE_INFINITY) {
    return say.words.allPartyMembers();
  }
  // Mirror of Disenchantment's foe's whole party (#1954).
  if (hits === "foes" && radius === Number.POSITIVE_INFINITY) {
    return say.words.allItsPartyMembers();
  }
  // Blood of the Master's, wherever they are (#1986).
  if (hits === "allied-minions" && radius === Number.POSITIVE_INFINITY) {
    return say.words.allAlliedMinions();
  }
  // Feast for the Dead's, wherever they are (#1836).
  if (hits === "own-minions" && radius === Number.POSITIVE_INFINITY) {
    return say.words.yourOtherMinions();
  }
  const area = say.words.areaText.get(radius);
  // Consume Soul's splash reaches only summoned creatures (#1309);
  // Spirit's Gift's, allies (#1316); Spirit Boon Strike's, your spirits (#1777).
  const who = say.words.splashSide[hits];
  const Who = say.words.capitalize(who);
  // "Your spirits in earshot": round you, wherever the target stands.
  if (hits === "own-spirits") {
    return say.words.within2({ Who, area, radius: String(radius) });
  }
  if (radius === AREA_ADJACENT) {
    return say.words.adjacent({ who });
  }
  if (radius === AREA_NEARBY) {
    return say.words.nearby({ who });
  }
  return say.words.within3({ area, Who, radius: String(radius) });
}

/**
 * What each in a splash loses (#1954): Hex Eater Signet's "lose 1 hex",
 * Mirror of Disenchantment's "lose that same enchantment".
 */
function lostInSplash(
  say: Say,
  effect: RemoveStatusEffect,
  ranks: ReadonlyMap<string, number>,
): string {
  if (effect.sameAsRemoved === true) {
    return say.words.loseThatSame({ category: effect.category });
  }
  if (effect.count === "all" || effect.perRemoved !== undefined) {
    return say.words.loseAllAll({ category: effect.category });
  }
  if (effect.perCount !== undefined) {
    return say.words.loseOneForEachOnThem({
      category: effect.category,
      countEach: countEach(say, effect.perCount, say.words.onThem()),
    });
  }
  const count = countAt(effect.count, ranks);
  return say.words.lose({ count: String(count), count2: count, category: effect.category });
}

/**
 * A splash's `onlyIf` (#2288), as said of whom it reaches: "while
 * attacking or moving", "has a Water Magic hex".
 */
function onlyIfText(
  say: Say,
  condition: StateCondition,
  ranks: ReadonlyMap<string, number>,
): string {
  return say.words.onlyIfWording(conditionText(say, condition, ranks));
}

/**
 * A splash's reach with its cap (#1618): Cleave's "Up to 2 adjacent foes".
 * Without `withOnlyIf`, its `onlyIf` is left for the caller to say (#2313).
 */
function upTo(
  say: Say,
  splash: SplashEffect,
  ranks: ReadonlyMap<string, number>,
  withOnlyIf = true,
): string {
  // Hex Eater Signet's "adjacent allies with a hex" (#1954).
  // Mystic Healing's "enchanted party members", "with an enchantment" (#2207).
  const article = say.words.enchantmentAnA({ onlyBearing: splash.onlyBearing });
  const bearing = say.words.with4({ onlyBearing: splash.onlyBearing, article });
  // Glimmering Mark's "target foe and all foes adjacent", "using attack
  // skills" (#2282).
  const using = say.words.usingSkills({ onlyUsing: splash.onlyUsing });
  // Gust's "while attacking or moving" (#2288).
  const onlyIf =
    splash.onlyIf === undefined || !withOnlyIf ? "" : ` ${onlyIfText(say, splash.onlyIf, ranks)}`;
  // Light of Dwayna's "all dead party members in the area" (#2446).
  const living = foesWithin(say, splash.radius, splash.hits);
  const reached = say.words.dead({ dead: splash.dead, living });
  const who = say.words.targetAndCasterAroundYouCasterAround({
    includesCentre: splash.includesCentre,
    reached,
    around: splash.around,
    alsoAround: splash.alsoAround,
    bearing,
    using,
    onlyIf,
  });
  return splash.maxTargets === undefined || splash.hits === "party"
    ? who
    : say.words.upTo3({ maxTargets: String(countAt(splash.maxTargets, ranks)), who });
}

/**
 * An effect's lines: one, or for an `if`, one per effect inside it, each
 * led by its condition: "If it interrupts: deals 102 damage".
 */
function describeEffects(
  say: Say,
  effect: SkillEffect,
  ranks: ReadonlyMap<string, number>,
): Line[] {
  if (effect.kind === "summon") {
    const { kind, aura, attack, deathBurst, onDeathInRange, pulse } = effect.creature;
    return [
      describeEffect(say, effect, ranks),
      // What the spirit projects (#1064): "Non-spirit allies in its range:
      // +3 Health regeneration".
      ...(aura === undefined ? [] : [describeAura(say, aura, say.words.inItsRange(), ranks)]),
      ...(kind === "spirit" && attack !== undefined && attack.damageMax > 0
        ? [describeSpiritDamage(say, attack, ranks)]
        : []),
      ...(kind !== "spirit" && attack?.scaling.kind === "level"
        ? [describeMinionDamage(say, attack, attack.scaling.level, ranks)]
        : []),
      ...(attack?.onHit ?? []).map((onHit) => describeSpiritBlow(say, onHit, ranks)),
      ...(pulse === undefined ? [] : [describeSpiritPulse(say, pulse, ranks)]),
      ...(deathBurst === undefined ? [] : [describeDeathBurst(say, deathBurst, ranks)]),
      ...(onDeathInRange === undefined ? [] : [describeDeathInRange(say, onDeathInRange, ranks)]),
      ...describeMinionDeath(say, effect.creature, ranks),
    ];
  }
  if (effect.kind === "create-ground-effect") {
    const { act } = effect;
    if (act.kind === "aura") {
      // What the ward projects (#1087): "Non-spirit allies in the area: 50%
      // chance to block melee attacks".
      return [
        describeEffect(say, effect, ranks),
        describeAura(say, act.aura, say.words.inTheArea(), ranks),
      ];
    }
    // What a trap does when sprung (#1105), and a pulse each time
    // (#1113): "When sprung, every 1s for 3s, foes nearby: deals 17
    // damage".
    const pulse = act.kind === "trap" ? act.trap.spring : act.pulse;
    // Healing Spring's "you and allies adjacent" (#2317).
    const whom = ({ radius, affects, includesCaster }: RadiusArea): string =>
      say.words.enemiesFoesAllEveryoneYouAndAllies({
        value:
          affects === "enemies"
            ? say.words.foes()
            : say.words.allEveryoneYouAndAlliesAllies({ affects, includesCaster }),
        radius,
        radius2: String(radius),
      });
    const who = [
      ...(act.kind === "trap" ? [say.words.whenSprung()] : []),
      // Spirit Rift's (#1270): "after 3s, foes adjacent: ...".
      ...(pulse.delaySeconds > 0 ? [say.words.after({ delaySeconds: pulse.delaySeconds })] : []),
      ...(pulse.count > 1
        ? [
            say.words.everyFor({
              everySeconds: pulse.everySeconds,
              count: pulse.count * pulse.everySeconds,
            }),
          ]
        : []),
      whom(pulse.area),
    ].join(say.words.listComma());
    // Searing Heat's (#2329): "When it ends, foes nearby: applies Burning".
    const end = act.kind === "pulse" ? act.atEnd : undefined;
    const ending = end === undefined ? "" : say.words.whenItEnds({ whom: whom(end.area) });
    return [
      describeEffect(say, effect, ranks),
      ...(act.kind === "trap" && act.trap.springsAtEnd
        ? [{ text: say.words.springsByItselfAsItsTimeRuns(), magnitude: undefined }]
        : []),
      ...pulse.effects.flatMap((inner) =>
        describeEffects(say, inner, ranks).map(({ text, magnitude }) => ({
          text: say.words.composedWhoText({ who, text }),
          magnitude,
        })),
      ),
      ...(end?.effects ?? []).flatMap((inner) =>
        describeEffects(say, inner, ranks).map(({ text, magnitude }) => ({
          text: say.words.composedEndingText({ ending, text }),
          magnitude,
        })),
      ),
    ];
  }
  if (effect.kind !== "if") {
    return [describeEffect(say, effect, ranks)];
  }
  const condition = conditionText(say, effect.condition, ranks);
  return effect.effects.map((inner) => {
    const { text, magnitude } = describeEffect(say, inner, ranks);
    return { text: say.words.composedConditionText({ condition, text }), magnitude };
  });
}

/**
 * What a spirit's blow deals (#1631): "Its attacks deal 17 damage",
 * linear in the rank as GW1 states it when it scales by rank.
 */
function describeSpiritDamage(
  say: Say,
  attack: CreatureAttack,
  ranks: ReadonlyMap<string, number>,
): Line {
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
  return { text: say.words.itsAttacksDealDamage({ magnitude: shown(magnitude) }), magnitude };
}

/**
 * What a spirit's blows land (#1550), one line an effect, an `if` said
 * once: "Its attacks: if target is not moving: knocks down for 2s, this
 * spirit loses 54 Health". Health it loses is the spirit's, not its
 * caster's. The line's scaling is its first number that scales.
 */
function describeSpiritBlow(
  say: Say,
  effect: SkillEffect,
  ranks: ReadonlyMap<string, number>,
): Line {
  const parts = (effect.kind === "if" ? effect.effects : [effect]).map((inner): Line => {
    if (inner.kind === "lose-health" && inner.perRemovedOfProfession === undefined) {
      const magnitude = describeMagnitude(inner.amount, ranks);
      return { text: say.words.thisSpiritLosesHealth({ magnitude: shown(magnitude) }), magnitude };
    }
    return describeEffect(say, inner, ranks);
  });
  const when =
    effect.kind === "if"
      ? say.words.composedCondition({ condition: conditionText(say, effect.condition) })
      : "";
  const what = parts.map(({ text }) => say.words.lowerFirst(text)).join(say.words.listComma());
  const scaled = parts.find(({ magnitude }) => magnitude?.atZero !== undefined);
  return { text: say.words.itsAttacks({ when, what }), magnitude: (scaled ?? parts[0])?.magnitude };
}

/**
 * "2 Bone Minion (60 Health, lasts 30 seconds)": who a summon or a
 * replacement makes, with Spawning Power's health and the base in
 * brackets (#1098).
 */
function describeCreature(
  say: Say,
  creature: CreatureTemplate,
  count: number,
  ranks: ReadonlyMap<string, number>,
): Line {
  const health = describeMagnitude(creature.maxHealth, ranks);
  const spawned = spawningPowerHealth(spawningPowerOf(ranks), health.current);
  const healthText =
    spawned === health.current
      ? say.words.health3({ health: shown(health) })
      : say.words.health4({ health: shown(health, String(spawned)), health2: shown(health) });
  const level = creatureLevel(creature.attack, ranks);
  const levelText =
    level === undefined || creature.attack === undefined
      ? ""
      : say.words.level({ marked: marked(creature.attack.attributeId, String(Math.round(level))) });
  const lasts =
    creature.durationSeconds === undefined
      ? ""
      : say.words.lastsSeconds({
          durationSeconds: shown(describeMagnitude(creature.durationSeconds, ranks)),
        });
  return {
    text: say.words.composedCountNameLevelTextHealthTextLasts({
      count: String(count),
      name: creature.name,
      levelText,
      healthText,
      lasts,
    }),
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
  say: Say,
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
    text: say.words.itsAttacksDealDamage2({
      value: min === max ? scaled(max) : `${scaled(min)}–${scaled(max)}`,
    }),
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
  say: Say,
  creature: CreatureTemplate,
  ranks: ReadonlyMap<string, number>,
): Line[] {
  const { onePerOwner, leavesCorpses, replacedBy } = creature;
  const corpses = leavesCorpses === undefined ? undefined : describeMagnitude(leavesCorpses, ranks);
  const replacement =
    replacedBy === undefined
      ? undefined
      : describeCreature(say, replacedBy.creature, replacedBy.count, ranks);
  return [
    ...(onePerOwner ? [{ text: say.words.onlyOneAtATimeANew(), magnitude: undefined }] : []),
    ...(corpses === undefined
      ? []
      : [
          {
            text: say.words.leavesCorpseCorpsesWhenItDies({
              corpses: shown(corpses),
              current: corpses.current,
            }),
            magnitude: corpses,
          },
        ]),
    ...(replacedBy === undefined || replacement === undefined
      ? []
      : [
          {
            text: [
              say.words.whenItDiesStandsUpInIts({ text: replacement.text }),
              ...(replacedBy.creature.attack?.onHit ?? []).map((onHit) =>
                say.words.lowerFirst(describeSpiritBlow(say, onHit, ranks).text),
              ),
            ].join(say.words.listSemicolon()),
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
function describeDeathBurst(say: Say, burst: DeathBurst, ranks: ReadonlyMap<string, number>): Line {
  const where = say.words.inItsRange2({ radius: burst.radius });
  const who = say.words.composedAffectsWhere({ affects: burst.affects, where });
  if (burst.effect === "apply-status") {
    const duration = describeMagnitude(burst.durationSeconds, ranks);
    const below = `${String(Math.round(burst.belowHealthFraction * 100))}%`;
    return {
      text: say.words.whenItDiesUnderHealthBeginFor({
        who,
        below,
        statusName: say.names.status(burst.statusId),
        duration: shown(duration),
      }),
      magnitude: duration,
    };
  }
  if (burst.effect === "resurrect") {
    const health = describeMagnitude(burst.healthPercent, ranks);
    return {
      text: say.words.whenItDiesDeadPartyMembersAre({ where, health: shown(health) }),
      magnitude: health,
    };
  }
  const rate = describeMagnitude(burst.perSecondAlive, ranks);
  const amount = shown(rate);
  const what = say.words.damageTakeDamageAreHealedForHealth({ effect: burst.effect, amount });
  const max = burst.max === undefined ? "" : say.words.max({ max: String(burst.max) });
  return {
    text: say.words.whenItDiesPerSecondItLived({ who, what, max }),
    magnitude: rate,
  };
}

/**
 * A spirit's heal on one ally (#2477), Preservation's: "Every 4 seconds:
 * heals the most hurt non-spirit ally in its range for 94 Health".
 */
function describeSpiritPulse(
  say: Say,
  pulse: SpiritPulse,
  ranks: ReadonlyMap<string, number>,
): Line {
  const heal = describeMagnitude(pulse.heal, ranks);
  const where = say.words.inItsRange2({ radius: pulse.radius });
  return {
    text: say.words.everySecondsHealsTheMostHurtNon({
      everySeconds: String(pulse.everySeconds),
      where,
      heal: shown(heal),
    }),
    magnitude: heal,
  };
}

/**
 * A spirit's answer to a death in its range (#1886): "When a non-spirit
 * dies in its range, each of its type in its range below 90% Health takes
 * 43 damage".
 */
function describeDeathInRange(
  say: Say,
  rule: DeathInRange,
  ranks: ReadonlyMap<string, number>,
): Line {
  const when = say.words.whenANonSpiritDiesInIts();
  if (rule.kind === "spread-conditions") {
    const where = say.words.nearby2({ radius: rule.radius });
    return {
      text: say.words.itsConditionsSpreadToEachNonSpirit({ when, where }),
      magnitude: undefined,
    };
  }
  const damage = describeMagnitude(rule.damage, ranks);
  const below = `${String(Math.round(rule.belowHealthFraction * 100))}%`;
  return {
    text: say.words.eachOfItsTypeInItsRange({ when, below, damage: shown(damage) }),
    magnitude: damage,
  };
}

/**
 * Who an aura reaches and what they wear: "Non-spirit allies in its
 * range: …"; Empowerment's only those "holding an item" (#2478).
 */
function describeAura(
  say: Say,
  aura: Aura,
  where: string,
  ranks: ReadonlyMap<string, number>,
): Line {
  const who = say.words.auraWho[aura.affects];
  const holding = say.words.holdingAnItem({
    onlyWhileHoldingItem: getStatusDefinition(aura.statusId).onlyWhileHoldingItem,
  });
  return {
    text: say.words.composedWhoWhereHoldingStatus({
      who,
      where,
      holding,
      status: statusText(say, aura.statusId, ranks, holding !== ""),
    }),
    magnitude: undefined,
  };
}

/** " per foe hit", for an amount the caster gains once for each target hit (#977). */
function perFoeHit(say: Say, effect: { readonly perTarget?: true }): string {
  return say.words.perFoeHit({ perTarget: effect.perTarget });
}

/** Defensive Stance's " for each melee attack skill on your bar (at most 3)" (#1978). */
function perOwnMeleeAttackSkill(say: Say, effect: AdrenalineGainEffect): string {
  const per = effect.perOwnMeleeAttackSkill;
  return per === undefined ? "" : say.words.forEachMeleeAttackSkillOnYour({ max: String(per.max) });
}

/**
 * Signet of Creation's count and cap (#1316), in the corpus's words: " for
 * every summoned creature you control within earshot (maximum 10 Energy)".
 */
function perOwnCreatureText(
  say: Say,
  effect: EnergyGainEffect,
  ranks: ReadonlyMap<string, number>,
): string {
  const per = effect.perOwnCreatureWithin;
  if (per === undefined) {
    return "";
  }
  const area = say.words.within({ radius: per.radius, radius2: String(per.radius) });
  const where = say.words.withinEarshot({ radius: per.radius, area });
  const max = shown(describeMagnitude(per.max, ranks));
  return say.words.forEverySummonedCreatureYouControlMaximum({ where, max });
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
  say: Say,
  text: string,
  base: Magnitude,
  per: PerCount | undefined,
  ranks: ReadonlyMap<string, number>,
  words: { readonly alone: string; readonly unit: string; readonly onTarget: string },
): string {
  if (per === undefined) {
    return text;
  }
  const each = `${shown(describeMagnitude(per.amount, ranks))}${words.unit} ${perCountText(say, per, ranks, words.onTarget)}`;
  const zero = "flat" in base && base.flat === 0;
  return say.words.composedZeroAloneEachText({ zero, alone: words.alone, each, text });
}

/**
 * What a `per` counts, and its cap (#1760): "for each enchantment on
 * them (maximum 60)", "for each of your recharging Beast Mastery skills"
 * (#1957), "for each point of Energy you have" (#1984).
 */
function perCountText(
  say: Say,
  per: PerCount,
  ranks: ReadonlyMap<string, number>,
  onTarget: string,
): string {
  const max =
    per.max === undefined
      ? ""
      : say.words.maximum({ max: shown(describeMagnitude(per.max, ranks)) });
  return say.words.forEach({ countEach: countEach(say, per.count, onTarget), max });
}

/** One of what `count` counts, as "for each" names it: "hex on them", "foe nearby". */
function countEach(say: Say, count: CountRule, onTarget: string): string {
  // Aneurysm's (#2472).
  if (count.kind === "energy-gained") {
    return say.words.pointOfEnergyGained();
  }
  // Second Wind's and Expunge Enchantments' (#2504).
  if (count.kind === "overcast") {
    return say.words.pointOfEnergyRestrictedByOvercast();
  }
  if (count.kind === "own-skills-disabled") {
    return say.words.skillDisabledInThisWay();
  }
  return count.kind === "statuses"
    ? say.words.orCasterOnYou({
        categories: count.categories.join(say.words.or()),
        on: count.on,
        onTarget,
      })
    : count.kind === "recharging-skills"
      ? say.words.ofYourRecharging({ rechargingSkillsNoun: rechargingSkillsNoun(say, count) })
      : count.kind === "energy"
        ? say.words.pointOfEnergyCasterYouHaveThey({ on: count.on })
        : count.kind === "removed"
          ? count.profession === undefined
            ? say.words.orRemoved({ categories: count.categories.join(say.words.or()) })
            : say.words.orLost({
                name: say.names.profession(count.profession),
                categories: count.categories.join(say.words.or()),
              })
          : count.kind === "maintained-enchantments"
            ? say.words.enchantmentYouAreMaintaining()
            : count.kind === "held-seconds"
              ? say.words.secondItWasInEffect()
              : count.kind === "knocked-down"
                ? say.words.foeKnockedDown()
                : count.kind === "bar-skills"
                  ? say.words.youHaveEquipped({ type: count.type })
                  : count.kind === "adrenaline-skills"
                    ? say.words.adrenalineSkillTheyHave()
                    : count.kind === "targets"
                      ? say.words.foeHit()
                      : say.words.within4({
                          perCountNoun: perCountNoun(say, count),
                          radius: count.radius,
                          radius2: String(count.radius),
                        });
}

/**
 * The skills a `recharging-skills` count counts, plural (#2321): "Beast
 * Mastery skills", "binding rituals", "dagger attacks" (#2432).
 */
function rechargingSkillsNoun(
  say: Say,
  count: Extract<CountRule, { kind: "recharging-skills" }>,
): string {
  const attribute =
    count.attributeId === undefined ? undefined : say.names.attribute(count.attributeId);
  const kind = say.words.attacksSkillsS({ weapon: count.weapon, type: count.type });
  return attribute === undefined ? kind : `${attribute} ${kind}`;
}

/** All of what `count` counts, as a condition names it (#2247): "target's hexes", "your enchantments". */
function countAll(say: Say, count: CountRule): string {
  if (count.kind === "statuses") {
    const whose = say.words.casterYourTargetS({ on: count.on });
    return `${whose} ${count.categories.map((category) => say.words.categoryNoun("all", category)).join(say.words.and())}`;
  }
  return say.words.s3({ perCountNoun: perCountNoun(say, count) });
}

/** What a `per` counts, one of it, as a headline names it (#2222): "ally", "hex". */
function perCountNoun(say: Say, count: CountRule): string {
  if (count.kind === "energy-gained") {
    return say.words.pointOfEnergyGained();
  }
  if (count.kind === "overcast") {
    return say.words.pointOfOvercast();
  }
  if (count.kind === "own-skills-disabled") {
    return say.words.skillDisabled();
  }
  return count.kind === "statuses"
    ? count.categories.join(say.words.or())
    : count.kind === "recharging-skills"
      ? say.words.rechargingSkill()
      : count.kind === "energy"
        ? say.words.pointOfEnergy()
        : count.kind === "removed"
          ? count.profession === undefined
            ? say.words.removedOr({ categories: count.categories.join(say.words.or()) })
            : say.words.removedOr2({
                name: say.names.profession(count.profession),
                categories: count.categories.join(say.words.or()),
              })
          : count.kind === "maintained-enchantments"
            ? say.words.maintainedEnchantment()
            : count.kind === "held-seconds"
              ? say.words.secondHeld()
              : count.kind === "knocked-down"
                ? say.words.foeKnockedDown()
                : count.kind === "targets"
                  ? say.words.foeHit()
                  : count.kind === "adrenaline-skills"
                    ? say.words.adrenalineSkill()
                    : count.kind === "dead-allies-within"
                      ? say.words.deadAlly()
                      : count.kind === "foes-within"
                        ? say.words.knockedDownFoeFoe({ knockedDown: count.knockedDown })
                        : say.words.ally();
}

/** Warrior's Endurance's cap (#1359): ", never above 55". */
function upToText(say: Say, effect: EnergyGainEffect): string {
  return effect.upTo === undefined ? "" : say.words.neverAbove({ upTo: String(effect.upTo) });
}

/**
 * A count at the ranks: as it is, or a `Magnitude`'s current value, as
 * Divert Hexes' "up to 3 hexes" (#1954).
 */
function countAt(count: number | Magnitude, ranks: ReadonlyMap<string, number>): number {
  return typeof count === "number" ? count : resolveMagnitudeAtRanks(count, ranks);
}

/** " for each hex removed", for a gain per status taken off (#1954). */
function perRemovedText(say: Say, effect: EnergyGainEffect): string {
  return say.words.forEachRemoved({ toTarget: effect.toTarget, perRemoved: effect.perRemoved });
}

/** " per point lost", for an amount multiplied by the energy taken before it (#793). */
function perPointLost(say: Say, effect: { readonly perEnergyLost?: true }): string {
  return say.words.perPointLost({ perEnergyLost: effect.perEnergyLost });
}

/** A per-cost share as a percentage (#1614): 0.3 is "30%", 3.6 "360%". */
function percentOf(share: number): string {
  return `${String(Math.round(share * 100))}%`;
}

function describeEffect(
  say: Say,
  effect: UnconditionalEffect,
  ranks: ReadonlyMap<string, number>,
): Line {
  switch (effect.kind) {
    case "damage": {
      const magnitude = countedMagnitude(effect.amount, effect.per, ranks);
      const penetration =
        effect.armorPenetration > 0
          ? say.words.armorPenetration({
              armorPenetration: String(Math.round(effect.armorPenetration * 100)),
            })
          : "";
      const text = say.words.dealsDamage2({
        magnitude: shown(magnitude),
        type: effect.type,
        perPointLost: perPointLost(say, effect),
        penetration,
      });
      // Mystic Twister's "if you are enchanted, 50 more" (#977).
      const bonus = effect.conditionalBonus;
      const counted = withPerText(say, text, effect.amount, effect.per, ranks, {
        alone: say.words.deals(),
        unit: say.words.damage2({ type: effect.type }),
        onTarget: say.words.onThem(),
      });
      return {
        text:
          bonus === undefined
            ? counted
            : say.words.composedCountedConditionAmount({
                counted,
                condition: conditionText(say, bonus.condition),
                amount: shown(describeMagnitude(bonus.amount, ranks)),
              }),
        magnitude,
      };
    }
    case "heal": {
      const magnitude = countedMagnitude(effect.amount, effect.per, ranks);
      const amount = shown(magnitude);
      // Healing Burst's party (#2311).
      if (effect.divineFavorBonus === true && magnitude.current === 0) {
        return {
          text: say.words.gainHealthEqualToThisSpellS(),
          magnitude: undefined,
        };
      }
      const text =
        effect.perRemoved !== undefined && effect.perRemovedStatusId !== undefined
          ? say.words.healsIfRelievedOf({
              amount,
              name: say.names.status(effect.perRemovedStatusId),
            })
          : say.words.healsForEachRemovedHealsForEach({
              perRemoved: effect.perRemoved,
              amount,
              perDestroyedSpirit: effect.perDestroyedSpirit,
              perEnergyLost: effect.perEnergyLost,
              recipient: effect.recipient,
              perUsedSkillEnergy: effect.perUsedSkillEnergy,
              magnitude: shown(magnitude, percentOf(magnitude.current)),
              value:
                effect.ofCasterHealth !== undefined
                  ? say.words.healsForOfYourCurrentHealthMaximum({
                      magnitude: shown(magnitude, `${String(magnitude.current)}%`),
                      max: String(effect.ofCasterHealth.max),
                    })
                  : effect.recipient === "caster"
                    ? say.words.youGainHealth({ amount })
                    : effect.recipient === "companion"
                      ? say.words.yourPetGainsHealth({ amount })
                      : say.words.ownerHealsItsOwnerForHealsFor({
                          recipient: effect.recipient,
                          amount,
                        }),
            });
      const counted = withPerText(say, text, effect.amount, effect.per, ranks, {
        alone: say.words.casterYouGainHeals({ recipient: effect.recipient }),
        unit: say.words.health5(),
        onTarget: say.words.casterOnTargetFoeOnThem({ recipient: effect.recipient }),
      });
      // Mist Form's (#1951): ", under 80% Health".
      const below =
        effect.onlyBelowHealthFraction === undefined
          ? ""
          : say.words.underHealth({
              onlyBelowHealthFraction: String(Math.round(effect.onlyBelowHealthFraction * 100)),
            });
      return { text: `${counted}${perAllyText(say, effect, ranks)}${below}`, magnitude };
    }
    case "energy-gain": {
      const magnitude = countedMagnitude(effect.amount, effect.per, ranks);
      if (effect.toTarget !== true && effect.perUsedSkillEnergy === true) {
        return {
          text: say.words.gainOfTheSkillSBaseEnergy({
            magnitude: shown(magnitude, percentOf(magnitude.current)),
          }),
          magnitude,
        };
      }
      const gains = say.words.targetGainsOwnerYouGainGain({
        toTarget: effect.toTarget,
        recipient: effect.recipient,
      });
      const text = say.words.energy5({
        gains,
        magnitude: shown(magnitude),
        perPointLost: perPointLost(say, effect),
        perFoeHit: perFoeHit(say, effect),
        perOwnCreature: perOwnCreatureText(say, effect, ranks),
        perRemoved: perRemovedText(say, effect),
      });
      return {
        // A target's gain counts too (#2472).
        text: `${withPerText(say, text, effect.amount, effect.per, ranks, effect.toTarget === true ? { alone: gains, unit: say.words.energy6(), onTarget: say.words.onThem() } : { alone: say.words.gain2(), unit: say.words.energy6(), onTarget: say.words.onTargetFoe() })}${upToText(say, effect)}`,
        magnitude,
      };
    }
    case "adrenaline-gain": {
      // Balthazar's Spirit's points (#2302): "gains 2...5 adrenaline".
      const amount = effect.units ?? effect.strikes;
      const magnitude = countedMagnitude(amount, effect.per, ranks);
      const strikes = say.words.strikeStrikesOfAdrenalineAdrenaline({
        units: effect.units === undefined,
        magnitude: shown(magnitude),
        current: magnitude.current,
      });
      // Mark of Fury's attacker gains them (#2259).
      const gain =
        effect.recipient === "owner"
          ? say.words.youGain2()
          : say.words.targetTargetGainsGain({ recipient: effect.recipient });
      // "Make Your Time!"'s (#2222): "Gain 2 strikes of adrenaline for each ally in earshot".
      const counted = withPerText(say, `${gain} ${strikes}`, amount, effect.per, ranks, {
        alone: gain,
        unit: say.words.strikesOfAdrenaline(),
        onTarget: say.words.onThem(),
      });
      return {
        text: `${counted}${perFoeHit(say, effect)}${perOwnMeleeAttackSkill(say, effect)}`,
        magnitude,
      };
    }
    // Aneurysm's (#2472).
    case "energy-refill":
      return { text: say.words.targetRegainsAllEnergy(), magnitude: undefined };
    case "energy-loss": {
      const magnitude = describeMagnitude(effect.amount, ranks);
      const who = say.words.casterYouLoseTargetLoses({ on: effect.on });
      return {
        text: withPerText(
          say,
          say.words.energy7({ who, magnitude: shown(magnitude) }),
          effect.amount,
          effect.per,
          ranks,
          {
            alone: who,
            unit: say.words.energy6(),
            onTarget: say.words.onThem(),
          },
        ),
        magnitude,
      };
    }
    case "energy-steal": {
      const magnitude = describeMagnitude(effect.amount, ranks);
      return { text: say.words.stealsUpToEnergy({ magnitude: shown(magnitude) }), magnitude };
    }
    case "life-steal": {
      const magnitude = describeMagnitude(effect.amount, ranks);
      return { text: say.words.stealsUpToHealth({ magnitude: shown(magnitude) }), magnitude };
    }
    case "steal-from-corpse": {
      const magnitude = describeMagnitude(effect.amount, ranks);
      return { text: say.words.youStealHealth({ magnitude: shown(magnitude) }), magnitude };
    }
    case "sacrifice-health":
      return {
        text: say.words.youSacrificeOfYourMaximumHealth({
          percentOfMax: String(effect.percentOfMax),
        }),
        magnitude: undefined,
      };
    case "lose-health": {
      // "For each Monk enchantment removed, you lose 31 Health" (#944), or
      // once, flat (#1550): "You lose 54 health"; the target's (#1648):
      // "Target foe loses 53 Health"; with a count (#1984), "Target foe
      // loses 2 Health for each point of Energy they have".
      if (effect.recipient === "target") {
        const magnitude = countedMagnitude(effect.amount, effect.per, ranks);
        const text = withPerText(
          say,
          say.words.targetFoeLosesHealth({ magnitude: shown(magnitude) }),
          effect.amount,
          effect.per,
          ranks,
          {
            alone: say.words.targetFoeLoses(),
            unit: say.words.health5(),
            onTarget: say.words.onThem(),
          },
        );
        return { text, magnitude };
      }
      const magnitude = describeMagnitude(effect.amount, ranks);
      const lose = say.words.youLoseHealth({ magnitude: shown(magnitude) });
      if (effect.perRemovedOfProfession === undefined) {
        return { text: lose, magnitude };
      }
      const whose = say.names.profession(effect.perRemovedOfProfession);
      return { text: say.words.forEachEnchantmentRemoved({ lose, whose }), magnitude };
    }
    // Shadow Form's end (#1951): "Lose all but 41 Health".
    case "lose-health-to": {
      const magnitude = describeMagnitude(effect.keep, ranks);
      return { text: say.words.loseAllButHealth({ magnitude: shown(magnitude) }), magnitude };
    }
    case "transfer-conditions":
      return transferText(say, effect, ranks);
    // Grenth's Fingers (#2503): "Transfer 2 conditions to nearby foes".
    case "transfer-conditions-to-area": {
      const magnitude = describeMagnitude(effect.count, ranks);
      return {
        text: say.words.transferOfYourConditionsToFoes({
          magnitude: shown(magnitude),
          foesWithin: foesWithin(say, effect.radius, "foes"),
        }),
        magnitude,
      };
    }
    // Epidemic's (#1501): "Adjacent foes get the target's conditions...";
    // Extend Conditions' "...with 81% more time (max 30 s)" (#1954).
    case "spread-conditions": {
      const extend =
        effect.extendPercent === undefined
          ? undefined
          : describeMagnitude(effect.extendPercent, ranks);
      const max = say.words.max2({ maxSeconds: effect.maxSeconds });
      return {
        text: say.words.foesGetTheTargetSConditionsWith({
          foesWithin: foesWithin(say, effect.radius, "foes"),
          value:
            extend === undefined
              ? say.words.withTheTimeEachHasLeft()
              : say.words.withMoreTime({ extend: shown(extend), max }),
        }),
        magnitude: extend,
      };
    }
    case "give-health": {
      const magnitude = describeMagnitude(effect.healPercent, ranks);
      return {
        text: say.words.loseYourHealthHealForOfIt({
          fractionOfCurrent: effect.fractionOfCurrent,
          magnitude: shown(magnitude),
        }),
        magnitude,
      };
    }
    case "balance-health":
      return {
        text: say.words.whoeverOfYouAndTargetFoeHas(),
        magnitude: undefined,
      };
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
          // Mantra of Signets' (#2438): its stats once for each of a count.
          const what = say.words.stacksOnceForEachOnThem2({
            status: statusText(say, effect.statusId, ranks),
            value:
              effect.stacksPer === undefined
                ? ""
                : say.words.stacksOnceForEachOnThem({
                    countEach: countEach(say, effect.stacksPer, say.words.onThem()),
                  }),
          });
          return {
            text: ends(effect.durationSeconds)
              ? say.words.forWord3({
                  durationSeconds: lasting(say, effect.durationSeconds, ranks),
                  what,
                })
              : say.words.capitalize(what),
            magnitude: undefined,
          };
        }
        default:
          break;
      }
      return {
        text: say.words.appliesCasterToYouForUntilIt({
          statusName: say.names.status(effect.statusId),
          on: effect.on,
          ends: ends(effect.durationSeconds),
          statusDuration: statusDuration(say, effect, ranks),
          status: statusText(say, effect.statusId, ranks),
          value:
            effect.stacksPerRemovedOfProfession === undefined
              ? ")"
              : say.words.forEachHexRemoved({
                  name: say.names.profession(effect.stacksPerRemovedOfProfession),
                }),
          value2:
            effect.stacksPer === undefined
              ? ""
              : say.words.stackingOnceForEachOnThem({
                  countEach: countEach(say, effect.stacksPer, say.words.onThem()),
                }),
        }),
        magnitude: undefined,
      };
    // Desperation Blow's (#2180).
    case "apply-random-status":
      return {
        text: say.words.appliesOneOfAtRandom({
          choices: effect.choices
            .map(({ statusId, durationSeconds }) =>
              say.words.composedStatusNameDurationSeconds({
                statusName: say.names.status(statusId),
                durationSeconds: lasting(say, durationSeconds, ranks),
              }),
            )
            .join(say.words.listComma()),
        }),
        magnitude: undefined,
      };
    case "maintain-status": {
      // GW1 words upkeep as the caster's energy degeneration (#837).
      const what = statusText(say, effect.statusId, ranks);
      return {
        text: say.words.maintainedCasterOnYouEnergyRegenerationWhile({ on: effect.on, what }),
        magnitude: undefined,
      };
    }
    case "remove-status": {
      // Mirror of Disenchantment's "lose that same enchantment" (#1954).
      if (effect.sameAsRemoved === true) {
        return {
          text: say.words.losesThatSame({ category: effect.category }),
          magnitude: undefined,
        };
      }
      // Contemplation of Purity's "lose one hex for each one lost" (#1205).
      const { perRemoved } = effect;
      if (perRemoved !== undefined) {
        const max = shown(describeMagnitude(perRemoved.max, ranks));
        const verb = say.words.casterLoseRemoves({ from: effect.from });
        return {
          text: say.words.oneForEachRemovedMax({
            verb,
            category: effect.category,
            category2: perRemoved.category,
            max,
          }),
          magnitude: undefined,
        };
      }
      // Signet of Twilight's "for each hex on target foe, ... one enchantment" (#2247).
      if (effect.perCount !== undefined) {
        const verb = say.words.casterLoseRemoves({ from: effect.from });
        return {
          text: say.words.oneForEachOnTarget({
            verb,
            category: effect.category,
            countEach: countEach(say, effect.perCount, say.words.onTarget()),
          }),
          magnitude: undefined,
        };
      }
      if (effect.statusId !== undefined) {
        // "Charge!"'s "lose the Crippled condition" (#1549).
        const verb = say.words.casterLoseRemoves({ from: effect.from });
        return { text: `${verb} ${say.names.status(effect.statusId)}`, magnitude: undefined };
      }
      if (effect.from === "caster") {
        // "Lose 1 Dervish enchantment" (#845), or all of them (#1205).
        const whose =
          effect.profession === undefined ? "" : `${say.names.profession(effect.profession)} `;
        const count = effect.count === "all" ? "all" : countAt(effect.count, ranks);
        return {
          text: say.words.lose2({
            count: String(count),
            whose,
            count2: count,
            category: effect.category,
          }),
          magnitude: undefined,
        };
      }
      if (effect.category === "stance") {
        return { text: say.words.endsTheTargetSStance(), magnitude: undefined };
      }
      const count = effect.count === "all" ? "all" : countAt(effect.count, ranks);
      // Mend Body and Soul's "for each spirit within earshot" (#1064).
      const near = effect.perSpiritNear;
      const perSpirit =
        near === undefined ? "" : say.words.forEachSpiritWithinOfIt({ near, near2: String(near) });
      // A target with fewer loses what it has (#1678): "up to 3".
      const upTo = say.words.numberUpTo({ count });
      // Shatter Delusions' "remove one Mesmer hex" (#1765).
      const whose =
        effect.profession === undefined ? "" : `${say.names.profession(effect.profession)} `;
      // Peace and Harmony's "loses 0...4 conditions and hexes" (#2291).
      const and = say.words.and4({ orCategory: effect.orCategory, count });
      return {
        text: say.words.removes({
          upTo,
          count: String(count),
          whose,
          count2: count,
          category: effect.category,
          and,
          perSpirit,
        }),
        magnitude: undefined,
      };
    }
    case "interrupt":
      return {
        text:
          effect.only === "spell"
            ? say.words.interruptsTheTargetSSpellIfThey()
            : effect.only === "spell-or-chant"
              ? say.words.interruptsTheTargetSSpellOrChant()
              : say.words.skillInterruptsTheTargetSSkillIf({ only: effect.only }),
        magnitude: undefined,
      };
    case "knockdown":
      return {
        text:
          effect.on === "caster"
            ? say.words.youAreKnockedDownFor({ durationSeconds: effect.durationSeconds })
            : say.words.knocksDownFor({ durationSeconds: effect.durationSeconds }),
        magnitude: undefined,
      };
    case "shadow-step":
      return {
        text:
          effect.to === "target"
            ? say.words.shadowStepsToTheTarget()
            : effect.to === "swap"
              ? say.words.youAndTheTargetShadowStepTo()
              : say.words.corpseTeleportsYouToThatCorpseShadow({ to: effect.to }),
        magnitude: undefined,
      };
    case "resurrect": {
      // "13% health and 3% energy per party member in earshot",
      // "your health after losing half and 17% energy" (#474), "up to your
      // current health" when it loses none (#2414).
      const energy = describeMagnitude(effect.energyPercent, ranks);
      const health =
        effect.health.kind === "percent"
          ? describeMagnitude(effect.health.percent, ranks)
          : undefined;
      const healthText =
        effect.health.kind === "percent"
          ? say.words.health6({ percent: shown(describeMagnitude(effect.health.percent, ranks)) })
          : say.words.upToYourCurrentHealthYourHealth({
              casterLosesFractionOfCurrent: effect.health.casterLosesFractionOfCurrent,
            });
      const radius = effect.perPartyMemberWithin;
      const per =
        radius === undefined
          ? ""
          : say.words.perPartyMemberWithin({ radius, radius2: String(radius) });
      const teleport = say.words.casterAndTeleportsTheTargetToYou({ at: effect.at });
      return {
        text: say.words.returnsTheTargetToLifeWithAnd({
          healthText,
          energy: shown(energy),
          per,
          teleport,
        }),
        magnitude: health ?? energy,
      };
    }
    case "resurrect-companions": {
      // "Returns every dead allied pet nearby to life with 77% health" (#1108).
      const health = describeMagnitude(effect.healthPercent, ranks);
      const where = say.words.within({ radius: effect.radius, radius2: String(effect.radius) });
      return {
        text: say.words.returnsEveryDeadAlliedPetToLife({ where, health: shown(health) }),
        magnitude: health,
      };
    }
    case "drain-own-energy":
      return { text: say.words.youLoseAllYourRemainingEnergy(), magnitude: undefined };
    case "caster-gains-status":
      // Ice Spear's "you gain +1...4 Health regeneration for 5 seconds" (#1367).
      return {
        text: say.words.youGainFor({
          statusName: say.names.status(effect.statusId),
          durationSeconds: effect.durationSeconds,
          status: statusText(say, effect.statusId, ranks),
        }),
        magnitude: undefined,
      };
    // Run as One's "you and your pet run 25% faster" (#1865).
    case "companion-gains-status": {
      const duration = describeMagnitude(effect.durationSeconds, ranks);
      return {
        text: say.words.yourPetGainsFor({
          statusName: say.names.status(effect.statusId),
          duration: shown(duration, say.words.seconds(duration.current)),
          status: statusText(say, effect.statusId, ranks),
        }),
        magnitude: duration,
      };
    }
    // Strike as One's "your animal companion instantly moves to your target" (#1966).
    case "companion-steps-to-target":
      return { text: say.words.yourPetMovesToYourTargetAnd(), magnitude: undefined };
    case "pull-to-caster":
      return { text: say.words.teleportsTargetToYou(), magnitude: undefined };
    case "destroy-target-spirit":
      return { text: say.words.destroysTargetAlliedSpirit(), magnitude: undefined };
    case "destroy-target-minion":
      return { text: say.words.destroysTargetMinion(), magnitude: undefined };
    case "drain-nearest-spirit": {
      // Spirit Transfer's (#1947): what it takes, then what each point is worth.
      const magnitude = describeMagnitude(effect.health, ranks);
      return {
        text: say.words.nearestSpiritLosesHealthTargetAllyIs({
          magnitude: shown(magnitude),
          healPerPoint: String(effect.healPerPoint),
        }),
        magnitude,
      };
    }
    case "drain-nearest-spirit-energy": {
      // Spirit Siphon's (#2504).
      const magnitude = describeMagnitude(effect.percent, ranks);
      return {
        text: say.words.nearestSpiritLosesAllEnergyYouGain({ magnitude: shown(magnitude) }),
        magnitude,
      };
    }
    case "owner-gains-damage-dealt":
      return { text: say.words.itsOwnerGainsHealthEqualToThe(), magnitude: undefined };
    case "destroy-allied-spirits":
      return {
        text: say.words.destroysEveryAlliedSpiritWithin({
          radius: effect.radius,
          radius2: String(effect.radius),
        }),
        magnitude: undefined,
      };
    case "recharge-faster":
      // "None Shall Pass!"'s "1...8 seconds faster for each foe knocked down" (#2320).
      if (!("fraction" in effect)) {
        return {
          text: withPerText(say, "", effect.seconds, effect.per, ranks, {
            alone: say.words.thisSkillRecharges(),
            unit: say.words.secondsFaster(),
            onTarget: "",
          }),
          magnitude: undefined,
        };
      }
      return {
        // Bitter Chill's "recharges instantly" (#1640).
        text:
          effect.fraction === 1
            ? say.words.thisSkillRechargesInstantly()
            : say.words.thisSkillRechargesFaster({
                fraction: String(Math.round(effect.fraction * 100)),
              }),
        magnitude: undefined,
      };
    // Persistence of Memory's (#2132): the skill the trigger answers.
    case "recharge-reset":
      return {
        text: say.words.usedSkillThatSkillRechargesInstantlyThis({ of: effect.of }),
        magnitude: undefined,
      };
    case "adrenaline-loss":
      return { text: say.words.loseAllAdrenaline(), magnitude: undefined };
    case "recharge-others":
      return {
        text:
          effect.which === "all"
            ? say.words.rechargesAllYourOtherSkills()
            : effect.which === "stance"
              ? say.words.rechargesAllYourStances()
              : typeof effect.which === "string"
                ? say.words.rechargesAllYourOtherSkills2({ which: effect.which })
                : say.words.rechargesAllYour({ rechargedKind: rechargedKind(say, effect.which) }),
        magnitude: undefined,
      };
    case "destroy-own-spirits":
      return { text: say.words.allOfYourSpiritsDie(), magnitude: undefined };
    case "summon": {
      // "Summons 2 Bone Minion (60 Health, lasts 30 seconds)" (#1052), with
      // Spawning Power's health and the base in brackets (#1098).
      const { text, magnitude } = describeCreature(say, effect.creature, effect.count, ranks);
      return {
        text: say.words.summonsPlusOnePerCorpseExploited({
          text,
          perExploitedCorpse: effect.perExploitedCorpse,
        }),
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
          ? say.words.setsATrap()
          : say.words.pulseTargetCreatesASymbolMarksThe({
              kind: effect.act.kind,
              anchor: effect.anchor,
            });
      const where = say.words.groundAnchorText[effect.anchor];
      return {
        text: say.words.forSeconds({ what, where, magnitude: shown(magnitude) }),
        magnitude,
      };
    }
    case "disable-skill": {
      const magnitude = describeMagnitude(effect.seconds, ranks);
      const time = say.words.seconds3({ magnitude: shown(magnitude) });
      // Signet of Distraction's (#2165).
      const perSignet = say.words.forEachSignetYouHaveEquipped({
        perOwnSignet: effect.perOwnSignet,
      });
      return {
        text:
          effect.which === "all"
            ? say.words.allOfTheTargetSSkillsAre({ time })
            : effect.which === "elite"
              ? say.words.theTargetSEliteSkillIsDisabled({ time })
              : effect.which === "random-spell"
                ? say.words.oneOfTheTargetSSpellsAt({ time })
                : effect.which === "attacks"
                  ? say.words.allOfTheTargetSAttackSkills({ time })
                  : effect.which === "interrupted"
                    ? say.words.theInterruptedSkillIsDisabledFor({ time, perSignet })
                    : say.words.centreInterruptedHoldingThatSkillHaveIt({
                        which: effect.which,
                        time,
                      }),
        magnitude,
      };
    }
    // Inspired Enchantment's and Arcane Thievery's (#1928).
    case "copy-removed":
      return {
        text: say.words.thisSkillBecomesTheOneYouRemoved({ seconds: String(effect.seconds) }),
        magnitude: undefined,
      };
    case "copy-disabled":
      return {
        text: say.words.thisSkillBecomesThatRandomSpellSpell({ which: effect.which }),
        magnitude: undefined,
      };
    // Arcane Mimicry's and Signet of Binding's (#1965).
    case "copy-elite": {
      // Arcane Mimicry's ally, Symbols of Inspiration's foe (#2502).
      const magnitude = describeMagnitude(effect.seconds, ranks);
      return {
        text: say.words.thisSkillBecomesItsTargetSNon({ magnitude: shown(magnitude) }),
        magnitude,
      };
    }
    case "take-control":
      // Verata's Aura's foe minions, its own while it lasts (#2092).
      return effect.bondStatusId === undefined
        ? { text: say.words.takeControlOfTargetEnemySpirit(), magnitude: undefined }
        : {
            text: say.words.becomeYourMinionsWhileYouBear({
              name: say.names.status(effect.bondStatusId),
            }),
            magnitude: undefined,
          };
    case "gaze-minion": {
      // Verata's Gaze's (#2092).
      const magnitude = describeMagnitude(effect.heal, ranks);
      return {
        text: say.words.targetMinionWithAMasterBecomesMasterless({ magnitude: shown(magnitude) }),
        magnitude,
      };
    }
    case "disable-own-skills": {
      const magnitude = describeMagnitude(effect.seconds, ranks);
      return { text: disableOwnText(say, effect, false, shown(magnitude)), magnitude };
    }
    case "chain-mark":
      return {
        text: say.words.leadCountsAsALeadAttackCounts({ role: effect.role }),
        magnitude: undefined,
      };
    case "overcast": {
      const magnitude = describeMagnitude(effect.amount, ranks);
      return { text: say.words.targetSuffersOvercast({ magnitude: shown(magnitude) }), magnitude };
    }
    case "lengthen-recharge": {
      const magnitude = describeMagnitude(effect.seconds, ranks);
      const which = say.words.thisSkillThisSkillThatSkill({ of: effect.of });
      // Withdraw Hexes' (#2189).
      const each = say.words.forEachRemoved2({ perRemoved: effect.perRemoved, value: 1 });
      return {
        text: say.words.takesSecondsLongerToRecharge({ which, magnitude: shown(magnitude), each }),
        magnitude,
      };
    }
    case "splash": {
      // "Adjacent foes take 40 damage" (#885). What the caster pays for
      // each one reached is said apart (#1986).
      // Mirror of Ice's "if you strike a foe hexed with Water Magic, Mirror
      // of Ice recharges 50% faster" (#2288).
      const [faster] = effect.effects;
      if (effect.effects.length === 1 && faster?.kind === "recharge-faster") {
        const whom =
          effect.onlyIf === undefined
            ? ""
            : say.words.that({ onlyIf: onlyIfText(say, effect.onlyIf, ranks) });
        return {
          text: say.words.ifItStrikesAFoe({ whom, text: describeEffect(say, faster, ranks).text }),
          magnitude: undefined,
        };
      }
      // A steal is the caster's, from those reached (#2313): Unholy Feast's
      // "Steals up to 54 Health from up to 3 foes in the area", Feast of
      // Corruption's "from each of target and adjacent foes that has a hex".
      const [stolen] = effect.effects;
      if (
        effect.effects.length === 1 &&
        (stolen?.kind === "life-steal" || stolen?.kind === "energy-steal")
      ) {
        const description = describeEffect(say, stolen, ranks);
        const reached = say.words.lowerFirst(upTo(say, effect, ranks, false));
        const condition = effect.onlyIf === undefined ? "" : onlyIfText(say, effect.onlyIf, ranks);
        const from = say.words.eachOfWording(reached, condition);
        return {
          text: say.words.from({ text: description.text, from }),
          magnitude: description.magnitude,
        };
      }
      const { what, paid, magnitude } = splashWhat(say, effect, ranks);
      return { text: `${upTo(say, effect, ranks)} ${what}${paid}`, magnitude };
    }
  }
}

/** What those a splash reaches take, and what the caster pays for each. */
function splashWhat(
  say: Say,
  effect: SplashEffect,
  ranks: ReadonlyMap<string, number>,
): {
  readonly what: string;
  readonly paid: string;
  readonly magnitude: MagnitudeDescription | undefined;
} {
  const paid = effect.effects.filter((each) => each.kind === "sacrifice-health");
  const inner = effect.effects
    .filter((each) => each.kind !== "sacrifice-health")
    .map((each) => ({
      each,
      description: describeEffect(say, each, ranks),
    }));
  const parts = inner.map(({ each, description }) =>
    each.kind === "damage"
      ? say.words.takeDamageForEachPointOfEnergy({
          amount: shown(describeMagnitude(each.amount, ranks)),
          type: each.type,
          perEnergyLost: each.perEnergyLost,
        })
      : each.kind === "interrupt"
        ? say.words.areInterruptedAreInterruptedIfCasting({ only: each.only })
        : each.kind === "knockdown"
          ? say.words.areKnockedDownForS({ durationSeconds: String(each.durationSeconds) })
          : each.kind === "apply-status"
            ? say.words.foesFoeCreaturesGain({
                hits: effect.hits,
                suffered: suffered(say, each, ranks),
                sufferedWhat: sufferedWhat(say, each, ranks),
              })
            : // Healing Burst's (#2311).
              each.kind === "heal" && each.divineFavorBonus === true
              ? say.words.gainHealthEqualToThisSpellS2()
              : // Release Enchantments' "for each Monk enchantment lost" (#2432).
                each.kind === "heal" && each.recipient === undefined && each.per !== undefined
                ? say.words.gain3({ text: description.text })
                : each.kind === "heal" && each.recipient === undefined
                  ? say.words.gainHealth({ amount: shown(describeMagnitude(each.amount, ranks)) })
                  : each.kind === "lose-health" && each.recipient === "target"
                    ? say.words.loseHealth({ amount: shown(describeMagnitude(each.amount, ranks)) })
                    : // Fear Me!'s "lose 5 energy" (#2320).
                      each.kind === "energy-loss" && each.on !== "caster"
                      ? say.words.loseTargetWording(description.text)
                      : each.kind === "remove-status" && each.from === undefined
                        ? lostInSplash(say, each, ranks)
                        : // Ravenous Gaze's (#2313): the caster steals, from each.
                          each.kind === "life-steal" || each.kind === "energy-steal"
                          ? say.words.youFromEach({ text: description.text })
                          : // Verata's Sacrifice's (#1986).
                            each.kind === "transfer-conditions" &&
                              each.from === "target" &&
                              resolveMagnitudeAtRanks(each.count, ranks) ===
                                Number.POSITIVE_INFINITY
                            ? say.words.transferAllTheirConditionsToYou()
                            : // Light of Dwayna's "they are returned to life" (#2446).
                              say.words.resurrect({ kind: each.kind, text: description.text }),
  );
  const last = parts.pop();
  const what = say.words.and5({
    length: parts.length,
    last,
    parts: parts.join(say.words.listComma()),
    last2: String(last),
  });
  return {
    what,
    paid: paid
      .map((each) =>
        say.words.perAlliedMinionsOwnMinionsMinionOne({
          text: describeEffect(say, each, ranks).text,
          hits: effect.hits,
        }),
      )
      .join(""),
    magnitude: inner.find(({ description }) => description.magnitude !== undefined)?.description
      .magnitude,
  };
}
/** `effect`'s number, as a card's headline puts it; `undefined` without one. */
function headlineOf(
  say: Say,
  effect: SkillEffect,
  ranks: ReadonlyMap<string, number>,
): { readonly text: string; readonly scales: boolean } | undefined {
  switch (effect.kind) {
    case "damage":
    case "heal":
    case "energy-gain": {
      // A zero base leads with its `per` amount (#2222): Leader's Zeal's
      // "+4 energy per ally", never "+0 energy".
      const magnitude = countedMagnitude(effect.amount, effect.per, ranks);
      const amount = shown(magnitude);
      const each =
        effect.per !== undefined && "flat" in effect.amount && effect.amount.flat === 0
          ? say.words.per({ perCountNoun: perCountNoun(say, effect.per.count) })
          : perPointLost(say, effect);
      const text =
        effect.kind === "damage"
          ? say.words.damage3({ amount, type: effect.type, each })
          : say.words.healHealsEnergy({ kind: effect.kind, amount, each });
      return { text, scales: magnitude.attributeId !== undefined };
    }
    case "energy-loss": {
      const magnitude = describeMagnitude(effect.amount, ranks);
      return {
        text: say.words.drainsEnergy({ magnitude: shown(magnitude) }),
        scales: magnitude.attributeId !== undefined,
      };
    }
    case "energy-steal": {
      const magnitude = describeMagnitude(effect.amount, ranks);
      return {
        text: say.words.stealsEnergy({ magnitude: shown(magnitude) }),
        scales: magnitude.attributeId !== undefined,
      };
    }
    case "life-steal": {
      const magnitude = describeMagnitude(effect.amount, ranks);
      return {
        text: say.words.stealsHealth({ magnitude: shown(magnitude) }),
        scales: magnitude.attributeId !== undefined,
      };
    }
    case "steal-from-corpse": {
      const magnitude = describeMagnitude(effect.amount, ranks);
      return {
        text: say.words.stealsHealth({ magnitude: shown(magnitude) }),
        scales: magnitude.attributeId !== undefined,
      };
    }
    case "resurrect": {
      if (effect.health.kind === "caster-current") {
        const energy = describeMagnitude(effect.energyPercent, ranks);
        return {
          text: say.words.resurrectsEnergy({ energy: shown(energy) }),
          scales: energy.attributeId !== undefined,
        };
      }
      const health = describeMagnitude(effect.health.percent, ranks);
      return {
        text: say.words.resurrectsHealth({ health: shown(health) }),
        scales: health.attributeId !== undefined,
      };
    }
    case "resurrect-companions": {
      const health = describeMagnitude(effect.healthPercent, ranks);
      return {
        text: say.words.resurrectsPetsHealth({ health: shown(health) }),
        scales: health.attributeId !== undefined,
      };
    }
    case "give-health": {
      const percent = describeMagnitude(effect.healPercent, ranks);
      return {
        text: say.words.healsOfYourHealth({
          percent: shown(percent),
          fractionOfCurrent: effect.fractionOfCurrent,
        }),
        scales: percent.attributeId !== undefined,
      };
    }
    case "balance-health":
      return { text: say.words.balancesHealthWithTargetFoe(), scales: false };
    case "if": {
      // Power Spike's card leads with its damage, though it needs a spell.
      const inner = effect.effects.flatMap((each) => headlineOf(say, each, ranks) ?? []);
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
      const inner = pulse.effects.flatMap((each) => headlineOf(say, each, ranks) ?? []);
      return inner.find((number) => number.scales) ?? inner[0];
    }
    default:
      return undefined;
  }
}

/**
 * "Only if target is knocked down" (#1041): a chain's state requirement,
 * from `conditionText`, every case of which starts "If ".
 */
function requiresText(say: Say, requires: StateCondition): string {
  return say.words.requiresWording(conditionText(say, requires));
}

/**
 * A chain attack's line (#831): "Off-hand attack. Must follow a lead
 * attack.", then its requirement (#1041): "Off-hand attack. Only if
 * target is knocked down."
 */
function chainText(say: Say, chain: ChainStep): string {
  return [
    say.words.chainRoleText[chain.role],
    ...(chain.follows === undefined ? [] : [say.words.followsText[chain.follows]]),
    ...(chain.requires === undefined ? [] : [`${requiresText(say, chain.requires)}.`]),
  ].join(say.words.listSpace());
}

/**
 * What an `if` waited for, lower case for the middle of a log line
 * (#1735), the tooltip's own words: "only if target has Burning", "unless
 * target is moving". Plain text, its numbers at the caster's `ranks`.
 */
export function conditionRequirementText(
  condition: EffectCondition,
  ranks: ReadonlyMap<string, number>,
  words: DescribeWords,
  names: DescribeNames,
): string {
  const say: Say = { words, names };
  return say.words.requirementWording(plain(conditionText(say, condition, ranks)));
}

/**
 * What a chain attack needs to hit, lower case for the middle of a line
 * (#1041): "must follow a lead attack", "only if target is knocked
 * down", both joined by "; "; `undefined` for neither, or no chain.
 */
export function chainRequirementText(
  skill: Skill,
  words: DescribeWords,
  names: DescribeNames,
): string | undefined {
  const say: Say = { words, names };
  const chain = skill.attack?.chain;
  const parts = [
    ...(chain?.follows === undefined ? [] : [say.words.followsText[chain.follows]]),
    ...(chain?.requires === undefined ? [] : [requiresText(say, chain.requires)]),
  ].map(say.words.requirementLine);
  return parts.length === 0 ? undefined : parts.join(say.words.listSemicolon());
}

/**
 * What an attack skill needs in hand, for "Needs an axe." (#417): the
 * HUD's refusal and the build editor's warning say it the same way.
 */
export function neededWeaponText(weapon: AttackWeaponClass, words: DescribeWords): string {
  const say = { words };
  return say.words.neededWeapon[weapon];
}

/**
 * A `transfer-conditions` line (#1511): "Moves up to 3 of your conditions
 * to the target", or "Moves all of target's conditions to you; you are
 * healed for 22 for each", or "Moves all of your conditions with 180% of
 * their remaining durations to the target" (#1540), "...to the target
 * and foes adjacent to it" (#2259).
 */
function transferText(
  say: Say,
  effect: TransferConditionsEffect,
  ranks: ReadonlyMap<string, number>,
): Line {
  const moving = describeMagnitude(effect.count, ranks);
  const count = say.words.allUpTo({ current: moving.current, Infinity, moving: shown(moving) });
  const copies =
    effect.copyToFoesWithin === undefined
      ? ""
      : say.words.andFoesWithinOfIt({
          copyToFoesWithin: effect.copyToFoesWithin,
          copyToFoesWithin2: String(effect.copyToFoesWithin),
        });
  const lasting =
    effect.durationMultiplier === 1
      ? ""
      : say.words.withOfTheirRemainingDurations({
          durationMultiplier: String(Math.round(effect.durationMultiplier * 100)),
        });
  // Hypochondria's gather (#2311).
  const moves =
    typeof effect.from === "object"
      ? say.words.movesConditionsFromFoesWithinOfIt({
          count,
          lasting,
          foesWithin: effect.from.foesWithin,
          foesWithin2: String(effect.from.foesWithin),
        })
      : say.words.casterMovesOfYourConditionsToThe({ from: effect.from, count, lasting, copies });
  if (effect.healPerCondition === undefined) {
    // Plague Sending's "1...3" scales (#2259).
    return { text: moves, magnitude: moving.atZero === undefined ? undefined : moving };
  }
  const magnitude = describeMagnitude(effect.healPerCondition, ranks);
  return {
    text: say.words.youAreHealedForForEach({ moves, magnitude: shown(magnitude) }),
    magnitude,
  };
}

/**
 * A `disable-own-skills` line (#1473): "All of your skills" (#1570), "All
 * of your other skills" (#2287), "All of your spells", "All of your Smiting Prayers" (#1511), or "All of your
 * non-Mesmer skills except signets", "are disabled for 10 seconds". A
 * skill of the attribute it disables spares itself: "All of your other
 * Healing Prayers" (#1748). "All of your other attack skills" (#1914). "Your
 * enchantment spells and stances" (#1930). "Your non-dagger attack skills" (#2134).
 * "All of your non-attack skills" (#2190). "All of your other non-attack
 * skills" (#2504).
 */
function disableOwnText(
  say: Say,
  effect: DisableOwnSkillsEffect,
  others: boolean,
  seconds: string,
): string {
  const time = say.words.areDisabledForSeconds({ seconds });
  if (effect.which === "all") {
    return say.words.allOfYourSkills({ time });
  }
  if (effect.which === "others") {
    return say.words.allOfYourOtherSkills({ time });
  }
  if (effect.which === "other-non-attacks") {
    return say.words.allOfYourOtherNonAttackSkills({ time });
  }
  if (effect.which === "attacks") {
    return say.words.allOfYourOtherAttackSkillsYour({ exceptWeapon: effect.exceptWeapon, time });
  }
  if (effect.which === "types") {
    // Marauder's Shot's and Tiger's Fury's "all your non-attack skills" (#2190).
    const spared = Object.keys(say.words.typeText).filter(
      (type) => !effect.types.some((disabled) => disabled === type),
    );
    if (spared.length === 1 && spared[0] === "attack") {
      return say.words.allOfYourNonAttackSkills({ time });
    }
    const types = effect.types.map((type) => say.words.s4({ type }));
    return say.words.yourAnd({ types: types.join(say.words.and()), time });
  }
  if (effect.which === "spells") {
    return say.words.allOfYourSpells({ time });
  }
  if (effect.which === "attribute") {
    const name = say.names.attribute(effect.attributeId);
    return say.words.allOfYourOther({ others, name, time });
  }
  const except = effect.exceptTypes.map((type) => say.words.s4({ type }));
  const exceptText = say.words.exceptAnd({
    length: except.length,
    except: except.join(say.words.and()),
  });
  return say.words.allOfYourNonSkills({
    name: say.names.profession(effect.profession),
    exceptText,
    time,
  });
}

/**
 * Who and how far: "Allies in earshot, 350 radius" for a shout, which
 * reaches round its caster rather than at a target (#524).
 */
function targetAndRange(
  say: Say,
  skill: Skill,
): {
  readonly target: string;
  readonly range: string | undefined;
} {
  const area = skill.area;
  if (area?.origin === "party") {
    // Heal Party (#1013): every team-mate, however far.
    return { target: say.words.yourWholeParty(), range: undefined };
  }
  if (skill.target === "self" && area?.origin === "caster") {
    const where = say.words.within({ radius: area.radius, radius2: String(area.radius) });
    return {
      target: say.words.composedAffectsWhere2({ affects: area.affects, where }),
      range: say.words.radius({ radius: String(area.radius) }),
    };
  }
  if (area?.origin === "caster") {
    // Cyclone Axe (#936): its target, and everyone round its user.
    const where = say.words.within({ radius: area.radius, radius2: String(area.radius) });
    return {
      target: say.words.andAroundYou({ target: skill.target, affects: area.affects, where }),
      range: say.words.range({ range: String(skill.range) }),
    };
  }
  if (area?.origin === "target") {
    // Fireball, Meteor (#998): its target, and those round it. maxTargets
    // counts the primary.
    const who = say.words.lowerAll(say.words.areaWho[area.affects]);
    const count =
      area.maxTargets === undefined
        ? who
        : say.words.upTo4({ maxTargets: String(area.maxTargets - 1), who });
    const where = say.words.withinOfIt({ radius: area.radius, radius2: String(area.radius) });
    return {
      target: say.words.and6({ target: skill.target, count, where }),
      range: say.words.rangeRadius({ range: String(skill.range), radius: String(area.radius) }),
    };
  }
  return {
    target: say.words.targetText[skill.target],
    range: skill.target === "self" ? undefined : say.words.range({ range: String(skill.range) }),
  };
}

/** "5 energy (10)": what it costs at these ranks, the base in brackets when they differ. */
function costText(say: Say, skill: Skill, ranks: ReadonlyMap<string, number>): string {
  if (skill.cost === undefined) {
    return say.words.free();
  }
  if (skill.cost.kind === "adrenaline") {
    return say.words.adrenaline({ amount: String(skill.cost.amount) });
  }
  const cost = energyCostOf(skill, outsideMatch(ranks));
  const base =
    cost === skill.cost.amount
      ? ""
      : say.words.composedAmount({ amount: String(skill.cost.amount) });
  return say.words.energy8({ cost: String(cost), base, overcast: overcastText(skill, say.words) });
}

/** ", 5 overcast" after an energy cost (#461), or nothing for a skill without. */
export function overcastText(skill: Skill, words: DescribeWords): string {
  const say = { words };
  return skill.overcast > 0 ? say.words.overcast({ overcast: String(skill.overcast) }) : "";
}

/** "1.1s (2s)": how long it activates at these ranks, with no status on, the base in brackets when they differ. */
function castTimeText(say: Say, skill: Skill, ranks: ReadonlyMap<string, number>): string {
  if (skill.activationSeconds === 0) {
    return say.words.instant();
  }
  const activation = say.words.seconds(effectiveActivationSeconds(skill, outsideMatch(ranks)));
  const base = say.words.seconds(skill.activationSeconds);
  return say.words.composedActivationBase({ activation, base });
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
  ranksOrNone: ReadonlyMap<string, number> | undefined,
  words: DescribeWords,
  names: DescribeNames,
): SkillDescription {
  const say: Say = { words, names };
  const ranks = ranksOrNone ?? new Map<string, number>();
  // "Lose all adrenaline" (#1097), before anything, as GW1 prints it.
  const lossLine =
    skill.losesAllAdrenaline === true
      ? [{ text: say.words.loseAllAdrenaline(), magnitude: undefined }]
      : [];
  // A pet attack's (#1046) reads as an attack skill's.
  const rule = blowRuleOf(skill);
  // A chain attack's place in its chain (#831), first, as GW1 prints it.
  const chain = rule?.chain;
  const chainLine =
    chain === undefined ? [] : [{ text: chainText(say, chain), magnitude: undefined }];
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
        ? [{ text: say.words.dealsNoDamage(), magnitude: undefined }]
        : []
      : [
          {
            text: say.words.dealsOnlyDamageDamage({
              weaponless,
              bonus: shown(bonus),
              damageType: damageTypeText(say, skill),
            }),
            magnitude: bonus,
          },
        ]),
    ...(conditionalBonus === undefined || more === undefined
      ? []
      : [
          {
            text: say.words.damage4({
              condition: conditionText(say, conditionalBonus.condition),
              more: shown(more),
            }),
            magnitude: more,
          },
        ]),
    // Enraged Lunge's "+19 damage for each of your recharging Beast
    // Mastery skills (maximum 60)" (#1957).
    ...(rule?.bonusPer === undefined
      ? []
      : [
          {
            text: say.words.damageOnThem({
              amount: shown(describeMagnitude(rule.bonusPer.amount, ranks)),
              perCount: perCountText(say, rule.bonusPer, ranks, say.words.onThem()),
            }),
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
                ? say.words.cannotBeBlocked2()
                : say.words.cannotBeBlocked3({ condition: conditionText(say, unblockable) }),
            magnitude: undefined,
          },
        ];
  // A miss chance at a low rank (#2133): Oath Shot's.
  const miss = rule?.missChanceAtOrBelowRank;
  const missLine =
    miss === undefined
      ? []
      : [
          {
            text: say.words.chanceToMissWithOrLess({
              chance: String(Math.round(miss.chance * 100)),
              name: say.names.attribute(miss.attributeId),
              rank: String(miss.rank),
            }),
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
                ? say.words.resultsInACriticalHit()
                : say.words.resultsInACriticalHit2({ condition: conditionText(say, criticalWhen) }),
            magnitude: undefined,
          },
        ];
  // A scythe's attack skill cleaves as its swing does (#977), unless it
  // has an area of its own.
  const cleaves = skill.attack?.weapon === "scythe" && skill.area === undefined;
  const cleaveLine = cleaves
    ? [
        {
          text: say.words.hitsUpToAdjacentFoesToo({
            cleaveTargets: String(WEAPONS.scythe.cleaveTargets),
          }),
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
            text: say.words.hitsEveryAdjacentFoe({ condition: conditionText(say, cleavesAllWhen) }),
            magnitude: undefined,
          },
        ];
  // Its own armor penetration (#923): Spear of Lightning's 25%.
  const armorPenetration = rule?.armorPenetration ?? 0;
  const penetrationLine =
    armorPenetration > 0
      ? [
          {
            text: say.words.armorPenetration2({
              armorPenetration: String(Math.round(armorPenetration * 100)),
            }),
            magnitude: undefined,
          },
        ]
      : [];
  // An attack skill's if-blocked effects (#534), after the ones a hit gets.
  const onBlocked = (rule?.onBlocked ?? []).flatMap((effect) =>
    describeEffects(say, effect, ranks).map(({ text, magnitude }) => ({
      text: say.words.ifBlocked({ text }),
      magnitude,
    })),
  );
  // On a critical hit, after its effects; if it fails to hit (#1486).
  const onCritical = (rule?.onCritical ?? []).flatMap((effect) =>
    describeEffects(say, effect, ranks).map(({ text, magnitude }) => ({
      text: say.words.onACriticalHit({ text }),
      magnitude,
    })),
  );
  // Drunken Blow's knockdown (#2500), on a hit and on a miss alike, is
  // said once: "You are knocked down for 2s, hit or miss".
  const onHit = new Set(skill.effects.map((effect) => JSON.stringify(effect)));
  const hitOrMiss = new Set(
    (rule?.onFailedToHit ?? [])
      .map((effect) => JSON.stringify(effect))
      .filter((effect) => onHit.has(effect)),
  );
  const onFailedToHit = (rule?.onFailedToHit ?? []).flatMap((effect) =>
    hitOrMiss.has(JSON.stringify(effect))
      ? []
      : describeEffects(say, effect, ranks).map(({ text, magnitude }) => ({
          text: say.words.ifItFailsToHit({ text }),
          magnitude,
        })),
  );
  // Twin Moon Sweep's (#2459), as it is released, hit or miss.
  const onRelease = (rule?.onRelease ?? []).flatMap((effect) =>
    describeEffects(say, effect, ranks).map(({ text, magnitude }) => ({
      text: say.words.asItIsUsed({ text }),
      magnitude,
    })),
  );
  // Barrage's and Volley's (#1629), before anything else it does.
  const preparationsLine =
    rule?.removesPreparations === true
      ? [{ text: say.words.allYourPreparationsAreRemoved(), magnitude: undefined }]
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
                ? say.words.fliesAsFast({ multiplier: String(flightSpeed.multiplier) })
                : say.words.fliesAsFast2({
                    condition: conditionText(say, flightSpeed.when),
                    multiplier: String(flightSpeed.multiplier),
                  }),
            magnitude: undefined,
          },
        ];
  // Dual Shot's arrows (#1539): "Shoot two arrows simultaneously at target
  // foe. These arrows deal 25% less damage".
  const strikes = rule?.strikes ?? 1;
  const count = typeof strikes === "number" ? strikes : strikes.count;
  // Forked Arrow's (#1914): "only one arrow" while its state holds.
  const fewer =
    typeof strikes === "number"
      ? ""
      : say.words.only({ condition: conditionText(say, strikes.oneWhile) });
  // Twin Moon Sweep's cut (#2459), only on the blows past one.
  const weaponDamage =
    (rule?.weaponDamage ?? 1) * (typeof strikes === "number" ? 1 : (strikes.eachWeaponDamage ?? 1));
  const weaker =
    weaponDamage > 0 && weaponDamage < 1
      ? say.words.eachDealingLessDamage({ value: String(Math.round((1 - weaponDamage) * 100)) })
      : "";
  // Sun and Moon Slash's, a dual attack's (#1618): "Strikes twice".
  const strikesText =
    count === 2 ? say.words.strikesTwice() : say.words.strikesTimes({ count: String(count) });
  const arrowsLine =
    count <= 1
      ? []
      : skill.attack?.weapon === "bow"
        ? [
            {
              text: say.words.shootsArrowsAtOnce({ count: String(count), weaker, fewer }),
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
            text: say.words.whileActivating({
              status: statusText(say, skill.whileActivating, ranks),
            }),
            magnitude: undefined,
          },
        ];
  // A trap (#1105), or a skill that says so (#1629): any attack that lands
  // while it is being used interrupts it.
  const easilyInterrupted = isEasilyInterrupted(skill)
    ? [{ text: say.words.easilyInterrupted(), magnitude: undefined }]
    : [];
  // Withdraw Hexes' (#2189): "50% failure chance with Divine Favor 4 or less".
  const failChance = skill.failChanceUnless;
  const failChanceLine =
    failChance === undefined
      ? []
      : [
          {
            text: say.words.failureChanceWithOrLess({
              chance: String(Math.round(failChance.chance * 100)),
              name: say.names.attribute(failChance.attributeId),
              rank: String(failChance.rank - 1),
            }),
            magnitude: undefined,
          },
        ];
  // Natural Healing's (#1916): "if you are not enchanted, this spell activates 50% faster".
  const activationWhileLine =
    skill.activationWhile === undefined
      ? []
      : [
          {
            text: say.words.activatesFasterSlower({
              condition: conditionText(say, skill.activationWhile.condition),
              value: String(Math.round(Math.abs(1 - skill.activationWhile.multiplier) * 100)),
              multiplier: skill.activationWhile.multiplier,
            }),
            magnitude: undefined,
          },
        ];
  // Healing Touch's (#1754).
  const divineFavorLine =
    skill.divineFavorDoubled === true
      ? [{ text: say.words.healthGainFromDivineFavorIsDoubled(), magnitude: undefined }]
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
                ? say.words.projectilesEachCanBeDodged({ shots: String(shots) })
                : say.words.aProjectileAtEachFoeEachCan({ spread: skill.projectile.spread }),
            magnitude: undefined,
          },
        ];
  // "This spell has half the normal range" (#1326): Caltrops, the daggers.
  const halfRange =
    skill.target !== "self" && skill.range === RANGE_SPELL / 2
      ? [{ text: say.words.halfTheNormalRange(), magnitude: undefined }]
      : [];
  // A skill that exploits a corpse (#466) says so before what it does,
  // and which: its own, or its target's (#1583).
  const corpseLine =
    skill.corpse === undefined
      ? []
      : [
          {
            text: say.words.targetExploitsTheCorpseNearestYourTarget({
              near: skill.corpse.near,
              all: skill.corpse.all,
              radius: skill.corpse.radius,
              radius2: String(skill.corpse.radius),
              pick: skill.corpse.pick,
              value:
                skill.corpse.elseSacrificePercent === undefined
                  ? ""
                  : say.words.orSacrificesHealthIfNoneIsNear({
                      elseSacrificePercent: shown(
                        describeMagnitude(skill.corpse.elseSacrificePercent, ranks),
                      ),
                    }),
            }),
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
            text: say.words.whileOnYourBarAHealthFights({
              name: skill.companion.name,
              companionHealth: shown(companionHealth),
            }),
            magnitude: companionHealth,
          },
        ];
  // A form's lockout (#1437), beside the recharge the card shows.
  const disabledLine =
    skill.disabledAfterUseSeconds === undefined
      ? []
      : [
          {
            text: say.words.disabledForAfterUse({
              disabledAfterUseSeconds: skill.disabledAfterUseSeconds,
            }),
            magnitude: undefined,
          },
        ];
  const effects = [
    ...lossLine,
    ...preparationsLine,
    ...onRelease,
    ...chainLine,
    ...bonusLine,
    ...unblockableLine,
    ...missLine,
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
              text: disableOwnText(
                say,
                effect,
                true,
                shown(describeMagnitude(effect.seconds, ranks)),
              ),
              magnitude: describeMagnitude(effect.seconds, ranks),
            },
          ]
        : // Martyr's (#1954): its targets are the party it takes from.
          effect.kind === "transfer-conditions" &&
            effect.from === "target" &&
            skill.area?.origin === "party"
          ? [
              {
                text: say.words.takeAllConditionsFromYourAlliesWith(),
                magnitude: undefined,
              },
            ]
          : // Verata's Sacrifice's (#1986): cast on yourself, no minion is left out.
            effect.kind === "splash" &&
              effect.hits === "own-minions" &&
              skill.target !== "allied-minion"
            ? describeEffects(say, effect, ranks).map((line) => ({
                ...line,
                text: say.words.yourMinionsWording(line.text),
              }))
            : // "I Meant to Do That!"'s "If you are knocked down" (#2500):
              // a skill on yourself alone has you for its target.
              skill.target === "self" && skill.area === undefined && effect.kind === "if"
              ? describeEffects(say, petReads(skill, effect), ranks).map((line) => ({
                  ...line,
                  text: say.words.yourCondition(line.text),
                }))
              : hitOrMiss.has(JSON.stringify(effect))
                ? describeEffects(say, petReads(skill, effect), ranks).map((line) => ({
                    ...line,
                    text: say.words.hitOrMiss({ text: line.text }),
                  }))
                : describeEffects(say, petReads(skill, effect), ranks),
    ),
    ...onCritical,
    ...onBlocked,
    ...onFailedToHit,
    ...whileActivating,
    ...activationWhileLine,
    ...divineFavorLine,
    ...easilyInterrupted,
    ...failChanceLine,
    ...projectile,
    ...halfRange,
    ...companionLine,
    ...disabledLine,
  ];
  const { target, range } = targetAndRange(say, skill);
  const numbers = [
    ...bonusLine.flatMap(({ text, magnitude }) =>
      magnitude === undefined ? [] : [{ text, scales: magnitude.attributeId !== undefined }],
    ),
    ...skill.effects.flatMap((effect) => headlineOf(say, effect, ranks) ?? []),
  ];
  const headline = (numbers.find((number) => number.scales) ?? numbers[0])?.text;
  return {
    id: skill.id,
    name: say.names.skill(skill.id),
    typeText: say.words.eliteFlash({ elite: skill.elite, flash: skill.flash, type: skill.type }),
    elite: skill.elite,
    weaponText: skill.attack === undefined ? undefined : say.words.weaponText[skill.attack.weapon],
    attributeId: skill.attributeId,
    attributeName:
      skill.attributeId === undefined ? undefined : say.names.attribute(skill.attributeId),
    effects: effects.map((line) => ({
      ...line,
      text: plain(line.text),
      parts: partsOf(line.text),
    })),
    cost: costText(say, skill, ranks),
    castTime: castTimeText(say, skill, ranks),
    recharge: say.words.moraleBoost({
      rechargesOnMoraleBoost: skill.rechargesOnMoraleBoost,
      rechargeSeconds: skill.rechargeSeconds,
    }),
    rangeText: range,
    targetText: target,
    scalesWithAttribute: effects.some((effect) => effect.magnitude?.attributeId !== undefined),
    headline: headline === undefined ? undefined : plain(headline),
    headlineParts: headline === undefined ? undefined : partsOf(headline),
  };
}

/**
 * Lingwah's "Ritualist hexes", Reclaim Essence's "binding rituals"
 * (#2502): a `recharge-others` by type, plural, its profession first.
 */
function rechargedKind(
  say: Say,
  which: {
    readonly type: SkillType;
    readonly profession?: ProfessionId;
  },
): string {
  const kind = say.words.spaced(which.type);
  return [
    which.profession === undefined ? undefined : say.names.profession(which.profession),
    say.words.hexHexesS2({ kind }),
  ]
    .filter((word) => word !== undefined)
    .join(say.words.listSpace());
}

/** A third-person trigger phrase said to its holder (#1841). */
export function secondPerson(phrase: string, words: DescribeWords): string {
  return words.secondPerson(phrase);
}
