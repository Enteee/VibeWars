import { MAX_ATTRIBUTE_RANK } from "../attributes.js";
import { AREA_ADJACENT, AREA_EARSHOT, AREA_IN_THE_AREA, AREA_NEARBY } from "../distances.js";
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
  for (const trigger of definition.triggers) {
    parts.push(...describeTrigger(trigger));
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

const TRIGGER_WHEN: Record<StatusTriggerEvent, string> = {
  "bearer-casts-spell": "whenever it casts a spell",
  "bearer-attacks": "whenever it attacks",
};

/** A status's answer to its bearer (#469): "takes 119 damage whenever it casts a spell". */
function describeTrigger(trigger: StatusTrigger): string[] {
  const when = TRIGGER_WHEN[trigger.on];
  return trigger.effects.flatMap((effect) =>
    effect.kind === "damage"
      ? [`takes ${String(describeMagnitude(effect.amount, new Map()).current)} damage ${when}`]
      : describeEffects(effect, new Map()).map(({ text }) => `${when}: ${lowerFirst(text)}`),
  );
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
  return `${category === "enchantment" ? "an" : "a"} ${category}`;
}

/** What an `if` waits for, as the line it leads says it (#521, #794). */
function conditionText(condition: EffectCondition): string {
  switch (condition.kind) {
    case "interrupted":
      return "If it interrupts";
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
  }
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
      return {
        text: `Deals ${String(magnitude.current)} damage${perPointLost(effect)}${penetration}`,
        magnitude,
      };
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
      return { text: `Gain ${String(magnitude.current)} energy${perPointLost(effect)}`, magnitude };
    }
    case "energy-loss": {
      const magnitude = describeMagnitude(effect.amount, ranks);
      return { text: `Target loses ${String(magnitude.current)} energy`, magnitude };
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
    case "maintain-status":
      // GW1 words upkeep as the caster's energy degeneration (#837).
      return {
        text:
          "Maintained: −1 Energy regeneration while it lasts. " +
          `${describeStatus(effect.statusId)}.`,
        magnitude: undefined,
      };
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
    case "splash": {
      // "Adjacent foes take 40 damage" (#885).
      const inner = effect.effects.map((each) => ({
        each,
        description: describeEffect(each, ranks),
      }));
      const what = inner
        .map(({ each, description }) =>
          each.kind === "damage"
            ? `take ${String(describeMagnitude(each.amount, ranks).current)} damage`
            : lowerFirst(description.text),
        )
        .join(", ");
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
    case "resurrect": {
      const health = describeMagnitude(effect.healthPercent, ranks);
      return {
        text: `resurrects, ${String(health.current)}% health`,
        scales: health.attributeId !== undefined,
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

/** A chain attack's line (#831): "Off-hand attack. Must follow a lead attack." */
function chainText(chain: ChainStep): string {
  return chain.follows === undefined
    ? CHAIN_ROLE_TEXT[chain.role]
    : `${CHAIN_ROLE_TEXT[chain.role]} ${FOLLOWS_TEXT[chain.follows]}`;
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
      : [{ text: `+${String(bonus.current)} damage`, magnitude: bonus }]),
    ...(conditionalBonus === undefined || more === undefined
      ? []
      : [
          {
            text: `${conditionText(conditionalBonus.condition)}: +${String(more.current)} damage`,
            magnitude: more,
          },
        ]),
  ];
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
    ...chainLine,
    ...bonusLine,
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
