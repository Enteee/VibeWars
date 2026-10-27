import { MAX_ATTRIBUTE_RANK } from "../attributes.js";
import { AREA_ADJACENT, AREA_EARSHOT, AREA_IN_THE_AREA, AREA_NEARBY } from "../distances.js";
import { getAttribute } from "../professions.js";

import { energyCostOf } from "./activation.js";
import { resolveMagnitudeAtRanks } from "./scaling.js";
import { findStatusDefinition } from "./status.js";
import { effectiveActivationSeconds, outsideMatch } from "./tick.js";
import type {
  AreaRule,
  EffectCondition,
  Magnitude,
  Skill,
  SkillEffect,
  SkillType,
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

/** What a status actually does, so a tooltip does not just name it. */
export function describeStatus(id: string): string {
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
  if (definition.maxHealthMultiplier !== 1) {
    parts.push(
      `maximum health reduced to ${String(Math.round(definition.maxHealthMultiplier * 100))}%`,
    );
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
    parts.push(`attacks take ${String(definition.attackDurationMultiplier)}× as long`);
  }
  if (definition.block !== undefined) {
    const what = BLOCKED_ATTACKS[definition.block.against];
    parts.push(`${String(Math.round(definition.block.chance * 100))}% chance to block ${what}`);
  }
  if (definition.endsAfterAttacks !== undefined) {
    const plural = definition.endsAfterAttacks === 1 ? "" : "s";
    parts.push(`ends after ${String(definition.endsAfterAttacks)} incoming attack${plural}`);
  }
  for (const effect of definition.onAttackHit) {
    parts.push(...describeAttackHit(effect));
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
  return parts.length === 0 ? definition.name : parts.join(", ");
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

/** What an `if` waits for, as the line it leads says it (#521). */
function conditionText(condition: EffectCondition): string {
  switch (condition.kind) {
    case "interrupted":
      return "If it interrupts";
    case "removed":
      return `If it removes ${condition.category === "enchantment" ? "an" : "a"} ${condition.category}`;
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

function describeEffect(
  effect: UnconditionalEffect,
  ranks: ReadonlyMap<string, number>,
): EffectDescription {
  switch (effect.kind) {
    case "damage": {
      const magnitude = describeMagnitude(effect.amount, ranks);
      return { text: `Deals ${String(magnitude.current)} damage`, magnitude };
    }
    case "heal": {
      const magnitude = describeMagnitude(effect.amount, ranks);
      const amount = String(magnitude.current);
      return {
        text: effect.recipient === "caster" ? `You gain ${amount} health` : `Heals for ${amount}`,
        magnitude,
      };
    }
    case "energy-gain": {
      const magnitude = describeMagnitude(effect.amount, ranks);
      return { text: `Gain ${String(magnitude.current)} energy`, magnitude };
    }
    case "sacrifice-health":
      return {
        text: `You sacrifice ${String(effect.percentOfMax)}% of your maximum health`,
        magnitude: undefined,
      };
    case "apply-status":
      // A stance, a preparation or a glyph is yours alone and one at a
      // time (#523, #525, #526), so it reads as what it is rather than as
      // something applied. The type line already says which (#524).
      switch (findStatusDefinition(effect.statusId)?.category) {
        case "stance":
        case "preparation":
        case "glyph":
          return {
            text: `For ${seconds(effect.durationSeconds)}, ` + describeStatus(effect.statusId),
            magnitude: undefined,
          };
        default:
          break;
      }
      return {
        text:
          `Applies ${statusName(effect.statusId)} for ${seconds(effect.durationSeconds)} ` +
          `(${describeStatus(effect.statusId)})`,
        magnitude: undefined,
      };
    case "remove-status": {
      if (effect.category === "stance") {
        return { text: "Ends the target's stance", magnitude: undefined };
      }
      const plural = effect.count === 1 ? "" : "s";
      return {
        text: `Removes ${String(effect.count)} ${effect.category}${plural}`,
        magnitude: undefined,
      };
    }
    case "interrupt":
      return {
        text:
          effect.only === "spell-or-chant"
            ? "Interrupts the target's spell or chant, if they are casting one"
            : "Interrupts the target's current cast, if they are casting",
        magnitude: undefined,
      };
    case "knockdown":
      return {
        text: `Knocks down for ${seconds(effect.durationSeconds)}`,
        magnitude: undefined,
      };
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
          ? `${amount} damage`
          : effect.kind === "heal"
            ? `heals ${amount}`
            : `+${amount} energy`;
      return { text, scales: magnitude.attributeId !== undefined };
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

const TARGET_TEXT: Record<Skill["target"], string> = {
  self: "Self",
  "single-enemy": "One foe",
  "single-ally": "One ally",
  "single-other-ally": "Another ally",
  "single-any": "Any one target",
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
  return `${String(cost)} energy${base}`;
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
            text: `While activating: ${describeStatus(skill.whileActivating)}`,
            magnitude: undefined,
          },
        ];
  // A spell that flies (#535) lands only if it reaches its target.
  const projectile =
    skill.projectile === undefined
      ? []
      : [{ text: "Projectile: can be dodged", magnitude: undefined }];
  const effects = [
    ...skill.effects.flatMap((effect) => describeEffects(effect, ranks)),
    ...onBlocked,
    ...whileActivating,
    ...projectile,
  ];
  const { target, range } = targetAndRange(skill);
  const numbers = skill.effects.flatMap((effect) => headlineOf(effect, ranks) ?? []);
  const headline = (numbers.find((number) => number.scales) ?? numbers[0])?.text;
  return {
    id: skill.id,
    name: skill.name,
    typeText: skill.elite ? `Elite ${TYPE_TEXT[skill.type]}` : TYPE_TEXT[skill.type],
    elite: skill.elite,
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
