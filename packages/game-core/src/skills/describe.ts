import { MAX_ATTRIBUTE_RANK } from "../attributes.js";
import { AREA_ADJACENT, AREA_EARSHOT, AREA_IN_THE_AREA, AREA_NEARBY } from "../distances.js";
import { WEAPONS } from "../equipment/weapons.js";
import { getAttribute, getProfession } from "../professions.js";

import { energyCostOf } from "./activation.js";
import { resolveMagnitudeAtRanks } from "./scaling.js";
import {
  findStatusDefinition,
  type StatusCategory,
  type StatusTrigger,
  type StatusTriggerEvent,
} from "./status.js";
import { effectiveActivationSeconds, outsideMatch } from "./tick.js";
import type {
  AreaRule,
  AttackWeaponClass,
  ChainRole,
  ChainStep,
  EffectCondition,
  HealEffect,
  Magnitude,
  Skill,
  SkillEffect,
  SkillType,
  StateCondition,
  UnconditionalEffect,
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

export interface EffectDescription {
  /** One line of plain prose, e.g. "Deals 91 damage". */
  readonly text: string;
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
}

function describeMagnitude(
  magnitude: Magnitude,
  ranks: ReadonlyMap<string, number>,
): MagnitudeDescription {
  const current = resolveMagnitudeAtRanks(magnitude, ranks);
  if ("flat" in magnitude) {
    return { current, atZero: undefined, atTwelve: undefined, attributeId: undefined };
  }
  return {
    current,
    atZero: magnitude.scaling.atZero,
    atTwelve: magnitude.scaling.atTwelve,
    attributeId: magnitude.scaling.attributeId,
  };
}

function seconds(value: number): string {
  // Whole seconds read better than "2.0s"; fractions keep one decimal.
  return Number.isInteger(value) ? `${String(value)}s` : `${value.toFixed(1)}s`;
}

function statusName(id: string): string {
  return findStatusDefinition(id)?.name ?? id;
}

const BLOCKED_ATTACKS: Record<"all" | "melee" | "projectile", string> = {
  all: "attacks",
  melee: "melee attacks",
  projectile: "projectiles",
};

/** `n` with its sign, a minus as GW1 prints it: "+3", "−66". */
function signed(n: number): string {
  return n > 0 ? `+${String(n)}` : `−${String(-n)}`;
}

/**
 * What a status actually does, so a tooltip does not just name it.
 * `ranks` are its caster's, for a trigger an attribute scales (#944):
 * Patient Spirit's heal. Empty, it reads at rank 0.
 */
export function describeStatus(id: string, ranks: ReadonlyMap<string, number> = new Map()): string {
  const definition = findStatusDefinition(id);
  if (definition === undefined) {
    return id;
  }
  const parts: string[] = [];
  // In pips, as GW1 words it: "−3 Health degeneration".
  if (definition.healthPips < 0) {
    parts.push(`−${String(-definition.healthPips)} Health degeneration`);
  }
  if (definition.healthPips > 0) {
    parts.push(`+${String(definition.healthPips)} Health regeneration`);
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
  if (definition.armorModifier !== 0) {
    const sign = definition.armorModifier > 0 ? "+" : "";
    parts.push(`${sign}${String(definition.armorModifier)} armor`);
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
  if (definition.armorReduction !== undefined) {
    const { amount, floor } = definition.armorReduction;
    parts.push(`−${String(amount)} armor (not below ${String(floor)})`);
  }
  if (definition.moveSpeedMultiplier !== 1) {
    parts.push(`moves at ${String(Math.round(definition.moveSpeedMultiplier * 100))}% speed`);
  }
  if (definition.attackMissChance !== 0) {
    parts.push(`${String(Math.round(definition.attackMissChance * 100))}% of attacks miss`);
  }
  if (definition.maxHealthLoss !== undefined) {
    const { fraction, cap } = definition.maxHealthLoss;
    parts.push(`−${String(Math.round(fraction * 100))}% maximum health (at most ${String(cap)})`);
  }
  if (definition.healingMultiplier !== 1) {
    const change = Math.round((definition.healingMultiplier - 1) * 100);
    parts.push(`${change > 0 ? "+" : "−"}${String(Math.abs(change))}% healing`);
  }
  if (definition.weaponDamageMultiplier !== 1) {
    const change = Math.round((definition.weaponDamageMultiplier - 1) * 100);
    parts.push(`${signed(change)}% weapon damage`);
  }
  if (definition.attributeDelta !== 0) {
    parts.push(`${signed(definition.attributeDelta)} to all attributes`);
  }
  if (definition.castTimeMultiplier !== 1) {
    parts.push(`spells take ${String(definition.castTimeMultiplier)}× as long to cast`);
  }
  if (definition.interruptsSpells) {
    parts.push("spells are interrupted by attacks");
  }
  if (definition.attackDurationMultiplier !== 1) {
    // GW1's wording: "50% slower" is 1.5× as long, "33% faster" is 0.67×.
    const change = Math.round(Math.abs(definition.attackDurationMultiplier - 1) * 100);
    const way = definition.attackDurationMultiplier > 1 ? "slower" : "faster";
    parts.push(`attacks ${String(change)}% ${way}`);
  }
  if (definition.preventsKnockdown) {
    parts.push("cannot be knocked down");
  }
  if (definition.endsOnKnockdownPrevented) {
    parts.push("ends if it prevents a knockdown");
  }
  if (definition.block !== undefined) {
    const what = BLOCKED_ATTACKS[definition.block.against];
    parts.push(`${String(Math.round(definition.block.chance * 100))}% chance to block ${what}`);
  }
  if (definition.endsAfterAttacks !== undefined) {
    const plural = definition.endsAfterAttacks === 1 ? "" : "s";
    parts.push(`ends after ${String(definition.endsAfterAttacks)} incoming attack${plural}`);
  }
  for (const effect of definition.onAttackHit?.effects ?? []) {
    parts.push(...describeAttackHit(effect));
  }
  if (definition.endsAfterHits !== undefined) {
    const { count, weapon } = definition.endsAfterHits;
    const plural = count === 1 ? "" : "s";
    parts.push(`ends after ${String(count)} hit${plural} with ${NEEDED_WEAPON[weapon]}`);
  }
  if (definition.nextSpells !== undefined) {
    const { count, costReduction } = definition.nextSpells;
    const spells = count === 1 ? "spell costs" : `${String(count)} spells cost`;
    parts.push(`your next ${spells} ${String(costReduction)} less energy`);
  }
  if (definition.spreads) {
    parts.push("spreads to adjacent combatants");
  }
  for (const effect of definition.nextAttackSkill ?? []) {
    parts.push(...describeNextAttackSkill(effect));
  }
  if (definition.endsWhenBearerAttacks) {
    parts.push("ends if the bearer attacks");
  }
  if (definition.endsWhenBearerAttacksInMelee) {
    parts.push("ends if the bearer makes a melee attack");
  }
  if (definition.damageTakenMultiplier !== 1) {
    parts.push(`takes ${damageTaken(definition.damageTakenMultiplier)} damage`);
  }
  if (definition.maxDamageFractionPerHit !== undefined) {
    parts.push(
      `damage from a single hit is capped at ${String(Math.round(definition.maxDamageFractionPerHit * 100))}% of max health`,
    );
  }
  if (definition.reversesNextDamage !== undefined) {
    parts.push(
      `the next damage or life steal heals for that much instead, up to ${String(definition.reversesNextDamage)}`,
    );
  }
  if (definition.extraStrikesPerHit > 0) {
    parts.push(
      `gain ${String(definition.extraStrikesPerHit)} more ${definition.extraStrikesPerHit === 1 ? "strike" : "strikes"} of adrenaline per hit`,
    );
  }
  if (definition.spellRechargeFaster !== 0) {
    const faster = String(Math.round(definition.spellRechargeFaster * 100));
    parts.push(`spells recharge ${faster}% faster`);
  }
  if (definition.incomingHexCastTimeMultiplier !== 1) {
    const times = String(definition.incomingHexCastTimeMultiplier);
    parts.push(`hexes cast on the bearer take ${times}× as long to cast`);
  }
  if (definition.endsWhenBearerHits) {
    parts.push("ends if the bearer hits with an attack");
  }
  if (definition.endsWhenBearerHitsWithAttackSkill) {
    parts.push("ends if the bearer hits with an attack skill");
  }
  if (definition.endsWhenBearerGains.length > 0) {
    const gained = definition.endsWhenBearerGains.map((category) =>
      category === "hex" ? "hexed" : "enchanted",
    );
    parts.push(`ends if the bearer becomes ${gained.join(" or ")}`);
  }
  // A trigger that reads "when it ends: removes 1 hex" is a sentence of
  // its own (#944), not one more clause after a comma.
  const sentences: string[] = [];
  for (const { text, clause } of describeTriggers(
    definition.triggers,
    ranks,
    definition.endsWhenBearerUsesSkill,
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
  return `${String(multiplier)}×`;
}

/** A preparation's rider (#525), as its tooltip says it: "your attacks …". */
function describeAttackHit(effect: SkillEffect): string[] {
  if (effect.kind === "apply-status") {
    return [
      `foes your physical attacks hit get ${statusName(effect.statusId)} ` +
        `for ${seconds(effect.durationSeconds)}`,
    ];
  }
  return describeEffects(effect, new Map()).map(({ text }) => `your physical attacks: ${text}`);
}

/** What the bearer does that a trigger answers, as its tooltip says it. */
const TRIGGER_WHEN: Record<StatusTriggerEvent, string> = {
  "bearer-casts-spell": "casts a spell",
  "bearer-attacks": "attacks",
  "bearer-uses-skill": "uses a skill",
  "bearer-hits": "hits with an attack",
  "bearer-takes-physical-damage": "takes physical damage",
  "bearer-gains-condition": "gains a new condition",
  ends: "ends",
  expires: "expires",
};

/** A trigger's line, and whether it follows a comma or stands alone. */
interface TriggerLine {
  readonly text: string;
  readonly clause: boolean;
}

/**
 * A status's triggers, those that do the same thing said once (#935):
 * Spiteful Spirit's "whenever it uses a skill or attacks". One that ends
 * when its bearer uses a skill answers only the next use (#949).
 */
function describeTriggers(
  triggers: readonly StatusTrigger[],
  ranks: ReadonlyMap<string, number>,
  once: boolean,
): TriggerLine[] {
  const groups = new Map<string, { trigger: StatusTrigger; on: StatusTriggerEvent[] }>();
  for (const trigger of triggers) {
    const key = JSON.stringify([trigger.effects, trigger.target]);
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, { trigger, on: [trigger.on] });
    } else {
      group.on.push(trigger.on);
    }
  }
  return [...groups.values()].flatMap(({ trigger, on }) =>
    describeTrigger(
      trigger,
      on.includes("ends") || on.includes("expires")
        ? `when it ${on.map((event) => TRIGGER_WHEN[event]).join(" or ")}`
        : once && on.includes("bearer-uses-skill")
          ? NEXT_SKILL
          : `whenever it ${on.map((event) => TRIGGER_WHEN[event]).join(" or ")}`,
      ranks,
    ),
  );
}

/** The one use a status that ends on it answers (#949), as its tooltip says it. */
const NEXT_SKILL = "the next time it uses a skill";

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
): TriggerLine[] {
  const amount = (magnitude: Magnitude): string =>
    String(describeMagnitude(magnitude, ranks).current);
  const clause = (text: string): TriggerLine => ({ text, clause: true });
  const sentence = (text: string): TriggerLine => ({ text, clause: false });
  return trigger.effects.flatMap((effect): TriggerLine[] => {
    if (effect.kind === "spread-gained-condition") {
      return [sentence(`${when}: foes in the area suffer it too`)];
    }
    if (effect.kind === "damage" && trigger.target === "bearer") {
      return [clause(`takes ${amount(effect.amount)} damage ${when}`)];
    }
    if (effect.kind === "heal" && trigger.target === "source") {
      return [clause(`heals its caster for ${amount(effect.amount)} ${when}`)];
    }
    if (effect.kind === "lengthen-recharge" && when === NEXT_SKILL) {
      return [
        clause(`the next skill it uses takes ${amount(effect.seconds)} seconds longer to recharge`),
      ];
    }
    if (effect.kind === "life-steal" && trigger.target === "bearer") {
      return [clause(`its caster steals ${amount(effect.amount)} Health ${when}`)];
    }
    // The caster's foes beside its bearer are the bearer's allies.
    if (effect.kind === "splash" && trigger.target === "bearer") {
      const area = AREA_TEXT.get(effect.radius);
      const allies =
        area === "adjacent"
          ? "its adjacent allies"
          : `its allies ${area ?? `within ${String(effect.radius)}`}`;
      return effect.effects.map((inner) =>
        inner.kind === "damage"
          ? clause(`${allies} take ${amount(inner.amount)} damage ${when}`)
          : sentence(`${when}: ${allies}: ${lowerFirst(describeEffect(inner, ranks).text)}`),
      );
    }
    return describeEffects(effect, ranks).map(({ text }) =>
      sentence(`${when}: ${lowerFirst(text)}`),
    );
  });
}

/** A chant's rider (#758), as its tooltip says it: "next attack skill: …". */
function describeNextAttackSkill(effect: SkillEffect): string[] {
  if (effect.kind === "apply-status") {
    return [`next attack skill: ${statusName(effect.statusId)} ${seconds(effect.durationSeconds)}`];
  }
  return describeEffects(effect, new Map()).map(({ text }) => `next attack skill: ${text}`);
}

/** "Deals 63 damage" as the second half of a line: "deals 63 damage". */
function lowerFirst(text: string): string {
  return `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

/** "a hex", "an enchantment". */
function aCategory(category: StatusCategory): string {
  return `${category === "enchantment" ? "an" : "a"} ${category.replace("-", " ")}`;
}

/** What an `if` waits for, as the line it leads says it (#521, #794). */
function conditionText(condition: EffectCondition): string {
  switch (condition.kind) {
    case "interrupted":
      return "If it interrupts";
    case "interrupted-spell":
      return "If that action was a spell";
    case "removed":
      return condition.from === "caster"
        ? `If ${aCategory(condition.category)} was removed`
        : `If it removes ${aCategory(condition.category)}`;
    case "target-health-below":
      return `If target is below ${String(Math.round(condition.fraction * 100))}% Health`;
    case "target-has":
      return `If target has ${aCategory(condition.category)}`;
    case "caster-has":
      return `If you have ${aCategory(condition.category)}`;
    case "target-casting":
      return "If target is casting a spell";
    case "target-alone":
      return condition.radius === AREA_ADJACENT
        ? "If target is not adjacent to any allies"
        : `If target has no allies within ${String(condition.radius)}`;
    case "target-not-moving":
      return "If target is not moving";
    case "target-knocked-down":
      return "If target is knocked down";
    case "target-moving":
      return "If target is moving";
    case "target-has-status":
      return `If target has ${statusName(condition.statusId)}`;
    case "target-lacks-status":
      return `If target does not have ${statusName(condition.statusId)}`;
    case "caster-more-energy":
      return "If you have more Energy than target";
    case "caster-wields":
      return `If you wield ${NEEDED_WEAPON[condition.weapon]}`;
    case "target-less-health":
      return "If target has less Health than you";
  }
}

/** An attack skill's damage type (#923), as " lightning" in "+18 lightning damage". */
function damageTypeText(skill: Skill): string {
  const type = skill.attack?.damageType;
  return type === undefined ? "" : ` ${type}`;
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
  const amount = describeMagnitude(perAlly.amount, ranks).current;
  const area = AREA_TEXT.get(perAlly.radius) ?? `within ${String(perAlly.radius)}`;
  return `, +${String(amount)} Health for each ally ${area} (max ${String(perAlly.max)})`;
}

/** Who a splash reaches, as GW1 words it (#885): "Adjacent foes". */
function foesWithin(radius: number): string {
  const area = AREA_TEXT.get(radius);
  switch (area) {
    case "adjacent":
      return "Adjacent foes";
    case "nearby":
      return "Nearby foes";
    case undefined:
      return `Foes within ${String(radius)}`;
    default:
      return `Foes ${area}`;
  }
}

/**
 * An effect's lines: one, or for an `if`, one per effect inside it, each
 * led by its condition: "If it interrupts: deals 102 damage".
 */
function describeEffects(
  effect: SkillEffect,
  ranks: ReadonlyMap<string, number>,
): EffectDescription[] {
  if (effect.kind !== "if") {
    return [describeEffect(effect, ranks)];
  }
  const condition = conditionText(effect.condition);
  return effect.effects.map((inner) => {
    const { text, magnitude } = describeEffect(inner, ranks);
    return { text: `${condition}: ${lowerFirst(text)}`, magnitude };
  });
}

/** A share of health as GW1 words it (#936): "half", or "25%". */
function share(fraction: number): string {
  return fraction === 0.5 ? "half" : `${String(Math.round(fraction * 100))}% of`;
}

/** " per foe hit", for an amount the caster gains once for each target hit (#977). */
function perFoeHit(effect: { readonly perTarget?: true }): string {
  return effect.perTarget === undefined ? "" : " per foe hit";
}

/** " per point lost", for an amount multiplied by the energy taken before it (#793). */
function perPointLost(effect: { readonly perEnergyLost?: true }): string {
  return effect.perEnergyLost === undefined ? "" : " per point lost";
}

function describeEffect(
  effect: UnconditionalEffect,
  ranks: ReadonlyMap<string, number>,
): EffectDescription {
  switch (effect.kind) {
    case "damage": {
      const magnitude = describeMagnitude(effect.amount, ranks);
      const penetration =
        effect.armorPenetration > 0
          ? ` (${String(Math.round(effect.armorPenetration * 100))}% armor penetration)`
          : "";
      const text = `Deals ${String(magnitude.current)} damage${perPointLost(effect)}${penetration}`;
      // Mystic Twister's "if you are enchanted, 50 more" (#977).
      const bonus = effect.conditionalBonus;
      return {
        text:
          bonus === undefined
            ? text
            : `${text}; ${lowerFirst(conditionText(bonus.condition))}: +${String(describeMagnitude(bonus.amount, ranks).current)}`,
        magnitude,
      };
    }
    case "heal": {
      const magnitude = describeMagnitude(effect.amount, ranks);
      const amount = String(magnitude.current);
      const text =
        effect.perStatusOnTarget.length > 0
          ? `+${amount} Health for each ${effect.perStatusOnTarget.join(" or ")} on target ally`
          : effect.perRemoved !== undefined
            ? `Heals ${amount} for each ${effect.perRemoved} removed`
            : effect.recipient === "caster"
              ? `You gain ${amount} health`
              : `Heals for ${amount}`;
      return { text: `${text}${perAllyText(effect, ranks)}`, magnitude };
    }
    case "energy-gain": {
      const magnitude = describeMagnitude(effect.amount, ranks);
      return {
        text: `Gain ${String(magnitude.current)} energy${perPointLost(effect)}${perFoeHit(effect)}`,
        magnitude,
      };
    }
    case "adrenaline-gain": {
      const strikes = effect.strikes === 1 ? "1 strike" : `${String(effect.strikes)} strikes`;
      return {
        text: `Gain ${strikes} of adrenaline${perFoeHit(effect)}`,
        magnitude: undefined,
      };
    }
    case "energy-loss": {
      const magnitude = describeMagnitude(effect.amount, ranks);
      return { text: `Target loses ${String(magnitude.current)} energy`, magnitude };
    }
    case "life-steal": {
      const magnitude = describeMagnitude(effect.amount, ranks);
      return { text: `Steals up to ${String(magnitude.current)} Health`, magnitude };
    }
    case "sacrifice-health":
      return {
        text: `You sacrifice ${String(effect.percentOfMax)}% of your maximum health`,
        magnitude: undefined,
      };
    case "lose-health": {
      // "For each Monk enchantment removed, you lose 31 Health" (#944).
      const magnitude = describeMagnitude(effect.amount, ranks);
      const whose = getProfession(effect.perRemovedOfProfession).name;
      return {
        text: `You lose ${String(magnitude.current)} health for each ${whose} enchantment removed`,
        magnitude,
      };
    }
    case "transfer-conditions":
      return {
        text: `Moves up to ${String(effect.count)} of your conditions to the target`,
        magnitude: undefined,
      };
    case "give-health": {
      const magnitude = describeMagnitude(effect.healPercent, ranks);
      return {
        text: `Lose ${share(effect.fractionOfCurrent)} your health; heal for ${String(magnitude.current)}% of it`,
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
        case "glyph":
          return {
            text:
              `For ${seconds(effect.durationSeconds)}, ` + describeStatus(effect.statusId, ranks),
            magnitude: undefined,
          };
        default:
          break;
      }
      return {
        text:
          `Applies ${statusName(effect.statusId)} for ${seconds(effect.durationSeconds)} ` +
          `(${describeStatus(effect.statusId, ranks)})`,
        magnitude: undefined,
      };
    case "maintain-status": {
      // GW1 words upkeep as the caster's energy degeneration (#837).
      const what = describeStatus(effect.statusId, ranks);
      return {
        text:
          "Maintained: −1 Energy regeneration while it lasts. " +
          `${what.charAt(0).toUpperCase()}${what.slice(1)}.`,
        magnitude: undefined,
      };
    }
    case "remove-status": {
      if (effect.from === "caster") {
        // "Lose 1 Dervish enchantment" (#845).
        const whose =
          effect.profession === undefined ? "" : `${getProfession(effect.profession).name} `;
        const plural = effect.count === 1 ? "" : "s";
        return {
          text: `Lose ${String(effect.count)} ${whose}${effect.category}${plural}`,
          magnitude: undefined,
        };
      }
      if (effect.category === "stance") {
        return { text: "Ends the target's stance", magnitude: undefined };
      }
      const plural = effect.count === 1 ? "" : "s";
      // Restore Condition's "remove all conditions" (#987).
      const count = Number.isFinite(effect.count) ? String(effect.count) : "all";
      return {
        text: `Removes ${count} ${effect.category}${plural}`,
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
              : "Interrupts the target's current cast, if they are casting",
        magnitude: undefined,
      };
    case "knockdown":
      return {
        text: `Knocks down for ${seconds(effect.durationSeconds)}`,
        magnitude: undefined,
      };
    case "resurrect": {
      const health = describeMagnitude(effect.healthPercent, ranks);
      const energy = describeMagnitude(effect.energyPercent, ranks);
      return {
        text: `Returns the target to life with ${String(health.current)}% health and ${String(energy.current)}% energy`,
        magnitude: health,
      };
    }
    case "recharge-faster":
      return {
        text: `This skill recharges ${String(Math.round(effect.fraction * 100))}% faster`,
        magnitude: undefined,
      };
    case "recharge-others":
      return { text: "Recharges all your other attack skills", magnitude: undefined };
    case "disable-skill": {
      const magnitude = describeMagnitude(effect.seconds, ranks);
      const time = `${String(magnitude.current)} seconds`;
      return {
        text:
          effect.which === "interrupted"
            ? `The interrupted skill is disabled for ${time}`
            : `That skill and all skills of the same attribute are disabled for ${time}`,
        magnitude,
      };
    }
    case "lengthen-recharge": {
      const magnitude = describeMagnitude(effect.seconds, ranks);
      return {
        text: `That skill takes ${String(magnitude.current)} seconds longer to recharge`,
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
          ? `take ${String(describeMagnitude(each.amount, ranks).current)} damage` +
            (each.perEnergyLost === undefined ? "" : " for each point of energy lost")
          : each.kind === "interrupt"
            ? "are interrupted if casting"
            : lowerFirst(description.text),
      );
      const last = parts.pop();
      const what = parts.length === 0 ? (last ?? "") : `${parts.join(", ")} and ${String(last)}`;
      return {
        text: `${foesWithin(effect.radius)} ${what}`,
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
      const amount = String(magnitude.current);
      const text =
        effect.kind === "damage"
          ? `${amount} damage${perPointLost(effect)}`
          : effect.kind === "heal"
            ? `heals ${amount}`
            : `+${amount} energy${perPointLost(effect)}`;
      return { text, scales: magnitude.attributeId !== undefined };
    }
    case "energy-loss": {
      const magnitude = describeMagnitude(effect.amount, ranks);
      return {
        text: `drains ${String(magnitude.current)} energy`,
        scales: magnitude.attributeId !== undefined,
      };
    }
    case "life-steal": {
      const magnitude = describeMagnitude(effect.amount, ranks);
      return {
        text: `steals ${String(magnitude.current)} health`,
        scales: magnitude.attributeId !== undefined,
      };
    }
    case "resurrect": {
      const health = describeMagnitude(effect.healthPercent, ranks);
      return {
        text: `resurrects, ${String(health.current)}% health`,
        scales: health.attributeId !== undefined,
      };
    }
    case "give-health": {
      const percent = describeMagnitude(effect.healPercent, ranks);
      return {
        text: `heals ${String(percent.current)}% of ${share(effect.fractionOfCurrent)} your health`,
        scales: percent.attributeId !== undefined,
      };
    }
    case "if": {
      // Power Spike's card leads with its damage, though it needs a spell.
      const inner = effect.effects.flatMap((each) => headlineOf(each, ranks) ?? []);
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
  "weapon-spell": "Weapon Spell.",
  skill: "Skill.",
};

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
};

const AREA_WHO: Record<AreaRule["affects"], string> = {
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
  // A chain attack's place in its chain (#831), first, as GW1 prints it.
  const chain = skill.attack?.chain;
  const chainLine = chain === undefined ? [] : [{ text: chainText(chain), magnitude: undefined }];
  // An attack skill's "+16 damage" (#417): its bonus over the weapon's
  // blow, first, as GW1 writes it. Broad Head Arrow has none.
  const bonusDamage = skill.attack?.bonusDamage;
  const bonus = bonusDamage === undefined ? undefined : describeMagnitude(bonusDamage, ranks);
  // Then its bonus while a state holds (#794): Mystic Sweep's "If you
  // have an enchantment: +10 damage".
  const conditionalBonus = skill.attack?.conditionalBonus;
  const more =
    conditionalBonus === undefined ? undefined : describeMagnitude(conditionalBonus.amount, ranks);
  const bonusLine = [
    ...(bonus === undefined
      ? []
      : [{ text: `+${String(bonus.current)}${damageTypeText(skill)} damage`, magnitude: bonus }]),
    ...(conditionalBonus === undefined || more === undefined
      ? []
      : [
          {
            text: `${conditionText(conditionalBonus.condition)}: +${String(more.current)} damage`,
            magnitude: more,
          },
        ]),
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
  // Its own armor penetration (#923): Spear of Lightning's 25%.
  const armorPenetration = skill.attack?.armorPenetration ?? 0;
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
  const onBlocked = (skill.attack?.onBlocked ?? []).flatMap((effect) =>
    describeEffects(effect, ranks).map(({ text, magnitude }) => ({
      text: `If blocked: ${lowerFirst(text)}`,
      magnitude,
    })),
  );
  // A status borne while activating (#524): Healing Signet's armor loss.
  const whileActivating =
    skill.whileActivating === undefined
      ? []
      : [
          {
            text: `While activating: ${describeStatus(skill.whileActivating, ranks)}`,
            magnitude: undefined,
          },
        ];
  // A spell that flies (#535) lands only if it reaches its target.
  const projectile =
    skill.projectile === undefined
      ? []
      : [{ text: "Projectile: can be dodged", magnitude: undefined }];
  const effects = [
    ...chainLine,
    ...bonusLine,
    ...cleaveLine,
    ...penetrationLine,
    ...skill.effects.flatMap((effect) => describeEffects(effect, ranks)),
    ...onBlocked,
    ...whileActivating,
    ...projectile,
  ];
  const { target, range } = targetAndRange(skill);
  const numbers = [
    ...bonusLine.map(({ text, magnitude }) => ({
      text,
      scales: magnitude.attributeId !== undefined,
    })),
    ...skill.effects.flatMap((effect) => headlineOf(effect, ranks) ?? []),
  ];
  const headline = (numbers.find((number) => number.scales) ?? numbers[0])?.text;
  return {
    id: skill.id,
    name: skill.name,
    typeText: skill.elite ? `Elite ${TYPE_TEXT[skill.type]}` : TYPE_TEXT[skill.type],
    elite: skill.elite,
    weaponText: skill.attack === undefined ? undefined : WEAPON_TEXT[skill.attack.weapon],
    attributeId: skill.attributeId,
    attributeName:
      skill.attributeId === undefined
        ? undefined
        : (getAttribute(skill.attributeId)?.name ?? skill.attributeId),
    effects,
    cost: costText(skill, ranks),
    castTime: castTimeText(skill, ranks),
    recharge: seconds(skill.rechargeSeconds),
    rangeText: range,
    targetText: target,
    scalesWithAttribute: effects.some((effect) => effect.magnitude?.attributeId !== undefined),
    headline,
  };
}

/**
 * "7…91" — the value at rank 0 and at the maximum rank.
 *
 * The corpus writes scaling as "7...91...112" because its rank scale ran
 * past 12 with bonuses; ours caps at `MAX_ATTRIBUTE_RANK`, so a third
 * number would just repeat the second. Showing a redundant figure would
 * imply headroom that does not exist.
 */
export function formatScalingRange(magnitude: MagnitudeDescription): string | undefined {
  if (magnitude.atZero === undefined || magnitude.atTwelve === undefined) {
    return undefined;
  }
  return `${String(magnitude.atZero)}…${String(magnitude.atTwelve)} at ${String(MAX_ATTRIBUTE_RANK)}`;
}
