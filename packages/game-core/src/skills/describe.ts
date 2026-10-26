import { MAX_ATTRIBUTE_RANK } from "../attributes.js";
import { getAttribute } from "../professions.js";

import { resolveMagnitudeAtRanks } from "./scaling.js";
import { findStatusDefinition } from "./status.js";
import type { Magnitude, Skill, SkillEffect } from "./types.js";

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
  readonly rangeText: string;
  readonly targetText: string;
  /** True when at least one effect scales with an attribute. */
  readonly scalesWithAttribute: boolean;
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
  if (definition.castTimeMultiplier !== 1) {
    parts.push(`cast times ${String(definition.castTimeMultiplier)}× longer`);
  }
  if (definition.attackDurationMultiplier !== 1) {
    parts.push(`attacks take ${String(definition.attackDurationMultiplier)}× as long`);
  }
  if (definition.block !== undefined) {
    const what = BLOCKED_ATTACKS[definition.block.against];
    parts.push(`${String(Math.round(definition.block.chance * 100))}% chance to block ${what}`);
  }
  return parts.length === 0 ? definition.name : parts.join(", ");
}

function describeEffect(
  effect: SkillEffect,
  ranks: ReadonlyMap<string, number>,
): EffectDescription {
  switch (effect.kind) {
    case "damage": {
      const magnitude = describeMagnitude(effect.amount, ranks);
      return { text: `Deals ${String(magnitude.current)} damage`, magnitude };
    }
    case "heal": {
      const magnitude = describeMagnitude(effect.amount, ranks);
      return { text: `Heals for ${String(magnitude.current)}`, magnitude };
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
      // A stance is yours alone and one at a time (#523), so it reads as
      // what it is rather than as something applied.
      if (findStatusDefinition(effect.statusId)?.category === "stance") {
        return {
          text:
            `Stance. For ${seconds(effect.durationSeconds)}, ` + describeStatus(effect.statusId),
          magnitude: undefined,
        };
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
        text: "Interrupts the target's current cast, if they are casting",
        magnitude: undefined,
      };
  }
}

const TARGET_TEXT: Record<Skill["target"], string> = {
  self: "Self",
  "single-enemy": "One foe",
  "single-ally": "One ally",
  "single-other-ally": "Another ally",
  "single-any": "Any one target",
};

/**
 * Describe a skill at the given attribute ranks.
 *
 * `ranks` is normally the character being edited. An empty map describes
 * the skill at rank 0, which is what an unallocated character would
 * actually get — not a hypothetical "typical" value.
 */
export function describeSkill(
  skill: Skill,
  ranks: ReadonlyMap<string, number> = new Map(),
): SkillDescription {
  // An attack skill's if-blocked effects (#534), after the ones a hit gets.
  const onBlocked = (skill.attack?.onBlocked ?? []).map((effect) => {
    const { text, magnitude } = describeEffect(effect, ranks);
    return { text: `If blocked: ${text.charAt(0).toLowerCase()}${text.slice(1)}`, magnitude };
  });
  const effects = [...skill.effects.map((effect) => describeEffect(effect, ranks)), ...onBlocked];
  return {
    id: skill.id,
    name: skill.name,
    attributeId: skill.attributeId,
    attributeName:
      skill.attributeId === undefined
        ? undefined
        : (getAttribute(skill.attributeId)?.name ?? skill.attributeId),
    effects,
    cost:
      skill.cost === undefined
        ? "Free"
        : `${String(skill.cost.amount)} ${skill.cost.kind === "energy" ? "energy" : "adrenaline"}`,
    castTime: skill.activationSeconds === 0 ? "Instant" : seconds(skill.activationSeconds),
    recharge: seconds(skill.rechargeSeconds),
    rangeText: skill.target === "self" ? "Self" : `${String(skill.range)} range`,
    targetText: TARGET_TEXT[skill.target],
    scalesWithAttribute: effects.some((effect) => effect.magnitude?.attributeId !== undefined),
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
