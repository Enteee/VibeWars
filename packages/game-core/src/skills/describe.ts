import { MAX_ATTRIBUTE_RANK } from "../attributes.js";
import { AREA_ADJACENT, AREA_EARSHOT, AREA_IN_THE_AREA, AREA_NEARBY } from "../distances.js";
import { WEAPONS } from "../equipment/weapons.js";
import {
  SPAWNING_POWER_ATTRIBUTE,
  spawningPowerHealth,
  spawningPowerMultiplier,
} from "../primary-attributes.js";
import { getAttribute, getProfession } from "../professions.js";

import { energyCostOf } from "./activation.js";
import { resolveMagnitudeAtRanks } from "./scaling.js";
import {
  findStatusDefinition,
  type StatusCategory,
  type StatusTrigger,
  type StatusTriggerEvent,
  type TriggerEffect,
} from "./status.js";
import { effectiveActivationSeconds, outsideMatch, rankOf } from "./tick.js";
import { blowRuleOf, isEasilyInterrupted } from "./types.js";
import type {
  ApplyStatusEffect,
  RadiusArea,
  AttackWeaponClass,
  Aura,
  ChainRole,
  ChainStep,
  CreateGroundEffect,
  EffectCondition,
  EnergyGainEffect,
  HealEffect,
  Magnitude,
  Skill,
  SkillEffect,
  SkillType,
  StateCondition,
  UnconditionalEffect,
  SplashEffect,
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
  if (definition.physicalDamageTakenBonus !== 0) {
    parts.push(`take ${signed(definition.physicalDamageTakenBonus)} from physical damage`);
  }
  if (definition.damageFromSpiritAttacks !== 0) {
    parts.push(`take ${signed(definition.damageFromSpiritAttacks)} from spirits' attacks`);
  }
  if (definition.attackDamageType !== undefined) {
    parts.push(`attacks deal ${definition.attackDamageType} damage`);
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
  if (definition.preventsSpells) {
    parts.push("cannot cast spells");
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
  if (definition.block !== undefined) {
    const what = BLOCKED_ATTACKS[definition.block.against];
    const below =
      definition.blockBelowHealth === undefined
        ? ""
        : ` while below ${String(Math.round(definition.blockBelowHealth * 100))}% Health`;
    parts.push(
      `${String(Math.round(definition.block.chance * 100))}% chance to block ${what}${below}`,
    );
  }
  if (definition.criticalChanceBonus !== 0) {
    parts.push(`${signed(Math.round(definition.criticalChanceBonus * 100))}% critical chance`);
  }
  if (definition.energyPerCritical !== 0) {
    parts.push(`gain ${String(definition.energyPerCritical)} Energy per critical hit`);
  }
  if (definition.refreshesOnCritical) {
    parts.push("refreshes every time you land a critical hit");
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
    const how = weapon === undefined ? "" : ` with ${NEEDED_WEAPON[weapon]}`;
    parts.push(`ends after ${String(count)} hit${plural}${how}`);
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
  if (definition.damageReduction > 0) {
    parts.push(`−${String(definition.damageReduction)} damage taken`);
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
  if (definition.knockdownMinSeconds !== undefined) {
    parts.push(`knockdowns last at least ${String(definition.knockdownMinSeconds)}s`);
  }
  if (definition.sourceLosesHealth !== undefined) {
    parts.push(`its spirit loses ${String(definition.sourceLosesHealth)} health each time`);
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
    definition.endsWhenTriggered,
    definition.category === "hex" || definition.category === "condition",
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
  "bearer-fails-to-hit": "fails to hit",
  "bearer-takes-physical-damage": "takes physical damage",
  "bearer-takes-damage-from-foe": "takes damage or life steal from a foe",
  "bearer-creates-creature": "creates a creature",
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
 * when its bearer uses a skill answers only the next use (#949), and one
 * that ends when triggered only the next time (#1022).
 */
function describeTriggers(
  triggers: readonly StatusTrigger[],
  ranks: ReadonlyMap<string, number>,
  once: boolean,
  nextOnly: boolean,
  bearerIsFoe: boolean,
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
      on.includes("bearer-creates-creature")
        ? CREATES
        : on.includes("ends") || on.includes("expires")
          ? `when it ${on.map((event) => TRIGGER_WHEN[event]).join(" or ")}`
          : once && on.includes("bearer-uses-skill")
            ? NEXT_SKILL
            : nextOnly
              ? `the next time it ${on.map((event) => TRIGGER_WHEN[event]).join(" or ")}`
              : `whenever it ${on.map((event) => TRIGGER_WHEN[event]).join(" or ")}`,
      ranks,
      bearerIsFoe,
    ),
  );
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
  const amount = (magnitude: Magnitude): string =>
    String(describeMagnitude(magnitude, ranks).current);
  const answer = (effect: TriggerEffect): string => {
    switch (effect.kind) {
      case "heal":
        return `${amount(effect.amount)} Health`;
      case "energy-gain":
        return `${amount(effect.amount)} Energy`;
      case "damage":
        return `take ${amount(effect.amount)} ${effect.type} damage`;
      case "remove-status":
        return `lose ${String(effect.count)} ${effect.category}${effect.count === 1 ? "" : "s"}`;
      case "splash": {
        const side = effect.hits === "allies" ? "allies" : "foes";
        const who =
          effect.maxTargets === undefined
            ? `all ${side}`
            : `up to ${String(effect.maxTargets)} ${side}`;
        const where =
          AREA_AROUND_CREATED.get(effect.radius) ??
          `within ${String(effect.radius)} of that creature`;
        const what = effect.effects.map((inner) =>
          inner.kind === "heal" ? `gain ${answer(inner)}` : answer(inner),
        );
        return `${who} ${where} ${what.join(" and ")}`;
      }
      // Neither answers a creation.
      case "spread-gained-condition":
      case "echo":
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
  const amount = (magnitude: Magnitude): string =>
    String(describeMagnitude(magnitude, ranks).current);
  const clause = (text: string): TriggerLine => ({ text, clause: true });
  const sentence = (text: string): TriggerLine => ({ text, clause: false });
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
        const plural = effect.count === 1 ? "" : "s";
        return [`loses ${String(effect.count)} ${effect.category}${plural}`];
      }
      return effect.kind === "spread-gained-condition" || effect.kind === "echo"
        ? []
        : describeEffects(effect, ranks).map(({ text }) => lowerFirst(text));
    });
    return [sentence(`${when}: ${answers.join(", ")}`)];
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
    // The caster's foes beside a hexed or conditioned bearer are the
    // bearer's allies; beside one wearing its own enchantment, its foes (#1021).
    if (effect.kind === "splash" && trigger.target === "bearer") {
      const area = AREA_TEXT.get(effect.radius);
      const allies = !bearerIsFoe
        ? lowerFirst(foesWithin(effect.radius, effect.hits))
        : area === "adjacent"
          ? "its adjacent allies"
          : `its allies ${area ?? `within ${String(effect.radius)}`}`;
      return effect.effects.map((inner) =>
        inner.kind === "damage"
          ? clause(`${allies} take ${amount(inner.amount)} damage ${when}`)
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

/**
 * A status a splash puts on those it reaches, as the second half of a
 * line (#1021): "nearby foes suffer Bleeding for 13s (…)", not "applies".
 */
function suffered(effect: ApplyStatusEffect, ranks: ReadonlyMap<string, number>): string {
  return (
    `suffer ${statusName(effect.statusId)} for ${seconds(effect.durationSeconds)} ` +
    `(${describeStatus(effect.statusId, ranks)})`
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

/** What an `if` waits for, as the line it leads says it (#521, #794). */
function conditionText(condition: EffectCondition): string {
  switch (condition.kind) {
    case "interrupted":
      return "If it interrupts";
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
    case "target-has":
      return `If target has ${aCategory(condition.category)}`;
    case "target-has-any":
      return `If target has ${condition.categories.map(aCategory).join(" or ")}`;
    case "caster-has":
      return condition.profession === undefined
        ? `If you have ${aCategory(condition.category)}`
        : `If you have a ${getProfession(condition.profession).name} ${condition.category}`;
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
    case "target-more-health":
      return "If target has more Health than you";
    case "target-attacking":
      return "If target is attacking";
    case "caster-no-spirit-within":
      return `If no spirit is ${AREA_TEXT.get(condition.radius) ?? `within ${String(condition.radius)}`} of you`;
    case "caster-spirit-within":
      return `If a spirit is ${AREA_TEXT.get(condition.radius) ?? `within ${String(condition.radius)}`} of you`;
    case "caster-spirit-or-corpse-within":
      return `If a spirit or a corpse is ${AREA_TEXT.get(condition.radius) ?? `within ${String(condition.radius)}`} of you`;
  }
}

/** An attack skill's damage type (#923), as " lightning" in "+18 lightning damage". */
function damageTypeText(skill: Skill): string {
  const type = blowRuleOf(skill)?.damageType;
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
function foesWithin(radius: number, hits: SplashEffect["hits"]): string {
  const area = AREA_TEXT.get(radius);
  // Consume Soul's splash reaches only summoned creatures (#1309);
  // Spirit's Gift's, allies (#1316).
  const who = hits === "foes" ? "foes" : hits === "allies" ? "allies" : "foe creatures";
  const Who = hits === "foes" ? "Foes" : hits === "allies" ? "Allies" : "Foe creatures";
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
 * An effect's lines: one, or for an `if`, one per effect inside it, each
 * led by its condition: "If it interrupts: deals 102 damage".
 */
function describeEffects(
  effect: SkillEffect,
  ranks: ReadonlyMap<string, number>,
): EffectDescription[] {
  if (effect.kind === "summon" && effect.creature.aura !== undefined) {
    // What the spirit projects (#1064): "Non-spirit allies in its range:
    // +3 Health regeneration".
    return [describeEffect(effect, ranks), describeAura(effect.creature.aura, "in its range")];
  }
  if (effect.kind === "create-ground-effect") {
    const { act } = effect;
    if (act.kind === "aura") {
      // What the ward projects (#1087): "Non-spirit allies in the area: 50%
      // chance to block melee attacks".
      return [describeEffect(effect, ranks), describeAura(act.aura, "in the area")];
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

/** Who an aura reaches and what they wear: "Non-spirit allies in its range: …". */
function describeAura(aura: Aura, where: string): EffectDescription {
  const who = AURA_WHO[aura.affects];
  return { text: `${who} ${where}: ${describeStatus(aura.statusId)}`, magnitude: undefined };
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
  const max = describeMagnitude(per.max, ranks).current;
  return ` for every summoned creature you control ${where} (maximum ${String(max)} Energy)`;
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
            : effect.perDestroyedSpirit === true
              ? `Heals ${amount} for each spirit destroyed`
              : effect.recipient === "caster"
                ? `You gain ${amount} health`
                : `Heals for ${amount}`;
      return { text: `${text}${perAllyText(effect, ranks)}`, magnitude };
    }
    case "energy-gain": {
      const magnitude = describeMagnitude(effect.amount, ranks);
      return {
        text: `Gain ${String(magnitude.current)} energy${perPointLost(effect)}${perFoeHit(effect)}${perOwnCreatureText(effect, ranks)}`,
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
    case "steal-from-corpse": {
      const magnitude = describeMagnitude(effect.amount, ranks);
      return { text: `You steal ${String(magnitude.current)} Health`, magnitude };
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
          `Applies ${statusName(effect.statusId)} for ${statusDuration(effect, ranks)} ` +
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
      // Contemplation of Purity's "lose one hex for each one lost" (#1205).
      const { perRemoved } = effect;
      if (perRemoved !== undefined) {
        const max = describeMagnitude(perRemoved.max, ranks).current;
        const verb = effect.from === "caster" ? "Lose" : "Removes";
        return {
          text: `${verb} one ${effect.category} for each ${perRemoved.category} removed (max ${String(max)})`,
          magnitude: undefined,
        };
      }
      if (effect.from === "caster") {
        // "Lose 1 Dervish enchantment" (#845), or all of them (#1205).
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
      // Mend Body and Soul's "for each spirit within earshot" (#1064).
      const near = effect.perSpiritNear;
      const perSpirit =
        near === undefined
          ? ""
          : ` for each spirit ${AREA_AROUND_TARGET.get(near) ?? `within ${String(near)} of it`}`;
      return {
        text: `Removes ${String(effect.count)} ${effect.category}${plural}${perSpirit}`,
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
    case "shadow-step":
      return { text: "Shadow steps to the target", magnitude: undefined };
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
          ? `${String(health?.current)}% health`
          : `your health after losing ${share(effect.health.casterLosesFractionOfCurrent)}`;
      const radius = effect.perPartyMemberWithin;
      const per =
        radius === undefined
          ? ""
          : ` per party member ${AREA_TEXT.get(radius) ?? `within ${String(radius)}`}`;
      const teleport = effect.at === "caster" ? ", and teleports the target to you" : "";
      return {
        text: `Returns the target to life with ${healthText} and ${String(energy.current)}% energy${per}${teleport}`,
        magnitude: health ?? energy,
      };
    }
    case "resurrect-companions": {
      // "Returns every dead allied pet nearby to life with 77% health" (#1108).
      const health = describeMagnitude(effect.healthPercent, ranks);
      const where = AREA_TEXT.get(effect.radius) ?? `within ${String(effect.radius)}`;
      return {
        text: `Returns every dead allied pet ${where} to life with ${String(health.current)}% health`,
        magnitude: health,
      };
    }
    case "drain-own-energy":
      return { text: "You lose all your remaining energy", magnitude: undefined };
    case "destroy-target-spirit":
      return { text: "Destroys target allied spirit", magnitude: undefined };
    case "destroy-allied-spirits":
      return {
        text: `Destroys every allied spirit ${AREA_TEXT.get(effect.radius) ?? `within ${String(effect.radius)}`}`,
        magnitude: undefined,
      };
    case "recharge-faster":
      return {
        text: `This skill recharges ${String(Math.round(effect.fraction * 100))}% faster`,
        magnitude: undefined,
      };
    case "recharge-others":
      return { text: "Recharges all your other attack skills", magnitude: undefined };
    case "summon": {
      // "Summons 2 Bone Minion (60 Health, lasts 30 seconds)" (#1052), with
      // Spawning Power's health and the base in brackets (#1098).
      const health = describeMagnitude(effect.creature.maxHealth, ranks);
      const spawned = spawningPowerHealth(spawningPowerOf(ranks), health.current);
      const healthText =
        spawned === health.current
          ? `${String(health.current)} Health`
          : `${String(spawned)} Health (${String(health.current)})`;
      const lasts =
        effect.creature.durationSeconds === undefined
          ? ""
          : `, lasts ${String(describeMagnitude(effect.creature.durationSeconds, ranks).current)} seconds`;
      return {
        text: `Summons ${String(effect.count)} ${effect.creature.name} (${healthText}${lasts})`,
        magnitude: health,
      };
    }
    case "create-ground-effect": {
      // "Creates a ward at your location for 17 seconds" (#1087), "Sets a
      // trap at your location for 90 seconds" (#1105), a well "at its
      // location", the corpse's (#1104), or a symbol at your target's
      // (#1113).
      const magnitude = describeMagnitude(effect.durationSeconds, ranks);
      const what =
        effect.act.kind === "trap"
          ? "Sets a trap"
          : effect.act.kind === "pulse"
            ? "Creates a symbol"
            : effect.anchor === "corpse"
              ? "Creates a well"
              : "Creates a ward";
      const where = GROUND_ANCHOR_TEXT[effect.anchor];
      return {
        text: `${what} ${where} for ${String(magnitude.current)} seconds`,
        magnitude,
      };
    }
    case "disable-skill": {
      const magnitude = describeMagnitude(effect.seconds, ranks);
      const time = `${String(magnitude.current)} seconds`;
      return {
        text:
          effect.which === "all"
            ? `All of the target's skills are disabled for ${time}`
            : effect.which === "interrupted"
              ? `The interrupted skill is disabled for ${time}`
              : `That skill and all skills of the same attribute are disabled for ${time}`,
        magnitude,
      };
    }
    case "disable-own-skills":
      return {
        text: `All of your spells are disabled for ${String(effect.seconds)} seconds`,
        magnitude: undefined,
      };
    case "chain-mark":
      return { text: "Counts as a lead attack", magnitude: undefined };
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
            : each.kind === "apply-status"
              ? suffered(each, ranks)
              : lowerFirst(description.text),
      );
      const last = parts.pop();
      const what = parts.length === 0 ? (last ?? "") : `${parts.join(", ")} and ${String(last)}`;
      return {
        text: `${foesWithin(effect.radius, effect.hits)} ${what}`,
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
    case "steal-from-corpse": {
      const magnitude = describeMagnitude(effect.amount, ranks);
      return {
        text: `steals ${String(magnitude.current)} health`,
        scales: magnitude.attributeId !== undefined,
      };
    }
    case "resurrect": {
      if (effect.health.kind === "caster-current") {
        const energy = describeMagnitude(effect.energyPercent, ranks);
        return {
          text: `resurrects, ${String(energy.current)}% energy`,
          scales: energy.attributeId !== undefined,
        };
      }
      const health = describeMagnitude(effect.health.percent, ranks);
      return {
        text: `resurrects, ${String(health.current)}% health`,
        scales: health.attributeId !== undefined,
      };
    }
    case "resurrect-companions": {
      const health = describeMagnitude(effect.healthPercent, ranks);
      return {
        text: `resurrects pets, ${String(health.current)}% health`,
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
  "nature-ritual": "Nature Ritual.",
  "binding-ritual": "Binding Ritual.",
  ward: "Ward Spell.",
  well: "Well Spell.",
  trap: "Trap.",
  "pet-attack": "Pet Attack.",
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
  "allied-spirit": "An allied spirit",
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
              ? `Deals only ${String(bonus.current)}${damageTypeText(skill)} damage`
              : `+${String(bonus.current)}${damageTypeText(skill)} damage`,
            magnitude: bonus,
          },
        ]),
    ...(conditionalBonus === undefined || more === undefined
      ? []
      : [
          {
            text: `${conditionText(conditionalBonus.condition)}: +${String(more.current)} damage`,
            magnitude: more,
          },
        ]),
  ];
  // An attack that rolls no block (#1038): Wild Throw, Crippling Shot.
  const unblockableLine =
    rule?.unblockable === true ? [{ text: "Cannot be blocked", magnitude: undefined }] : [];
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
  // A trap (#1105): any attack that lands while it is being set interrupts it.
  const easilyInterrupted = isEasilyInterrupted(skill.type)
    ? [{ text: "Easily interrupted", magnitude: undefined }]
    : [];
  // A spell that flies (#535) lands only if it reaches its target.
  const projectile =
    skill.projectile === undefined
      ? []
      : [{ text: "Projectile: can be dodged", magnitude: undefined }];
  // A skill that exploits a corpse (#466) says so before what it does.
  const corpseLine =
    skill.corpse === undefined
      ? []
      : [{ text: "Exploits the nearest corpse", magnitude: undefined }];
  // A pet that comes with the skill on the bar (#1046): Charm Animal's.
  const companionHealth =
    skill.companion === undefined ? undefined : describeMagnitude(skill.companion.maxHealth, ranks);
  const companionLine =
    skill.companion === undefined || companionHealth === undefined
      ? []
      : [
          {
            text: `While on your bar, a ${skill.companion.name} (${String(companionHealth.current)} Health) fights beside you`,
            magnitude: companionHealth,
          },
        ];
  const effects = [
    ...lossLine,
    ...chainLine,
    ...bonusLine,
    ...unblockableLine,
    ...criticalLine,
    ...cleaveLine,
    ...cleaveAllLine,
    ...penetrationLine,
    ...corpseLine,
    ...skill.effects.flatMap((effect) => describeEffects(effect, ranks)),
    ...onBlocked,
    ...whileActivating,
    ...easilyInterrupted,
    ...projectile,
    ...companionLine,
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
    recharge:
      skill.rechargesOnMoraleBoost === true ? "Morale boost" : seconds(skill.rechargeSeconds),
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
