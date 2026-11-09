// Every word a skill or status description says (#2664, ADR-0050).
// generated-then-formatted: English is moved here from describe.ts, unchanged.
import {
  AREA_ADJACENT,
  AREA_EARSHOT,
  AREA_IN_THE_AREA,
  AREA_NEARBY,
  RANGE_COMPASS,
} from "../distances.js";
import type { DamageType } from "../equipment/types.js";
import { getAttribute, getProfession, type ProfessionId } from "../professions.js";

import { getSkill } from "./catalog.js";
import {
  findStatusDefinition,
  type NextSkill,
  type StatusCategory,
  type StatusTrigger,
  type StatusTriggerEvent,
  type StatusId,
} from "./status.js";
import type {
  AttackWeaponClass,
  Aura,
  ChainRole,
  CreateGroundEffect,
  RadiusArea,
  Magnitude,
  TargetRule,
  Skill,
  SkillType,
  SplashEffect,
} from "./types.js";

/**
 * Names of game data a description says, looked up by id: the player's
 * language in the client, the catalog's English in game-core.
 */
export interface DescribeNames {
  readonly skill: (id: string) => string;
  readonly status: (id: string) => string;
  readonly profession: (id: ProfessionId) => string;
  readonly attribute: (id: string) => string;
}

/** The catalog's English names: what is stored, sent and signed. */
export const EN_NAMES: DescribeNames = {
  skill: (id) => getSkill(id)?.name ?? id,
  status: (id) => findStatusDefinition(id)?.name ?? id,
  profession: (id) => getProfession(id).name,
  attribute: (id) => getAttribute(id)?.name ?? id,
};

/** "deals 63 damage" as the start of a line: "Deals 63 damage". */
function capitalize(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

function lowerAll(text: string): string {
  return text.toLowerCase();
}

function spaced(word: string): string {
  return word.replaceAll("-", " ");
}

/** A skill type as a word mid-line: "enchantment spell". */
function typeName(type: SkillType): string {
  return TYPE_TEXT[type].replace(/\.$/, "").toLowerCase();
}

/** A type's first word: "hex" of "Hex Spell.". */
function typeFirstWord(type: SkillType): string {
  return (TYPE_TEXT[type].split(" ")[0] ?? "").replace(/\.$/, "").toLowerCase();
}

/** A kind-bound answer to a block that ends with its first (#2500). */
function blockAnswerWording(text: string): string {
  return text.replace(/^the next time (?:you block|it blocks) an? /, "if it is a ");
}

/** An end's health loss, said of who loses it (#2282, #2313). */
function loseWording(text: string, fromSource: boolean, bearerIsFoe: boolean): string {
  const loser = fromSource ? "you lose" : bearerIsFoe ? "it loses" : "lose";
  return text.replace(/^Target foe loses/, loser).replace(/Energy they have/, "Energy you have");
}

/** A bearer's own gain or loss (#1485, #2133). */
function bearerWording(text: string, bearerIsCaster: boolean): string {
  return text
    .replace(/^Target gains/, "it gains")
    .replace(/^Target loses/, bearerIsCaster ? "you lose" : "it loses");
}

/** A condition on the bearer, said "it" (#988). */
function ifItWording(text: string): string {
  return text.replace(/^If target/, "If it");
}

/** A heal said after "gain" in a splash (#2432). */
function gainWording(text: string): string {
  return lowerFirst(text).replace(/^heals /, "");
}

/** A target's loss said of those a splash reaches (#2320). */
function loseTargetWording(text: string): string {
  return lowerFirst(text).replace(/^target loses/, "lose");
}

/** A steal said of the caster (#2313). */
function stealsWording(text: string): string {
  return lowerFirst(text).replace(/^steals /, "steal ");
}

/** A resurrection said of those a splash reaches (#2446). */
function returnedWording(text: string): string {
  return lowerFirst(text).replace(/^returns the target to life/, "are returned to life");
}

/** A splash on "Your other minions" with none left out (#1986). */
function yourMinionsWording(text: string): string {
  return text.replace(/^Your other minions/, "Your minions");
}

/** A splash's `onlyIf` (#2288), as said of whom it reaches. */
function onlyIfWording(text: string): string {
  return lowerFirst(text)
    .replace(/^if target is /, "while ")
    .replace(/^if target /, "")
    .replaceAll(" or target is ", " or ");
}

/** The clause an `onlyIfWording` makes after those it narrows (#2500). */
function splashOnlyClause(condition: string): string {
  return condition.startsWith("while ")
    ? ` that are ${condition.slice("while ".length)}`
    : condition === ""
      ? ""
      : ` that ${condition}`;
}

/** Who a steal takes from, narrowed by a condition (#2313). */
function eachOfWording(reached: string, condition: string): string {
  return condition === ""
    ? reached
    : `each of ${reached} ${condition.startsWith("while ") ? "" : "that "}${condition}`;
}

/** A chain's state requirement: "Only if target is knocked down" (#1041). */
function requiresWording(text: string): string {
  return text.replace(/^If /, "Only if ");
}

/** A condition for the middle of a log line (#1735). */
function requirementWording(text: string): string {
  return text.startsWith("If ") ? `only ${lowerFirst(text)}` : lowerFirst(text);
}

/** A chain requirement for the middle of a line (#1041). */
function requirementLine(text: string): string {
  return `${text.charAt(0).toLowerCase()}${text.slice(1).replace(/\.$/, "")}`;
}

/** `any-of` conditions, one "If" leading them. */
function anyOfWording(texts: readonly string[]): string {
  const [first, ...rest] = texts;
  return [first ?? "Never", ...rest.map((text) => text.replace(/^If /, ""))].join(" or ");
}

/** `all-of` conditions, one "If" leading them. */
function allOfWording(texts: readonly string[]): string {
  const [first, ...rest] = texts;
  return [first ?? "Always", ...rest.map((text) => text.replace(/^If /, ""))].join(" and ");
}

function seconds(value: number): string {
  // Whole seconds read better than "2.0s"; fractions keep one decimal.
  return Number.isInteger(value) ? `${String(value)}s` : `${value.toFixed(1)}s`;
}

const BLOCKED_ATTACKS: Record<"all" | "melee" | "projectile", string> = {
  all: "attacks",
  melee: "melee attacks",
  projectile: "projectiles",
};

/** One of `BLOCKED_ATTACKS`, for a block that ends with its first (#2500). */
const BLOCKED_ATTACK: Record<"all" | "melee" | "projectile", string> = {
  all: "attack",
  melee: "melee attack",
  projectile: "projectile",
};

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
  "bearer-takes-elemental-damage": "takes elemental damage",
  "bearer-takes-damage": "takes damage",
  "bearer-takes-damage-from-foe": "takes damage or life steal from a foe",
  "bearer-health-drops-below": "has its Health dropped below a line by damage",
  "bearer-fatal-damage-negated": "has fatal damage negated",
  "bearer-hit-by-attack": "is hit by a foe's attack",
  "bearer-targeted-by-foe": "is targeted by a foe's spell or attack",
  "bearer-healed-by-skill": "is healed by a skill",
  "bearer-blocks-melee": "blocks a melee attack",
  "bearer-blocks-projectile": "blocks a projectile attack",
  "bearer-blocks": "blocks",
  "bearer-interrupted": "is interrupted",
  "bearer-knocked-down": "is knocked down",
  "bearer-sacrifices-health": "sacrifices Health",
  "bearer-knockdown-prevented": "has a knockdown stopped",
  "bearer-gains-hex-or-enchantment": "gains a hex or an enchantment",
  "bearer-gains-enchantment": "gains an enchantment",
  "bearer-loses-enchantment": "loses an enchantment",
  "bearer-loses-condition": "loses a condition",
  "bearer-creates-creature": "creates a creature",
  "bearer-gains-condition": "gains a new condition",
  "bearer-chant-or-shout-ends": "has a chant or shout end on it",
  "bearer-energy-empty": "has no energy left",
  "bearer-energy-drops-empty": "drops to 0 Energy",
  "source-targets-bearer": "is targeted by your skill",
  "source-bearer-apart": "is far from you",
  "bearer-dies": "dies",
  ends: "ends",
  "ends-early": "ends prematurely",
  expires: "expires",
};

/** A third-person leading verb (#1841), in the second person. */
const SECOND_PERSON: Readonly<Record<string, string>> = {
  applies: "apply",
  attacks: "attack",
  becomes: "become",
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
  makes: "make",
  moves: "move",
  sacrifices: "sacrifice",
  takes: "take",
  uses: "use",
};

/**
 * A `TRIGGER_WHEN` or `kindBoundWhen` phrase said to its holder (#1841):
 * "casts a spell" -> "cast a spell", "has its Health dropped" -> "have
 * your Health dropped". A leading word it does not know throws.
 */
function secondPerson(phrase: string): string {
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

/**
 * A caster's own bow-bound trigger in the corpus's words (#2133):
 * Marksman's Wager's "whenever your arrows hit".
 */
const ARROWS_WHEN: Partial<Record<StatusTriggerEvent, string>> = {
  "bearer-hits": "hit",
  "bearer-fails-to-hit": "fail to hit",
};

/** An echo's (#1423), in the corpus's words. */
const CHANT_OR_SHOUT_ENDS = "whenever a chant or shout ends on it";

/** An energy-empty trigger's (#1583), in the corpus's words: Wither's. */
const ENERGY_EMPTY = "if its energy reaches 0";

/** An item status's end (#1434), every one a drop: "Drop effect: …". */
const DROPPED = "drop effect";

/** What a use trigger's aim reads as (#2282, #2333, #2499). */
const TARGETS_WORDS: Readonly<
  Record<NonNullable<NonNullable<StatusTrigger["usedSkill"]>["targets"]>, string>
> = { ally: "an ally", "other-ally": "another ally", foe: "a foe" };

/** The one use a status that ends on it answers (#949), as its tooltip says it. */
const NEXT_SKILL = "the next time it uses a skill";

/** `NEXT_SKILL` on its caster's own (#2341). */
const YOUR_NEXT_SKILL = "the next time you use a skill";

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

/** What each of a chant's next skills of a kind does (#1483): "with your next spell: gain 5 Energy". */
const NEXT_SKILL_KIND: Readonly<Record<NextSkill["which"], readonly [string, string]>> = {
  "attack-skill": ["attack skill", "attack skills"],
  spell: ["spell", "spells"],
  hex: ["hex", "hexes"],
  signet: ["signet", "signets"],
  "signet-at-foe": ["signet that targets a foe", "signets that target a foe"],
  "shout-or-chant": ["shout or chant", "shouts or chants"],
  any: ["skill", "skills"],
};

/** "Deals 63 damage" as the second half of a line: "deals 63 damage". */
function lowerFirst(text: string): string {
  return `${text.charAt(0).toLowerCase()}${text.slice(1)}`;
}

/** "a hex", "an enchantment". */
function aCategory(category: StatusCategory): string {
  return `${category === "enchantment" ? "an" : "a"} ${category.replace("-", " ")}`;
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
    // Blood Drinker's (#2314): "If you have at least 90% Health".
    [/^If (target|you) (has|have) less than /, (_, who, verb) => `If ${who} ${verb} at least `],
    [/^If you (\w+) /, (_, verb) => `If you do not ${verb} `],
  ];
  for (const [pattern, replacement] of rules) {
    if (pattern.test(text)) {
      return text.replace(pattern, replacement);
    }
  }
  return `Unless ${text.replace(/^If /, "")}`;
}

/**
 * A `conditionText` whose target is you (#2341, #2500): "If you are
 * attacking" on the caster's own status, "If you are knocked down" on a
 * skill that targets yourself.
 */
function yourCondition(text: string): string {
  return text
    .replace(/^If target is /, "If you are ")
    .replace(/^If target has /, "If you have ")
    .replace(/^If target /, "If you ");
}

/**
 * A damage type as the word before "damage" (#1724): " fire" in "Deals 112
 * fire damage"; typeless damage is not named.
 */
function typeWord(type: DamageType): string {
  return type === "typeless" ? "" : ` ${type}`;
}

/** Who a splash reaches, in the plural (#885, #1777). */
const SPLASH_SIDE: Readonly<Record<SplashEffect["hits"], string>> = {
  foes: "foes",
  "foe-creatures": "foe creatures",
  "foe-minions": "foe minions",
  allies: "allies",
  "non-spirit-allies": "non-spirit allies",
  party: "party members",
  "own-spirits": "your spirits",
  "own-minions": "your other minions",
  "allied-minions": "allied minions",
};

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

/** `category` as a noun for `count` of it (#1954): "hex", "hexes". */
function categoryNoun(count: number | "all", category: StatusCategory): string {
  if (count === 1) {
    return category;
  }
  return category === "hex" ? "hexes" : `${category}s`;
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

/** A weapon class as an adjective, for "your non-dagger attack skills" (#2134). */
const WEAPON_WORD: Record<AttackWeaponClass, string> = {
  axe: "axe",
  sword: "sword",
  hammer: "hammer",
  daggers: "dagger",
  scythe: "scythe",
  spear: "spear",
  bow: "bow",
  melee: "melee",
};

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

/** GW1's words for the area radii (`distances.ts`). */
const AREA_TEXT: ReadonlyMap<number, string> = new Map([
  [AREA_ADJACENT, "adjacent"],
  [AREA_NEARBY, "nearby"],
  [AREA_IN_THE_AREA, "in the area"],
  [AREA_EARSHOT, "in earshot"],
  // "I Will Avenge You!"'s dead allies (#2320).
  [RANGE_COMPASS, "in compass range"],
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
  "enemy-minion": "A foe's minion",
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
 * Every sentence a description says, one entry a shape (#2664, ADR-0050).
 * The file for a language is `locales/<code>/describe.ts`, a
 * `satisfies DescribeWords` of this. An entry decides its own word order,
 * agreement and plurals from its params: numbers arrive already formatted,
 * marked when an attribute scales them, and go through untouched.
 */
export interface DescribeWords {
  readonly capitalize: (text: string) => string;
  readonly lowerAll: (text: string) => string;
  readonly spaced: (word: string) => string;
  readonly typeName: (type: SkillType) => string;
  readonly typeFirstWord: (type: SkillType) => string;
  readonly blockAnswerWording: (text: string) => string;
  readonly loseWording: (text: string, fromSource: boolean, bearerIsFoe: boolean) => string;
  readonly bearerWording: (text: string, bearerIsCaster: boolean) => string;
  readonly ifItWording: (text: string) => string;
  readonly gainWording: (text: string) => string;
  readonly loseTargetWording: (text: string) => string;
  readonly stealsWording: (text: string) => string;
  readonly returnedWording: (text: string) => string;
  readonly yourMinionsWording: (text: string) => string;
  readonly onlyIfWording: (text: string) => string;
  readonly splashOnlyClause: (condition: string) => string;
  readonly eachOfWording: (reached: string, condition: string) => string;
  readonly requiresWording: (text: string) => string;
  readonly requirementWording: (text: string) => string;
  readonly requirementLine: (text: string) => string;
  readonly anyOfWording: (texts: readonly string[]) => string;
  readonly allOfWording: (texts: readonly string[]) => string;
  readonly seconds: (value: number) => string;
  readonly blockedAttacks: Record<"all" | "melee" | "projectile", string>;
  readonly blockedAttack: Record<"all" | "melee" | "projectile", string>;
  readonly damageTaken: (multiplier: number) => string;
  readonly triggerWhen: Record<StatusTriggerEvent, string>;
  readonly secondPerson: (phrase: string) => string;
  readonly arrowsWhen: Partial<Record<StatusTriggerEvent, string>>;
  readonly chantOrShoutEnds: string;
  readonly energyEmpty: string;
  readonly dropped: string;
  readonly targetsWords: Readonly<
    Record<NonNullable<NonNullable<StatusTrigger["usedSkill"]>["targets"]>, string>
  >;
  readonly nextSkill: string;
  readonly yourNextSkill: string;
  readonly creates: string;
  readonly areaAroundCreated: ReadonlyMap<number, string>;
  readonly nextSkillKind: Readonly<Record<NextSkill["which"], readonly [string, string]>>;
  readonly lowerFirst: (text: string) => string;
  readonly aCategory: (category: StatusCategory) => string;
  readonly negatedText: (text: string) => string;
  readonly yourCondition: (text: string) => string;
  readonly typeWord: (type: DamageType) => string;
  readonly splashSide: Readonly<Record<SplashEffect["hits"], string>>;
  readonly auraWho: Record<Aura["affects"], string>;
  readonly groundAnchorText: Record<CreateGroundEffect["anchor"], string>;
  readonly share: (fraction: number) => string;
  readonly categoryNoun: (count: number | "all", category: StatusCategory) => string;
  readonly weaponText: Record<AttackWeaponClass, string>;
  readonly chainRoleText: Record<ChainRole, string>;
  readonly followsText: Record<ChainRole, string>;
  readonly neededWeapon: Record<AttackWeaponClass, string>;
  readonly weaponWord: Record<AttackWeaponClass, string>;
  readonly typeText: Record<SkillType, string>;
  readonly areaText: ReadonlyMap<number, string>;
  readonly areaAroundTarget: ReadonlyMap<number, string>;
  readonly targetText: Record<Skill["target"], string>;
  readonly areaWho: Record<RadiusArea["affects"], string>;
  readonly s: () => string;
  readonly onTarget: () => string;
  readonly composedLastsAtBase: (p: {
    readonly lasts: number;
    readonly at: number;
    readonly base: string;
  }) => string;
  readonly attributes: (p: { readonly name: string }) => string;
  readonly attributes2: () => string;
  readonly attributePrimaryS: (p: { readonly scope: string }) => string;
  readonly setTo: (p: { readonly scope: string; readonly rank: string }) => string;
  readonly allAttributes: () => string;
  readonly toAllAllAttributes: (p: { readonly amount: string; readonly value: string }) => string;
  readonly renewedWheneverAChantOrShoutEnds: (p: { readonly selfOnly: boolean }) => string;
  readonly renewedWheneverYouCastItCastsA: (p: { readonly selfOnly: boolean }) => string;
  readonly reappliedWheneverYouCastItCastsA: (p: { readonly selfOnly: boolean }) => string;
  readonly renewedWheneverYouTakeItTakesElemental: (p: { readonly selfOnly: boolean }) => string;
  readonly renewedWheneverAnEnchantmentOnYouIt: (p: { readonly selfOnly: boolean }) => string;
  readonly gainAdrenalineFasterSlower: (p: {
    readonly shown: string;
    readonly faster: number;
  }) => string;
  readonly onTheBearerExpireFaster: (p: { readonly what: string; readonly stat: string }) => string;
  readonly enchantmentsAndStances: () => string;
  readonly enchantments: () => string;
  readonly stances: () => string;
  readonly yourAttacksAgainstItHaveCriticalChance: (p: {
    readonly criticalChanceBonus: string;
  }) => string;
  readonly armorAgainstYourAttacksWhileItHas: (p: {
    readonly armorModifier: string;
    readonly onlyWhileNoOtherHex: boolean;
  }) => string;
  readonly youTheBearer: (p: { readonly selfOnly: boolean }) => string;
  readonly endsIfYouEndsIfTheBearer: (p: {
    readonly selfOnly: boolean;
    readonly phrase: string;
  }) => string;
  readonly healthDegeneration: (p: { readonly healthPips: string }) => string;
  readonly healthRegeneration: (p: { readonly healthPips: string }) => string;
  readonly healthRegenerationForEachEnchantmentOnYou: (p: {
    readonly pips: string;
    readonly max: string;
  }) => string;
  readonly energyDegeneration: (p: { readonly energyPips: string }) => string;
  readonly energyRegeneration: (p: { readonly energyPips: string }) => string;
  readonly healthRegenerationForEachConditionOnYou: (p: {
    readonly healthPipsPerCondition: string;
  }) => string;
  readonly health: () => string;
  readonly hex: () => string;
  readonly energy: () => string;
  readonly condition: () => string;
  readonly regenerationForEachOnYou: (p: {
    readonly pips: string;
    readonly what: string;
    readonly each: string;
  }) => string;
  readonly armorWhileWielding: (p: {
    readonly sign: string;
    readonly armorModifier: string;
    readonly weapon: AttackWeaponClass | undefined;
  }) => string;
  readonly armorWhileNotMoving: (p: { readonly armorWhileStill: string }) => string;
  readonly healthPerSecondWhileMoving: (p: {
    readonly healthPerSecondWhileMoving: string;
  }) => string;
  readonly healthPerSecond: (p: { readonly healthPerSecond: string }) => string;
  readonly healthPerSecondMoreInEarshotOf: (p: {
    readonly healthPerSecondNearSpirit: string;
  }) => string;
  readonly spellsCastInEarshotOfASpirit: (p: { readonly faster: string }) => string;
  readonly chanceToDoubleStrikeWhileWielding: (p: {
    readonly chance: string;
    readonly weapon: AttackWeaponClass | undefined;
  }) => string;
  readonly armorNotBelow: (p: { readonly amount: string; readonly floor: string }) => string;
  readonly movesAtSpeed: (p: { readonly speed: string }) => string;
  readonly movesAtSpeedWhileEnchanted: (p: { readonly speed: string }) => string;
  readonly speedBoostsHaveNoEffect: () => string;
  readonly cannotGainAdrenaline: () => string;
  readonly whenThisEndsYouReturnToWhere: () => string;
  readonly whenThisEndsYouShadowStepTo: (p: { readonly seconds: string }) => string;
  readonly ofAttacksMiss: (p: { readonly attackMissChance: string }) => string;
  readonly maximumHealthAtMost: (p: { readonly fraction: string; readonly cap: string }) => string;
  readonly maximumHealth: (p: { readonly maxHealthBonus: string }) => string;
  readonly maximumHealthPerEnchantment: (p: {
    readonly maxHealthBonusPerEnchantment: string;
  }) => string;
  readonly maximumEnergy: (p: { readonly maxEnergyBonus: string }) => string;
  readonly maximumHealthPerPointOfMaximumEnergy: (p: { readonly per: string }) => string;
  readonly yourMinionsDealDamage: (p: { readonly minionDamageBonus: string }) => string;
  readonly loseMaximumHealthEachTimeAMinion: (p: {
    readonly minionHitHealthLossPercent: string;
  }) => string;
  readonly conditionsYouWouldReceiveGoToYour: () => string;
  readonly healing: (p: { readonly more: boolean; readonly change: string }) => string;
  readonly weaponDamage: (p: { readonly change: string }) => string;
  readonly dealsDamage: (p: { readonly more: boolean; readonly change: string }) => string;
  readonly noDeathPenalty: () => string;
  readonly whenTheBearerDiesSoDoesIts: () => string;
  readonly alliesYouResurrectReturnWithHealthAnd: (p: {
    readonly health: string;
    readonly energy: string;
  }) => string;
  readonly youDieTheBearerDiesWhenIt: (p: { readonly selfOnly: boolean }) => string;
  readonly leavesAnExploitedCorpse: () => string;
  readonly takeFromPhysicalDamage: (p: {
    readonly sign: string;
    readonly amount: string;
  }) => string;
  readonly elementalDamageTakenIsDamage: (p: {
    readonly elementalDamageTakenAs: DamageType;
  }) => string;
  readonly physicalDamageTakenIsDamage: (p: {
    readonly physicalDamageTakenAs: DamageType;
  }) => string;
  readonly physicalDamageDealtIsDamage: (p: {
    readonly physicalDamageDealtAs: DamageType;
  }) => string;
  readonly elementalDamageDealtIsDamage: (p: {
    readonly elementalDamageDealtAs: DamageType;
  }) => string;
  readonly takeFromSpiritsAttacks: (p: { readonly damageFromSpiritAttacks: string }) => string;
  readonly attacksAttacksDealDamage: (p: {
    readonly weapon: AttackWeaponClass | undefined;
    readonly attackDamageType: DamageType;
  }) => string;
  readonly attacksHaveArmorPenetration: (p: { readonly attackArmorPenetration: string }) => string;
  readonly attacksAttacksDealLessMoreDamage: (p: {
    readonly weapon: AttackWeaponClass | undefined;
    readonly amount: string;
    readonly delta: number;
  }) => string;
  readonly and: () => string;
  readonly immuneToAnd: (p: { readonly names: string }) => string;
  readonly setOnFire: () => string;
  readonly or: () => string;
  readonly cannotBeOr: (p: { readonly names: string }) => string;
  readonly attacksFromAttacks: (p: {
    readonly adrenalineGain: string;
    readonly adrenalineGainFasterFrom: string | undefined;
  }) => string;
  readonly yourEliteEliteSkillSUse: (p: {
    readonly skillType: string;
    readonly name: string;
  }) => string;
  readonly uses: (p: { readonly skillType: string }) => string;
  readonly sUse: (p: { readonly uses: string; readonly skillType: string }) => string;
  readonly yourNext: (p: { readonly next: string; readonly name: string }) => string;
  readonly spellsTakeAsLongToCast: (p: { readonly castTimeMultiplier: string }) => string;
  readonly skillsButAttacksTakeAsLongTo: (p: {
    readonly skillActivationMultiplier: string;
  }) => string;
  readonly spellsAreInterruptedByAttacks: () => string;
  readonly slowerFaster: (p: { readonly attackDurationMultiplier: number }) => string;
  readonly attacksWhileWielding: (p: {
    readonly change: string;
    readonly way: string;
    readonly weapon: AttackWeaponClass | undefined;
  }) => string;
  readonly conditionsYouApplyLastLongerWhileWielding: (p: {
    readonly longer: string;
    readonly weapon: AttackWeaponClass | undefined;
  }) => string;
  readonly enchantmentsYouMaintainCostTheUpkeep: (p: {
    readonly upkeepMultiplier: string;
  }) => string;
  readonly spellsThatCauseOvercastCauseMoreAs: (p: {
    readonly overcastSurcharge: string;
  }) => string;
  readonly arrowsMoveAsFast: (p: { readonly projectileSpeedMultiplier: string }) => string;
  readonly cannotCastSpells: () => string;
  readonly cannotAttack: () => string;
  readonly cannotUseResurrectionSkills: () => string;
  readonly cannotBeTheTargetOfEnemySpells: (p: { readonly whileCasting: boolean }) => string;
  readonly cannotBeTheTargetOfSpells: () => string;
  readonly hostileSpellsTargetingYouFail: () => string;
  readonly attacksAgainstYouMiss: () => string;
  readonly strippedOfAllEnchantmentsAndCannotBe: () => string;
  readonly cannotBeTheTargetOfEnchantments: () => string;
  readonly cannotUseShoutsOrChants: () => string;
  readonly cannotUseSignets: () => string;
  readonly cannotBlockItsCasterSAttacks: () => string;
  readonly cannotBeBlockedByBlindedFoes: () => string;
  readonly cannotBlock: () => string;
  readonly renewedForSecondsIfMovingAsIt: (p: { readonly renewsWhileMoving: string }) => string;
  readonly cannotBeKnockedDown: () => string;
  readonly cannotBeKnockedDownByAFoe: () => string;
  readonly endsIfItPreventsAKnockdown: () => string;
  readonly youDoNotSufferExtraDamageFrom: () => string;
  readonly cannotLandCriticalHits: () => string;
  readonly immuneToCriticalHits: () => string;
  readonly spellsHaveDoubleTheDivineFavorBonus: (p: { readonly attribute: string }) => string;
  readonly attackSkillAttackSkills: (p: {
    readonly once: boolean;
    readonly attackSkillsOnly: true | undefined;
    readonly against: "all" | "melee" | "projectile";
  }) => string;
  readonly whileBelowHealth: (p: { readonly blockBelowHealth: string }) => string;
  readonly whileUnderOr: (p: { readonly value: string }) => string;
  readonly fromFoesUnderOr: (p: { readonly value: string }) => string;
  readonly whileAttacking: (p: { readonly blockWhileAttacking: boolean }) => string;
  readonly blocksTheNextChanceToBlock: (p: {
    readonly once: boolean;
    readonly what: string;
    readonly attacker: string;
    readonly below: string;
    readonly under: string;
    readonly attacking: string;
    readonly chance: string;
  }) => string;
  readonly within: (p: { readonly radius: number; readonly radius2: string }) => string;
  readonly alliesTo: (p: {
    readonly around: string;
    readonly bearer: string;
    readonly status: string;
  }) => string;
  readonly whileWielding: (p: { readonly weapon: AttackWeaponClass }) => string;
  readonly whileHoldingAWeaponOtherThan: (p: { readonly not: AttackWeaponClass }) => string;
  readonly againstFoesThatAreNotMoving: (p: {
    readonly criticalChanceBonusVersus: string | undefined;
  }) => string;
  readonly criticalChance: (p: {
    readonly chance: string;
    readonly holding: string;
    readonly versus: string;
  }) => string;
  readonly gainEnergyPerCriticalHit: (p: { readonly energyPerCritical: string }) => string;
  readonly wheneverYouSuccessfullyLandACriticalHit: (p: {
    readonly healthPerCritical: string;
  }) => string;
  readonly refreshesEveryTimeYouLandACritical: () => string;
  readonly theNextTimeYouLandACritical: (p: { readonly endsWhenFired: boolean }) => string;
  readonly with: (p: {
    readonly weapon: AttackWeaponClass | undefined;
    readonly critical: string;
  }) => string;
  readonly removeStatusFromYourTarget: (p: {
    readonly kind: string | undefined;
    readonly when: string;
    readonly text: string;
  }) => string;
  readonly ifOneIsRemovedYouLoseEnergy: (p: { readonly energyIfRemoved: string }) => string;
  readonly endsAfterIncomingAttackS: (p: {
    readonly endsAfterAttacks: string;
    readonly endsAfterAttacks2: number;
  }) => string;
  readonly endsAfterYourNextAttackSHit: (p: {
    readonly endsAfterAttackCount: string;
    readonly endsAfterAttackCount2: number;
  }) => string;
  readonly noEffectWhileUnderOr: (p: { readonly suppressedWhileUnder: string }) => string;
  readonly yourNextAttackSCannotBeBlocked: (p: {
    readonly unblockableAttacks: string;
    readonly unblockableAttacks2: number;
  }) => string;
  readonly attacksCannotBeBlocked: (p: {
    readonly weapon: AttackWeaponClass | undefined;
  }) => string;
  readonly whileYouWieldAnAWeapon: (p: {
    readonly test: boolean;
    readonly weaponDamage: DamageType;
    readonly hit: string;
  }) => string;
  readonly forEachEnchantmentRemovedSCasterLoses: (p: {
    readonly name: string;
    readonly name2: string;
    readonly percentOfMax: string;
  }) => string;
  readonly with2: (p: { readonly weapon: AttackWeaponClass | undefined }) => string;
  readonly endsAfterHitS: (p: {
    readonly count: string;
    readonly count2: number;
    readonly how: string;
  }) => string;
  readonly spellSpells: (p: { readonly one: boolean; readonly count: string }) => string;
  readonly yourNextCostsCostLessEnergy: (p: {
    readonly next: string;
    readonly one: boolean;
    readonly costReduction: string;
  }) => string;
  readonly yourNextRechargesRechargeFaster: (p: {
    readonly next: string;
    readonly one: boolean;
    readonly rechargeFaster: string;
  }) => string;
  readonly forYourNext: (p: { readonly next: string }) => string;
  readonly theirProjectilesMoveAsFast: (p: {
    readonly projectileSpeedMultiplier: string;
  }) => string;
  readonly noOvercast: () => string;
  readonly spreadsToAdjacentCombatants: () => string;
  readonly nextAttackSkillDamage: (p: {
    readonly condition: string;
    readonly more: string;
  }) => string;
  readonly attacks: () => string;
  readonly makesAMeleeAttack: () => string;
  readonly moves: () => string;
  readonly takesDamage: (p: { readonly damageTakenMultiplier: string }) => string;
  readonly takesDamageFromTheNextAttack: (p: {
    readonly attackDamageTakenMultiplier: number;
  }) => string;
  readonly damageTaken2: (p: { readonly damageReduction: string }) => string;
  readonly damageTakenPerRankOfAtMost: (p: {
    readonly now: string;
    readonly perRank: string;
    readonly attribute: string;
    readonly max: string;
  }) => string;
  readonly damageTakenMoreEachHit: (p: { readonly step: string }) => string;
  readonly theNextHitDealsLessDamage: (p: { readonly nextDamageReduction: string }) => string;
  readonly damageTakenWhileCastingS: (p: {
    readonly amount: string;
    readonly skillType: SkillType;
  }) => string;
  readonly lessDamage: (p: { readonly value: string; readonly type: DamageType }) => string;
  readonly lessDamageFromFoesWithAHex: (p: {
    readonly fraction: string;
    readonly name: string;
  }) => string;
  readonly lessDamageFromFoesSufferingFrom: (p: {
    readonly fraction: string;
    readonly name: string;
  }) => string;
  readonly damageTakenFromFoesWithLessHealth: (p: {
    readonly damageReductionFromWeakerFoe: string;
  }) => string;
  readonly damageTakenFromFoesWithACondition: (p: {
    readonly damageReductionFromConditionedFoe: string;
  }) => string;
  readonly lessDamageFromSpells: (p: { readonly less: string }) => string;
  readonly damageOverInASecondIsHealed: (p: { readonly cap: string }) => string;
  readonly physicalItsPhysicalDamageTheDamageIt: (p: {
    readonly from: string | undefined;
  }) => string;
  readonly whichTakesLessOfIt: (p: { readonly reduction: string }) => string;
  readonly goesToItsCaster: (p: {
    readonly fraction: number;
    readonly hits: string;
    readonly less: string;
  }) => string;
  readonly theDamageYouTakeGoesToYour: (p: { readonly redirectsDamageToMinion: number }) => string;
  readonly damageFromASingleHitIsCapped: (p: {
    readonly maxDamageFractionPerHit: string;
  }) => string;
  readonly eachHitItCapsCostsTheCaster: (p: {
    readonly casterEnergyPerReduction: string;
  }) => string;
  readonly damageFromASingleAttackIsCapped: (p: {
    readonly attackDamageCapFraction: string;
  }) => string;
  readonly lifeStolen: (p: { readonly lifeStealReduction: string }) => string;
  readonly yourHealthSacrificesAreLarger: (p: { readonly sacrificeMultiplier: string }) => string;
  readonly knockdownsLastAtLeastS: (p: { readonly knockdownMinSeconds: string }) => string;
  readonly itsSpiritLosesHealthEachTime: (p: { readonly sourceLosesHealth: string }) => string;
  readonly reappliedAsItWouldEndWhileYou: (p: { readonly selfOnly: boolean }) => string;
  readonly chantsAndShoutsLastLongerOnIt: (p: { readonly longer: string }) => string;
  readonly attacksDealLessMoreDamage: (p: {
    readonly attackDamageDelta: string;
    readonly attackDamageDelta2: number;
  }) => string;
  readonly movesFaster: (p: { readonly moveSpeedMultiplier: string }) => string;
  readonly healthRegenerationDegeneration: (p: {
    readonly healthPips: string;
    readonly healthPips2: number;
  }) => string;
  readonly armor: (p: { readonly armorModifier: string }) => string;
  readonly attacksFaster: (p: { readonly value: string }) => string;
  readonly aOr: (p: { readonly categories: string }) => string;
  readonly listComma: () => string;
  readonly whileUnderOr2: (p: { readonly under: string; readonly gains: string }) => string;
  readonly once: () => string;
  readonly times: (p: { readonly stat: string }) => string;
  readonly endsAfterItTakesEffect: (p: { readonly times: string }) => string;
  readonly theNextHexFailsAndItsCaster: (p: { readonly damage: string }) => string;
  readonly theNextSpellItCastsAtFoe: (p: {
    readonly on: string | undefined;
    readonly what: string;
  }) => string;
  readonly theNextTouchSkillsUsedAgainstYou: (p: {
    readonly failsFoeTouchSkills: string;
  }) => string;
  readonly foesWithinFoes: (p: {
    readonly area: string | undefined;
    readonly radius: string;
  }) => string;
  readonly moreEachSecond: (p: { readonly growth: string }) => string;
  readonly eachSecondItAndTakeDamage: (p: {
    readonly hitsBearer: boolean;
    readonly foes: string;
    readonly damage: string;
    readonly kind: string;
    readonly more: string;
  }) => string;
  readonly second: () => string;
  readonly seconds2: (p: { readonly every: string }) => string;
  readonly everySecondSeconds: (p: { readonly value: string; readonly what: string }) => string;
  readonly itsSpiritLosesHealthForEachOne: (p: { readonly amount: string }) => string;
  readonly itsSpiritLosesHealthForEachOne2: (p: { readonly amount: string }) => string;
  readonly everyAttack: () => string;
  readonly theNextAttack: () => string;
  readonly theNextAttacks: (p: { readonly times: string }) => string;
  readonly typelessAsDamage: (p: { readonly type: DamageType }) => string;
  readonly ofTheDamageOfThatHitIt: (p: {
    readonly share: string;
    readonly attacks: string;
    readonly kind: string;
    readonly max: string;
  }) => string;
  readonly eachAttackItLandsHasAChance: (p: {
    readonly chance: string;
    readonly max: string;
  }) => string;
  readonly theNextDamageOrLifeStealHeals: (p: { readonly reversesNextDamage: string }) => string;
  readonly theNextDamageIsNegatedAndIts: (p: { readonly cap: string }) => string;
  readonly meleeAttacksNeitherHitNorFailTo: (p: { readonly damage: string }) => string;
  readonly allDamageHealsForThatMuchInstead: (p: { readonly cap: string }) => string;
  readonly theNextDamageOrLifeStealThat: (p: { readonly selfOnly: boolean }) => string;
  readonly whenOneAllySIsSpentIt: () => string;
  readonly gainMoreStrikeStrikesOfAdrenalinePer: (p: {
    readonly extraStrikesPerHit: string;
    readonly extraStrikesPerHit2: number;
  }) => string;
  readonly skillsRechargeFaster: (p: { readonly skillRechargeFaster: string }) => string;
  readonly skillsCostMoreLessEnergy: (p: {
    readonly change: string;
    readonly change2: number;
  }) => string;
  readonly spellsAndBindingRitualsRechargeFaster: (p: { readonly faster: string }) => string;
  readonly spellsRechargeFaster: (p: { readonly spellRechargeFaster: string }) => string;
  readonly bindingRitualsRechargeFaster: (p: { readonly faster: string }) => string;
  readonly enchantmentsRechargeFaster: (p: {
    readonly name: string;
    readonly faster: string;
  }) => string;
  readonly hexTheTargetSYour: (p: { readonly category: StatusCategory }) => string;
  readonly skillsHaveArmorPenetration: (p: {
    readonly name: string;
    readonly pierce: string;
  }) => string;
  readonly yourTheBearerSSkillsCannotBe: (p: { readonly selfOnly: boolean }) => string;
  readonly theNextTimeYouWouldBeInterrupted: () => string;
  readonly youCannotBeInterruptedEachTimeYou: (p: { readonly amount: string }) => string;
  readonly youCannotBeInterruptedEachTimeYou2: (p: { readonly profession: string }) => string;
  readonly conditionsOnExpireFaster: (p: {
    readonly bearer: string;
    readonly faster: string;
  }) => string;
  readonly hexesOnExpireFaster: (p: { readonly bearer: string; readonly faster: string }) => string;
  readonly theNextHexOnLastsLonger: (p: {
    readonly of: string;
    readonly bearer: string;
    readonly longer: string;
  }) => string;
  readonly hexesCastOnTakeAsLongTo: (p: {
    readonly bearer: string;
    readonly times: string;
  }) => string;
  readonly otherAlliesSpellsOnTakeAsLong: (p: {
    readonly bearer: string;
    readonly times: string;
  }) => string;
  readonly yourSpellsOnTakeAsLongTo: (p: {
    readonly bearer: string;
    readonly times: string;
  }) => string;
  readonly enchantmentsCastOnCostLessEnergyMinimum: (p: {
    readonly bearer: string;
    readonly less: string;
  }) => string;
  readonly hitsWithAnAttack: () => string;
  readonly failsToHit: () => string;
  readonly hitsWithAnAttackSkill: () => string;
  readonly skillEffectEndsIfYouUseA: (p: {
    readonly selfOnly: boolean;
    readonly category: StatusCategory;
  }) => string;
  readonly endsIfYouUseAnAdrenalSkill: () => string;
  readonly endsIfYouUseANonAdrenal: () => string;
  readonly endsIfYouUseANonSkill: (p: { readonly kind: string }) => string;
  readonly endsIfYouUseAnAttackSkill: () => string;
  readonly endsIfYouUseASkillOn: () => string;
  readonly endsIfYouUseASkillThat: (p: { readonly NEXT_SKILL_KIND: string }) => string;
  readonly hexHexedEnchanted: (p: { readonly category: string | undefined }) => string;
  readonly becomesOr: (p: { readonly gained: string }) => string;
  readonly theBearerIsDestroyedWhenItExpires: () => string;
  readonly theMinionsYouItTookBecomeMasterless: (p: { readonly selfOnly: boolean }) => string;
  readonly whenTheBearerDiesRisesWhereIt: (p: {
    readonly masterless: true | undefined;
    readonly stands: string;
  }) => string;
  readonly composedKindBoundWhenOn: (p: {
    readonly kindBoundWhen: string | undefined;
    readonly on: StatusTriggerEvent;
  }) => string;
  readonly endsIfItEndsIfYou: (p: { readonly onFoe: boolean; readonly when: string }) => string;
  readonly all: (p: {
    readonly once: boolean;
    readonly against: string | undefined;
    readonly text: string;
  }) => string;
  readonly whileHoldingAnItem: (p: {
    readonly onlyWhileHoldingItem: boolean;
    readonly holdingSaid: boolean;
    readonly stats: string;
  }) => string;
  readonly composedIndexText: (p: { readonly index: number; readonly text: string }) => string;
  readonly listSentence: () => string;
  readonly physicalAttacks: (p: {
    readonly weapon: AttackWeaponClass | undefined;
    readonly physicalOnly: boolean;
  }) => string;
  readonly attackSkillsPhysicalAttacks: (p: {
    readonly attackSkillsOnly: boolean;
    readonly weapon: AttackWeaponClass | undefined;
    readonly value: string;
  }) => string;
  readonly foesYourHitGetFor: (p: {
    readonly attacks: string;
    readonly statusName: string;
    readonly durationSeconds: string;
  }) => string;
  readonly foesYourHitTake: (p: {
    readonly attacks: string;
    readonly riderDamage: string;
  }) => string;
  readonly foesYourHitLose: (p: {
    readonly attacks: string;
    readonly count: string;
    readonly count2: number;
    readonly category: StatusCategory;
  }) => string;
  readonly andSoDoFoesAdjacentToThem: (p: { readonly pop: string }) => string;
  readonly stealUpToHealth: (p: { readonly attacks: string; readonly amount: string }) => string;
  readonly yourPetSAttacksHealYouFor: (p: { readonly amount: string }) => string;
  readonly yourInterruptFoesTheyHit: (p: { readonly attacks: string }) => string;
  readonly your: (p: { readonly attacks: string; readonly text: string }) => string;
  readonly attackSkillsPhysicalAttacks2: (p: {
    readonly attackSkillsOnly: boolean;
    readonly weapon: AttackWeaponClass | undefined;
  }) => string;
  readonly foesThatBlockYourGetFor: (p: {
    readonly attacks: string;
    readonly statusName: string;
    readonly durationSeconds: string;
  }) => string;
  readonly foesThatBlockYour: (p: { readonly attacks: string; readonly text: string }) => string;
  readonly damage: (p: { readonly amount: string; readonly type: DamageType }) => string;
  readonly physical: () => string;
  readonly elemental: () => string;
  readonly armor2: () => string;
  readonly listSpace: () => string;
  readonly againstProjectileAttacks: (p: {
    readonly projectile: boolean;
    readonly text: string;
  }) => string;
  readonly thatAllyIsHealedFor: (p: { readonly amount: string }) => string;
  readonly youLoseItsCasterLoses: (p: { readonly bearerIsCaster: boolean }) => string;
  readonly energy2: (p: { readonly who: string; readonly amount: string }) => string;
  readonly orSpell: (p: { readonly value: string }) => string;
  readonly wheneverYouCastItCastsAnA: (p: {
    readonly bearerIsCaster: boolean;
    readonly test: boolean;
    readonly spell: string;
    readonly value: string;
  }) => string;
  readonly composedKindBoundWhenEvent: (p: {
    readonly kindBoundWhen: string | undefined;
    readonly event: StatusTriggerEvent;
  }) => string;
  readonly youOrItOr: (p: {
    readonly bearerIsCaster: boolean;
    readonly phrases: string;
    readonly phrases2: string;
  }) => string;
  readonly whenItOrOrAtOnce: (p: {
    readonly length: number;
    readonly death: string;
    readonly others: string;
  }) => string;
  readonly whenItOr: (p: { readonly on: string }) => string;
  readonly composedBearerIsCaster: (p: { readonly bearerIsCaster: boolean }) => string;
  readonly theNextTime: (p: { readonly doer: string }) => string;
  readonly composedEventWhenOf: (p: {
    readonly event: StatusTriggerEvent;
    readonly whenOf: string;
  }) => string;
  readonly wheneverYourArrowsOr: (p: { readonly on: string }) => string;
  readonly wheneverOnACreatureWithLessHealth: (p: {
    readonly doer: string;
    readonly victimHasLessHealth: true | undefined;
  }) => string;
  readonly and2: () => string;
  readonly andAnd: (p: { readonly when: string | undefined; readonly each: string }) => string;
  readonly youItAnd: (p: {
    readonly when: string;
    readonly bearerIsCaster: boolean;
    readonly answer: string;
  }) => string;
  readonly youAndAllPartyMembersAreHealed: (p: { readonly healed: string }) => string;
  readonly composedWhat: (p: { readonly what: string }) => string;
  readonly meleeHitsWithAMeleeAttackHits: (p: { readonly weapon: AttackWeaponClass }) => string;
  readonly meleeIsHitByAFoeS: (p: { readonly weapon: AttackWeaponClass }) => string;
  readonly with3: (p: {
    readonly event: StatusTriggerEvent;
    readonly weapon: AttackWeaponClass;
  }) => string;
  readonly youGainEnergy: (p: { readonly amount: string }) => string;
  readonly allYourSkillsAreRecharged: () => string;
  readonly yourPartyIsHealedFor: (p: { readonly amount: string }) => string;
  readonly takeDamage: (p: {
    readonly upTo: string;
    readonly amount: string;
    readonly type: DamageType;
  }) => string;
  readonly areHealedFor: (p: { readonly upTo: string; readonly amount: string }) => string;
  readonly composedUpToText: (p: { readonly upTo: string; readonly text: string }) => string;
  readonly ifTargetFoeDiesWhileHexedWith: (p: { readonly bearerIsFoe: boolean }) => string;
  readonly and3: (p: { readonly who: string; readonly flatMap: string }) => string;
  readonly hasASpellInterrupted: () => string;
  readonly isStruckForDamageWhileUsingA: (p: {
    readonly damageType: "elemental" | DamageType | "physical";
  }) => string;
  readonly takesDamageFromAFoe: (p: {
    readonly damageType: "elemental" | DamageType | "physical";
  }) => string;
  readonly takesMoreThanDamageFromAFoe: (p: { readonly minDamage: string }) => string;
  readonly hasItsHealthDroppedBelowByDamage: (p: { readonly healthBelow: string }) => string;
  readonly isMoreThanFromYou: (p: { readonly apartBeyond: string }) => string;
  readonly hitsWithAAttack: (p: { readonly chainRole: ChainRole }) => string;
  readonly isHitByAnAttackAAttack: (p: { readonly role: ChainRole | undefined }) => string;
  readonly blocksAAttack: (p: { readonly blocked: string }) => string;
  readonly losesAEnchantment: (p: { readonly name: string }) => string;
  readonly hex2: (p: { readonly scopeAdjective: string }) => string;
  readonly appliesAnAToAFoe: (p: { readonly test: boolean; readonly words: string }) => string;
  readonly spell: (p: { readonly type: SkillType | undefined }) => string;
  readonly onAllyAnAllyAFoe: (p: { readonly targets: string | undefined }) => string;
  readonly castsAnA: (p: {
    readonly test: boolean;
    readonly words: string;
    readonly on: string;
  }) => string;
  readonly non: (p: { readonly notType: SkillType }) => string;
  readonly elite: () => string;
  readonly adrenal: () => string;
  readonly skill: () => string;
  readonly isTargetedByYour: (p: { readonly words: string }) => string;
  readonly on: (p: { readonly targets: "ally" | "other-ally" | "foe" | undefined }) => string;
  readonly usesAnA: (p: {
    readonly test: boolean;
    readonly words: string;
    readonly on: string;
  }) => string;
  readonly health2: (p: { readonly amount: string }) => string;
  readonly energy3: (p: { readonly amount: string }) => string;
  readonly takeDamage2: (p: { readonly amount: string; readonly type: DamageType }) => string;
  readonly loseAllAllS: (p: {
    readonly value: string;
    readonly category: StatusCategory;
    readonly count: number | Magnitude | "all";
  }) => string;
  readonly all2: (p: { readonly side: string }) => string;
  readonly upTo: (p: { readonly maxTargets: string; readonly side: string }) => string;
  readonly withinOfThatCreature: (p: {
    readonly radius: number;
    readonly radius2: string;
  }) => string;
  readonly gain: (p: { readonly answer: string }) => string;
  readonly youGain: (p: {
    readonly when: string;
    readonly gains: boolean;
    readonly answers: string;
  }) => string;
  readonly onIt: () => string;
  readonly damageOnIt: (p: {
    readonly value: string;
    readonly amount: string;
    readonly type: DamageType;
    readonly perCount: string;
  }) => string;
  readonly composedWhenWhat: (p: { readonly when: string; readonly what: string }) => string;
  readonly itsAdjacentAllies: () => string;
  readonly itsAlliesWithin: (p: {
    readonly area: string | undefined;
    readonly radius: string;
  }) => string;
  readonly itsAdjacentAlliesItsAlliesWithin: (p: {
    readonly bearerIsFoe: boolean;
    readonly foesWithin: string;
    readonly only: string;
    readonly value: string;
  }) => string;
  readonly bearerBlocksMeleeMeleeProjectile: (p: { readonly on: string | undefined }) => string;
  readonly whenYouBlockYouAndAlliesAre: (p: {
    readonly area: string;
    readonly amount: string;
  }) => string;
  readonly eachBlockCostsYouEnergyOrThis: (p: { readonly amount: string }) => string;
  readonly youGainEnergyForEachSuccessfulAttack: (p: {
    readonly amount: string;
    readonly kind: string;
  }) => string;
  readonly wheneverYouBlockAAttackThisWay: (p: {
    readonly kind: string;
    readonly amount: string;
    readonly type: DamageType;
  }) => string;
  readonly withinOfYouFoes: (p: { readonly radius: number; readonly radius2: string }) => string;
  readonly ifYouBlockAAttackSufferFrom: (p: {
    readonly kind: string;
    readonly foes: string;
    readonly statusName: string;
    readonly resolveMagnitudeAtRanks: string;
  }) => string;
  readonly ifYouBlockAAttack: (p: {
    readonly kind: string;
    readonly foes: string;
    readonly text: string;
  }) => string;
  readonly stealsHealthFromThatFoe: (p: { readonly amount: string }) => string;
  readonly loses: (p: {
    readonly count: string;
    readonly count2: number | "all";
    readonly category: StatusCategory;
  }) => string;
  readonly itTakesDamage: (p: { readonly amount: string; readonly type: DamageType }) => string;
  readonly takeDamage3: (p: {
    readonly splashed: string;
    readonly amount: string;
    readonly type: DamageType;
  }) => string;
  readonly thatAttackIsInterruptedAndAnd: (p: {
    readonly when: string;
    readonly hurt: string;
  }) => string;
  readonly itIsInterruptedAndYouLoseEnergy: (p: {
    readonly when: string;
    readonly amount: string;
  }) => string;
  readonly ofThatSkillSBaseEnergyCost: (p: { readonly share: string }) => string;
  readonly energy4: (p: { readonly amount: string }) => string;
  readonly youAreHealedAreHealedIsHealed: (p: {
    readonly bearerIsCaster: boolean;
    readonly length: number;
  }) => string;
  readonly forOfThatSkillSEnergyCost: (p: {
    readonly healed: string;
    readonly share: string;
  }) => string;
  readonly forWord: (p: { readonly healed: string; readonly amount: string }) => string;
  readonly plus: () => string;
  readonly youGainGainsPlus: (p: {
    readonly bearerIsCaster: boolean;
    readonly gains: string;
  }) => string;
  readonly theNearestOf: (p: { readonly splashed: string }) => string;
  readonly upTo2: (p: { readonly maxTargets: string; readonly splashed: string }) => string;
  readonly itAndLoseEnergy: (p: { readonly others: string; readonly amount: string }) => string;
  readonly bearerFoesFoesOtherFoes: (p: { readonly to: string | undefined }) => string;
  readonly inTheAreaSufferItToo: (p: { readonly who: string }) => string;
  readonly ifASpellItThatSkill: (p: { readonly spellsOnly: boolean }) => string;
  readonly takesThisSkillSSlotForSeconds: (p: {
    readonly which: string;
    readonly seconds: string;
  }) => string;
  readonly youEnterTheSameStance: () => string;
  readonly youLoseEnergyOrThisEnds: (p: { readonly amount: string }) => string;
  readonly thatAttackIsInterrupted: (p: { readonly when: string }) => string;
  readonly takes: (p: { readonly dealt: string; readonly when: string }) => string;
  readonly bearerFatalDamageNegatedAnd: (p: {
    readonly on: StatusTriggerEvent;
    readonly when: string;
  }) => string;
  readonly theFoeWhoDealtItTakesDamage: (p: {
    readonly then: string;
    readonly amount: string;
    readonly type: DamageType;
  }) => string;
  readonly thatAttackerIsHealedFor: (p: {
    readonly when: string;
    readonly amount: string;
  }) => string;
  readonly bearerGainsEnchantmentEnchantmentHexOrEnchantment: (p: {
    readonly on: StatusTriggerEvent;
  }) => string;
  readonly theCasterOfThatTakesDamage: (p: {
    readonly when: string;
    readonly gained: string;
    readonly amount: string;
    readonly type: DamageType;
  }) => string;
  readonly theHealerTakesDamage: (p: {
    readonly when: string;
    readonly amount: string;
    readonly type: DamageType;
  }) => string;
  readonly ofThatTarget: (p: {
    readonly upTo: string;
    readonly what: string;
    readonly paid: string;
  }) => string;
  readonly healsItsCasterFor: (p: { readonly amount: string; readonly when: string }) => string;
  readonly itsCasterGainsEnergy: (p: { readonly amount: string; readonly when: string }) => string;
  readonly theNextSkillYouUseItUses: (p: {
    readonly bearerIsCaster: boolean;
    readonly seconds: string;
  }) => string;
  readonly itsCasterStealsHealth: (p: { readonly amount: string; readonly when: string }) => string;
  readonly theNearestOfTakes: (p: { readonly allies: string }) => string;
  readonly take: (p: { readonly allies: string }) => string;
  readonly upToTake: (p: { readonly maxTargets: string; readonly allies: string }) => string;
  readonly composedAlliesText: (p: { readonly allies: string; readonly text: string }) => string;
  readonly onAFoe: (p: { readonly when: string }) => string;
  readonly adjacentToYou: () => string;
  readonly withinAroundYou: (p: {
    readonly area: string | undefined;
    readonly radius: string;
  }) => string;
  readonly otherAdjacentToYouWithinAroundYou: (p: {
    readonly includesCentre: true | undefined;
    readonly hits:
      | "foes"
      | "foe-creatures"
      | "foe-minions"
      | "allies"
      | "non-spirit-allies"
      | "party"
      | "own-spirits"
      | "own-minions"
      | "allied-minions";
    readonly value: string;
  }) => string;
  readonly takeDamage4: (p: {
    readonly yours: string;
    readonly reached: string;
    readonly amount: string;
    readonly type: DamageType;
  }) => string;
  readonly composedYoursReachedText: (p: {
    readonly yours: string;
    readonly reached: string;
    readonly text: string;
  }) => string;
  readonly composedBearerIsCasterSaid: (p: {
    readonly bearerIsCaster: boolean;
    readonly said: string;
  }) => string;
  readonly composedWhenConditionText: (p: {
    readonly when: string;
    readonly condition: string;
    readonly text: string;
  }) => string;
  readonly bearer: (p: {
    readonly target: string | undefined;
    readonly bearer: string;
    readonly text: string;
  }) => string;
  readonly nextAttackSkill: (p: {
    readonly statusName: string;
    readonly durationSeconds: string;
  }) => string;
  readonly nextAttackSkill2: (p: { readonly text: string }) => string;
  readonly skillTargetAroundItsTarget: (p: { readonly at: string | undefined }) => string;
  readonly withYourNext: (p: {
    readonly next: string;
    readonly around: string;
    readonly text: string;
  }) => string;
  readonly costsCostEnergy: (p: { readonly one: boolean; readonly energyBase: string }) => string;
  readonly costsCostLessEnergy: (p: {
    readonly one: boolean;
    readonly energyPercentOff: string;
  }) => string;
  readonly costsCostLessEnergyMinimum: (p: {
    readonly one: boolean;
    readonly energyDiscount: string;
    readonly energyFloor: string;
  }) => string;
  readonly costsCostMoreEnergy: (p: {
    readonly one: boolean;
    readonly energySurcharge: string;
  }) => string;
  readonly castsCastInstantly: (p: { readonly one: boolean }) => string;
  readonly castsCastFaster: (p: {
    readonly one: boolean;
    readonly activationMultiplier: string;
  }) => string;
  readonly takesTakeAsLongToCast: (p: {
    readonly one: boolean;
    readonly activationMultiplier: string;
  }) => string;
  readonly castsCastFaster2: (p: {
    readonly one: boolean;
    readonly activationSecondsLess: string;
  }) => string;
  readonly rechargesRechargeFaster: (p: {
    readonly one: boolean;
    readonly rechargeFaster: string;
  }) => string;
  readonly rechargesRechargeSlower: (p: {
    readonly one: boolean;
    readonly rechargeSlower: string;
  }) => string;
  readonly lastsLastLongerShorter: (p: {
    readonly one: boolean;
    readonly durationMultiplier: string;
    readonly durationMultiplier2: number;
  }) => string;
  readonly healsHealLessMoreNotTheDivine: (p: {
    readonly one: boolean;
    readonly value: string;
    readonly healMultiplier: number;
    readonly sparesDivineFavor: boolean;
  }) => string;
  readonly isAreNotEasilyInterrupted: (p: { readonly one: boolean }) => string;
  readonly overcastYouBy: (p: { readonly overcastPerUse: string }) => string;
  readonly andAttack: (p: { readonly chainRoles: string }) => string;
  readonly attackSkillSkill: (p: {
    readonly weapon: AttackWeaponClass | undefined;
    readonly type: SkillType | undefined;
  }) => string;
  readonly hexHexesS: (p: { readonly one: boolean; readonly kind: string }) => string;
  readonly thatTargetsAFoeThatTargetA: (p: { readonly one: boolean }) => string;
  readonly thatTargetsYouThatTargetYou: (p: { readonly one: boolean }) => string;
  readonly halfRanged: () => string;
  readonly notFlashEnchantments: (p: { readonly notFlash: boolean }) => string;
  readonly whileHoldingAnItem2: (p: { readonly whileHoldingItem: boolean }) => string;
  readonly nextNext: (p: {
    readonly one: boolean;
    readonly whose: string;
    readonly uses: string;
  }) => string;
  readonly cannotBeInterrupted: () => string;
  readonly cannotBeBlocked: () => string;
  readonly costsLessEnergy: (p: { readonly energyDiscount: string }) => string;
  readonly castsInstantly: () => string;
  readonly rechargesInstantly: () => string;
  readonly s2: (p: { readonly value: string }) => string;
  readonly takesSLongerToRecharge: (p: { readonly extraRechargeSeconds: string }) => string;
  readonly yourNextAnd: (p: { readonly NEXT_SKILL_KIND: string; readonly does: string }) => string;
  readonly youLoseAllEnergyAsItIs: () => string;
  readonly youGainOfItsEnergyCost: (p: { readonly energyGainOfCost: string }) => string;
  readonly itRechargesFaster: (p: { readonly fraction: string }) => string;
  readonly rechargesInstantly2: (p: { readonly name: string }) => string;
  readonly forYourNextSkill: () => string;
  readonly ifItIsAAnd: (p: { readonly kind: string; readonly does: string }) => string;
  readonly suffer: (p: { readonly sufferedWhat: string }) => string;
  readonly forWord2: (p: {
    readonly statusName: string;
    readonly durationSeconds: string;
    readonly status: string;
  }) => string;
  readonly a: (p: { readonly owners: string; readonly category: StatusCategory }) => string;
  readonly ifItInterruptsASkill: () => string;
  readonly ifThatActionWasASpell: () => string;
  readonly ifThatActionWasAnAttack: () => string;
  readonly ifItKillsTheTarget: () => string;
  readonly ifItResurrects: () => string;
  readonly ifASpiritDiedInThisWay: () => string;
  readonly ifWasRemoved: (p: { readonly category: StatusCategory }) => string;
  readonly ifItRemoves: (p: { readonly category: StatusCategory }) => string;
  readonly ifTargetIsBelowHealth: (p: { readonly fraction: string }) => string;
  readonly ifTargetIsAboveHealth: (p: { readonly fraction: string }) => string;
  readonly ifYouHaveLessThanHealth: (p: { readonly fraction: string }) => string;
  readonly ifYouHaveLessHealthThanYour: () => string;
  readonly ifYourPetHasLessHealthThan: () => string;
  readonly ifItFollowsOffHandAnOff: (p: { readonly role: ChainRole }) => string;
  readonly ifTargetHas: (p: { readonly filteredCategory: string }) => string;
  readonly ifTargetHasOr: (p: { readonly categories: string }) => string;
  readonly ifYouHave: (p: { readonly category: StatusCategory }) => string;
  readonly ifYouHaveA: (p: { readonly name: string; readonly category: StatusCategory }) => string;
  readonly other: (p: { readonly excluding: StatusId | undefined }) => string;
  readonly ifYouHaveNo: (p: {
    readonly other: string;
    readonly category: StatusCategory;
  }) => string;
  readonly ifYouHaveNo2: (p: {
    readonly other: string;
    readonly name: string;
    readonly category: StatusCategory;
  }) => string;
  readonly ifTargetIsCastingASpellOr: (p: { readonly orChant: true | undefined }) => string;
  readonly ifTargetIsUsingASkill: () => string;
  readonly ifTargetHasNoOtherHex: (p: { readonly name: string }) => string;
  readonly ifTargetIsNotAdjacentToAny: () => string;
  readonly ifTargetIsNotNearAnyAllies: () => string;
  readonly ifTargetHasNoAlliesWithin: (p: { readonly radius: string }) => string;
  readonly ifTargetIsNearAnyOfYour: () => string;
  readonly ifAnyOfYourAlliesIsWithin: (p: { readonly radius: string }) => string;
  readonly ifTargetIsWithinEarshot: () => string;
  readonly ifTargetIsWithinOfYou: (p: { readonly radius: string }) => string;
  readonly ifTargetIsNotMoving: () => string;
  readonly ifTargetIsKnockedDown: () => string;
  readonly ifTargetIsMoving: () => string;
  readonly ifTargetIsAFoe: () => string;
  readonly ifTargetIsMovingFasterThanNormal: () => string;
  readonly ifAnyFoeIsKnockedDownIf: (p: {
    readonly knockedDown: true | undefined;
    readonly where: string;
  }) => string;
  readonly ifYouHitOrMoreFoes: (p: { readonly atLeast: string }) => string;
  readonly ifNumberOrMore: (p: { readonly countAll: string; readonly atLeast: string }) => string;
  readonly ifAreNoMoreThan: (p: {
    readonly countAll: string;
    readonly countAll2: string;
  }) => string;
  readonly ifTargetHas2: (p: { readonly statusName: string }) => string;
  readonly ifTargetDoesNotHave: (p: { readonly statusName: string }) => string;
  readonly ifYouHaveMoreEnergyThanTarget: () => string;
  readonly ifYouHaveLessThanEnergy: (p: { readonly amount: string }) => string;
  readonly ifYouAreOvercast: () => string;
  readonly ifYouWield: (p: { readonly weapon: AttackWeaponClass }) => string;
  readonly ifYouHoldAShield: () => string;
  readonly ifYouAreHoldingAnItem: () => string;
  readonly ifTargetHasLessHealthThanYou: () => string;
  readonly ifTargetHasMoreHealthThanYou: () => string;
  readonly ifTargetIsAttacking: () => string;
  readonly ifTargetIsNotAttacking: () => string;
  readonly ifTargetIsCastingASpellOr2: () => string;
  readonly ifTargetIsASummonedCreature: () => string;
  readonly ifNoSpiritIsWithinOfYou: (p: {
    readonly radius: number;
    readonly radius2: string;
  }) => string;
  readonly ifASpiritIsWithinOfYou: (p: {
    readonly radius: number;
    readonly radius2: string;
  }) => string;
  readonly ifYouControlOrFewerS: (p: {
    readonly count: string;
    readonly creature: string;
  }) => string;
  readonly ifASpiritOrACorpseIs: (p: {
    readonly radius: number;
    readonly radius2: string;
  }) => string;
  readonly ifAnAllyIsDeadWithin: (p: {
    readonly radius: number;
    readonly radius2: string;
  }) => string;
  readonly ifTargetIsNearACorpseOr: () => string;
  readonly ifTargetIsWithinOfACorpse: (p: { readonly radius: string }) => string;
  readonly composedType: (p: { readonly type: DamageType | undefined }) => string;
  readonly healthForEachAllyMax: (p: {
    readonly amount: string;
    readonly area: string;
    readonly max: string;
  }) => string;
  readonly allPartyMembers: () => string;
  readonly allItsPartyMembers: () => string;
  readonly allAlliedMinions: () => string;
  readonly yourOtherMinions: () => string;
  readonly within2: (p: {
    readonly Who: string;
    readonly area: string | undefined;
    readonly radius: string;
  }) => string;
  readonly adjacent: (p: { readonly who: string }) => string;
  readonly nearby: (p: { readonly who: string }) => string;
  readonly within3: (p: {
    readonly area: string | undefined;
    readonly Who: string;
    readonly radius: string;
  }) => string;
  readonly loseThatSame: (p: { readonly category: StatusCategory }) => string;
  readonly loseAllAll: (p: { readonly category: StatusCategory }) => string;
  readonly onThem: () => string;
  readonly loseOneForEachOnThem: (p: {
    readonly category: StatusCategory;
    readonly countEach: string;
  }) => string;
  readonly lose: (p: {
    readonly count: string;
    readonly count2: number;
    readonly category: StatusCategory;
  }) => string;
  readonly enchantmentAnA: (p: { readonly onlyBearing: StatusCategory | undefined }) => string;
  readonly with4: (p: {
    readonly onlyBearing: StatusCategory | undefined;
    readonly article: string;
  }) => string;
  readonly usingSkills: (p: { readonly onlyUsing: SkillType | undefined }) => string;
  readonly dead: (p: { readonly dead: true | undefined; readonly living: string }) => string;
  readonly targetAndCasterAroundYouCasterAround: (p: {
    readonly includesCentre: true | undefined;
    readonly reached: string;
    readonly around: string | undefined;
    readonly alsoAround: string | undefined;
    readonly bearing: string;
    readonly using: string;
    readonly onlyIf: string;
  }) => string;
  readonly upTo3: (p: { readonly maxTargets: string; readonly who: string }) => string;
  readonly inItsRange: () => string;
  readonly inTheArea: () => string;
  readonly foes: () => string;
  readonly allEveryoneYouAndAlliesAllies: (p: {
    readonly affects: string | undefined;
    readonly includesCaster: boolean;
  }) => string;
  readonly enemiesFoesAllEveryoneYouAndAllies: (p: {
    readonly value: string;
    readonly radius: number;
    readonly radius2: string;
  }) => string;
  readonly whenSprung: () => string;
  readonly after: (p: { readonly delaySeconds: number }) => string;
  readonly everyFor: (p: { readonly everySeconds: number; readonly count: number }) => string;
  readonly whenItEnds: (p: { readonly whom: string }) => string;
  readonly springsByItselfAsItsTimeRuns: () => string;
  readonly composedWhoText: (p: { readonly who: string; readonly text: string }) => string;
  readonly composedEndingText: (p: { readonly ending: string; readonly text: string }) => string;
  readonly composedConditionText: (p: {
    readonly condition: string;
    readonly text: string;
  }) => string;
  readonly itsAttacksDealDamage: (p: { readonly magnitude: string }) => string;
  readonly thisSpiritLosesHealth: (p: { readonly magnitude: string }) => string;
  readonly composedCondition: (p: { readonly condition: string }) => string;
  readonly itsAttacks: (p: { readonly when: string; readonly what: string }) => string;
  readonly health3: (p: { readonly health: string }) => string;
  readonly health4: (p: { readonly health: string; readonly health2: string }) => string;
  readonly level: (p: { readonly marked: string }) => string;
  readonly lastsSeconds: (p: { readonly durationSeconds: string }) => string;
  readonly composedCountNameLevelTextHealthTextLasts: (p: {
    readonly count: string;
    readonly name: string;
    readonly levelText: string;
    readonly healthText: string;
    readonly lasts: string;
  }) => string;
  readonly itsAttacksDealDamage2: (p: { readonly value: string }) => string;
  readonly onlyOneAtATimeANew: () => string;
  readonly leavesCorpseCorpsesWhenItDies: (p: {
    readonly corpses: string;
    readonly current: number;
  }) => string;
  readonly whenItDiesStandsUpInIts: (p: { readonly text: string }) => string;
  readonly listSemicolon: () => string;
  readonly inItsRange2: (p: { readonly radius: number }) => string;
  readonly composedAffectsWhere: (p: {
    readonly affects: "all" | "foes" | "allies";
    readonly where: string;
  }) => string;
  readonly whenItDiesUnderHealthBeginFor: (p: {
    readonly who: string;
    readonly below: string;
    readonly statusName: string;
    readonly duration: string;
  }) => string;
  readonly whenItDiesDeadPartyMembersAre: (p: {
    readonly where: string;
    readonly health: string;
  }) => string;
  readonly damageTakeDamageAreHealedForHealth: (p: {
    readonly effect: string | undefined;
    readonly amount: string;
  }) => string;
  readonly max: (p: { readonly max: string }) => string;
  readonly whenItDiesPerSecondItLived: (p: {
    readonly who: string;
    readonly what: string;
    readonly max: string;
  }) => string;
  readonly everySecondsHealsTheMostHurtNon: (p: {
    readonly everySeconds: string;
    readonly where: string;
    readonly heal: string;
  }) => string;
  readonly whenANonSpiritDiesInIts: () => string;
  readonly nearby2: (p: { readonly radius: number }) => string;
  readonly itsConditionsSpreadToEachNonSpirit: (p: {
    readonly when: string;
    readonly where: string;
  }) => string;
  readonly eachOfItsTypeInItsRange: (p: {
    readonly when: string;
    readonly below: string;
    readonly damage: string;
  }) => string;
  readonly holdingAnItem: (p: { readonly onlyWhileHoldingItem: boolean }) => string;
  readonly composedWhoWhereHoldingStatus: (p: {
    readonly who: string;
    readonly where: string;
    readonly holding: string;
    readonly status: string;
  }) => string;
  readonly perFoeHit: (p: { readonly perTarget: true | undefined }) => string;
  readonly forEachMeleeAttackSkillOnYour: (p: { readonly max: string }) => string;
  readonly withinEarshot: (p: { readonly radius: number; readonly area: string }) => string;
  readonly forEverySummonedCreatureYouControlMaximum: (p: {
    readonly where: string;
    readonly max: string;
  }) => string;
  readonly composedZeroAloneEachText: (p: {
    readonly zero: boolean;
    readonly alone: string;
    readonly each: string;
    readonly text: string;
  }) => string;
  readonly maximum: (p: { readonly max: string }) => string;
  readonly forEach: (p: { readonly countEach: string; readonly max: string }) => string;
  readonly pointOfEnergyGained: () => string;
  readonly pointOfEnergyRestrictedByOvercast: () => string;
  readonly skillDisabledInThisWay: () => string;
  readonly orCasterOnYou: (p: {
    readonly categories: string;
    readonly on: string | undefined;
    readonly onTarget: string;
  }) => string;
  readonly ofYourRecharging: (p: { readonly rechargingSkillsNoun: string }) => string;
  readonly pointOfEnergyCasterYouHaveThey: (p: { readonly on: string | undefined }) => string;
  readonly orRemoved: (p: { readonly categories: string }) => string;
  readonly orLost: (p: { readonly name: string; readonly categories: string }) => string;
  readonly enchantmentYouAreMaintaining: () => string;
  readonly secondItWasInEffect: () => string;
  readonly foeKnockedDown: () => string;
  readonly youHaveEquipped: (p: { readonly type: SkillType }) => string;
  readonly adrenalineSkillTheyHave: () => string;
  readonly foeHit: () => string;
  readonly within4: (p: {
    readonly perCountNoun: string;
    readonly radius: number;
    readonly radius2: string;
  }) => string;
  readonly attacksSkillsS: (p: {
    readonly weapon: AttackWeaponClass | undefined;
    readonly type: SkillType | undefined;
  }) => string;
  readonly casterYourTargetS: (p: { readonly on: string | undefined }) => string;
  readonly s3: (p: { readonly perCountNoun: string }) => string;
  readonly pointOfOvercast: () => string;
  readonly skillDisabled: () => string;
  readonly rechargingSkill: () => string;
  readonly pointOfEnergy: () => string;
  readonly removedOr: (p: { readonly categories: string }) => string;
  readonly removedOr2: (p: { readonly name: string; readonly categories: string }) => string;
  readonly maintainedEnchantment: () => string;
  readonly secondHeld: () => string;
  readonly adrenalineSkill: () => string;
  readonly deadAlly: () => string;
  readonly knockedDownFoeFoe: (p: { readonly knockedDown: true | undefined }) => string;
  readonly ally: () => string;
  readonly neverAbove: (p: { readonly upTo: string }) => string;
  readonly forEachRemoved: (p: {
    readonly toTarget: true | undefined;
    readonly perRemoved: StatusCategory | undefined;
  }) => string;
  readonly perPointLost: (p: { readonly perEnergyLost: true | undefined }) => string;
  readonly armorPenetration: (p: { readonly armorPenetration: string }) => string;
  readonly dealsDamage2: (p: {
    readonly magnitude: string;
    readonly type: DamageType;
    readonly perPointLost: string;
    readonly penetration: string;
  }) => string;
  readonly deals: () => string;
  readonly damage2: (p: { readonly type: DamageType }) => string;
  readonly composedCountedConditionAmount: (p: {
    readonly counted: string;
    readonly condition: string;
    readonly amount: string;
  }) => string;
  readonly gainHealthEqualToThisSpellS: () => string;
  readonly healsIfRelievedOf: (p: { readonly amount: string; readonly name: string }) => string;
  readonly healsForOfYourCurrentHealthMaximum: (p: {
    readonly magnitude: string;
    readonly max: string;
  }) => string;
  readonly youGainHealth: (p: { readonly amount: string }) => string;
  readonly yourPetGainsHealth: (p: { readonly amount: string }) => string;
  readonly ownerHealsItsOwnerForHealsFor: (p: {
    readonly recipient: string | undefined;
    readonly amount: string;
  }) => string;
  readonly healsForEachRemovedHealsForEach: (p: {
    readonly perRemoved: StatusCategory | undefined;
    readonly amount: string;
    readonly perDestroyedSpirit: true | undefined;
    readonly perEnergyLost: true | undefined;
    readonly recipient: string | undefined;
    readonly perUsedSkillEnergy: true | undefined;
    readonly magnitude: string;
    readonly value: string;
  }) => string;
  readonly casterYouGainHeals: (p: { readonly recipient: string | undefined }) => string;
  readonly health5: () => string;
  readonly casterOnTargetFoeOnThem: (p: { readonly recipient: string | undefined }) => string;
  readonly underHealth: (p: { readonly onlyBelowHealthFraction: string }) => string;
  readonly gainOfTheSkillSBaseEnergy: (p: { readonly magnitude: string }) => string;
  readonly targetGainsOwnerYouGainGain: (p: {
    readonly toTarget: true | undefined;
    readonly recipient: string | undefined;
  }) => string;
  readonly energy5: (p: {
    readonly gains: string;
    readonly magnitude: string;
    readonly perPointLost: string;
    readonly perFoeHit: string;
    readonly perOwnCreature: string;
    readonly perRemoved: string;
  }) => string;
  readonly energy6: () => string;
  readonly gain2: () => string;
  readonly onTargetFoe: () => string;
  readonly strikeStrikesOfAdrenalineAdrenaline: (p: {
    readonly units: boolean;
    readonly magnitude: string;
    readonly current: number;
  }) => string;
  readonly youGain2: () => string;
  readonly targetTargetGainsGain: (p: { readonly recipient: string | undefined }) => string;
  readonly strikesOfAdrenaline: () => string;
  readonly targetRegainsAllEnergy: () => string;
  readonly casterYouLoseTargetLoses: (p: { readonly on: string | undefined }) => string;
  readonly energy7: (p: { readonly who: string; readonly magnitude: string }) => string;
  readonly stealsUpToEnergy: (p: { readonly magnitude: string }) => string;
  readonly stealsUpToHealth: (p: { readonly magnitude: string }) => string;
  readonly youStealHealth: (p: { readonly magnitude: string }) => string;
  readonly youSacrificeOfYourMaximumHealth: (p: { readonly percentOfMax: string }) => string;
  readonly targetFoeLosesHealth: (p: { readonly magnitude: string }) => string;
  readonly targetFoeLoses: () => string;
  readonly youLoseHealth: (p: { readonly magnitude: string }) => string;
  readonly forEachEnchantmentRemoved: (p: {
    readonly lose: string;
    readonly whose: string;
  }) => string;
  readonly loseAllButHealth: (p: { readonly magnitude: string }) => string;
  readonly transferOfYourConditionsToFoes: (p: {
    readonly magnitude: string;
    readonly foesWithin: string;
  }) => string;
  readonly max2: (p: { readonly maxSeconds: number | undefined }) => string;
  readonly withTheTimeEachHasLeft: () => string;
  readonly withMoreTime: (p: { readonly extend: string; readonly max: string }) => string;
  readonly foesGetTheTargetSConditionsWith: (p: {
    readonly foesWithin: string;
    readonly value: string;
  }) => string;
  readonly loseYourHealthHealForOfIt: (p: {
    readonly fractionOfCurrent: number;
    readonly magnitude: string;
  }) => string;
  readonly whoeverOfYouAndTargetFoeHas: () => string;
  readonly stacksOnceForEachOnThem: (p: { readonly countEach: string }) => string;
  readonly stacksOnceForEachOnThem2: (p: {
    readonly status: string;
    readonly value: string;
  }) => string;
  readonly forWord3: (p: { readonly durationSeconds: string; readonly what: string }) => string;
  readonly forEachHexRemoved: (p: { readonly name: string }) => string;
  readonly stackingOnceForEachOnThem: (p: { readonly countEach: string }) => string;
  readonly appliesCasterToYouForUntilIt: (p: {
    readonly statusName: string;
    readonly on: string | undefined;
    readonly ends: boolean;
    readonly statusDuration: string;
    readonly status: string;
    readonly value: string;
    readonly value2: string;
  }) => string;
  readonly composedStatusNameDurationSeconds: (p: {
    readonly statusName: string;
    readonly durationSeconds: string;
  }) => string;
  readonly appliesOneOfAtRandom: (p: { readonly choices: string }) => string;
  readonly maintainedCasterOnYouEnergyRegenerationWhile: (p: {
    readonly on: string | undefined;
    readonly what: string;
  }) => string;
  readonly losesThatSame: (p: { readonly category: StatusCategory }) => string;
  readonly casterLoseRemoves: (p: { readonly from: string | undefined }) => string;
  readonly oneForEachRemovedMax: (p: {
    readonly verb: string;
    readonly category: StatusCategory;
    readonly category2: StatusCategory;
    readonly max: string;
  }) => string;
  readonly oneForEachOnTarget: (p: {
    readonly verb: string;
    readonly category: StatusCategory;
    readonly countEach: string;
  }) => string;
  readonly lose2: (p: {
    readonly count: string;
    readonly whose: string;
    readonly count2: number | "all";
    readonly category: StatusCategory;
  }) => string;
  readonly endsTheTargetSStance: () => string;
  readonly forEachSpiritWithinOfIt: (p: {
    readonly near: number;
    readonly near2: string;
  }) => string;
  readonly numberUpTo: (p: { readonly count: number | "all" }) => string;
  readonly and4: (p: {
    readonly orCategory: StatusCategory | undefined;
    readonly count: number | "all";
  }) => string;
  readonly removes: (p: {
    readonly upTo: string;
    readonly count: string;
    readonly whose: string;
    readonly count2: number | "all";
    readonly category: StatusCategory;
    readonly and: string;
    readonly perSpirit: string;
  }) => string;
  readonly interruptsTheTargetSSpellIfThey: () => string;
  readonly interruptsTheTargetSSpellOrChant: () => string;
  readonly skillInterruptsTheTargetSSkillIf: (p: { readonly only: string | undefined }) => string;
  readonly youAreKnockedDownFor: (p: { readonly durationSeconds: number }) => string;
  readonly knocksDownFor: (p: { readonly durationSeconds: number }) => string;
  readonly shadowStepsToTheTarget: () => string;
  readonly youAndTheTargetShadowStepTo: () => string;
  readonly corpseTeleportsYouToThatCorpseShadow: (p: { readonly to: string | undefined }) => string;
  readonly health6: (p: { readonly percent: string }) => string;
  readonly upToYourCurrentHealthYourHealth: (p: {
    readonly casterLosesFractionOfCurrent: number;
  }) => string;
  readonly perPartyMemberWithin: (p: {
    readonly radius: number;
    readonly radius2: string;
  }) => string;
  readonly casterAndTeleportsTheTargetToYou: (p: { readonly at: string | undefined }) => string;
  readonly returnsTheTargetToLifeWithAnd: (p: {
    readonly healthText: string;
    readonly energy: string;
    readonly per: string;
    readonly teleport: string;
  }) => string;
  readonly returnsEveryDeadAlliedPetToLife: (p: {
    readonly where: string;
    readonly health: string;
  }) => string;
  readonly youLoseAllYourRemainingEnergy: () => string;
  readonly youGainFor: (p: {
    readonly statusName: string;
    readonly durationSeconds: number;
    readonly status: string;
  }) => string;
  readonly yourPetGainsFor: (p: {
    readonly statusName: string;
    readonly duration: string;
    readonly status: string;
  }) => string;
  readonly yourPetMovesToYourTargetAnd: () => string;
  readonly teleportsTargetToYou: () => string;
  readonly destroysTargetAlliedSpirit: () => string;
  readonly destroysTargetMinion: () => string;
  readonly nearestSpiritLosesHealthTargetAllyIs: (p: {
    readonly magnitude: string;
    readonly healPerPoint: string;
  }) => string;
  readonly nearestSpiritLosesAllEnergyYouGain: (p: { readonly magnitude: string }) => string;
  readonly itsOwnerGainsHealthEqualToThe: () => string;
  readonly destroysEveryAlliedSpiritWithin: (p: {
    readonly radius: number;
    readonly radius2: string;
  }) => string;
  readonly thisSkillRecharges: () => string;
  readonly secondsFaster: () => string;
  readonly thisSkillRechargesInstantly: () => string;
  readonly thisSkillRechargesFaster: (p: { readonly fraction: string }) => string;
  readonly usedSkillThatSkillRechargesInstantlyThis: (p: {
    readonly of: string | undefined;
  }) => string;
  readonly loseAllAdrenaline: () => string;
  readonly rechargesAllYourOtherSkills: () => string;
  readonly rechargesAllYourStances: () => string;
  readonly rechargesAllYourOtherSkills2: (p: { readonly which: string }) => string;
  readonly rechargesAllYour: (p: { readonly rechargedKind: string }) => string;
  readonly allOfYourSpiritsDie: () => string;
  readonly summonsPlusOnePerCorpseExploited: (p: {
    readonly text: string;
    readonly perExploitedCorpse: true | undefined;
  }) => string;
  readonly setsATrap: () => string;
  readonly pulseTargetCreatesASymbolMarksThe: (p: {
    readonly kind: string | undefined;
    readonly anchor: string | undefined;
  }) => string;
  readonly forSeconds: (p: {
    readonly what: string;
    readonly where: string;
    readonly magnitude: string;
  }) => string;
  readonly seconds3: (p: { readonly magnitude: string }) => string;
  readonly forEachSignetYouHaveEquipped: (p: { readonly perOwnSignet: true | undefined }) => string;
  readonly allOfTheTargetSSkillsAre: (p: { readonly time: string }) => string;
  readonly theTargetSEliteSkillIsDisabled: (p: { readonly time: string }) => string;
  readonly oneOfTheTargetSSpellsAt: (p: { readonly time: string }) => string;
  readonly allOfTheTargetSAttackSkills: (p: { readonly time: string }) => string;
  readonly theInterruptedSkillIsDisabledFor: (p: {
    readonly time: string;
    readonly perSignet: string;
  }) => string;
  readonly centreInterruptedHoldingThatSkillHaveIt: (p: {
    readonly which: string | undefined;
    readonly time: string;
  }) => string;
  readonly thisSkillBecomesTheOneYouRemoved: (p: { readonly seconds: string }) => string;
  readonly thisSkillBecomesThatRandomSpellSpell: (p: {
    readonly which: string | undefined;
  }) => string;
  readonly thisSkillBecomesItsTargetSNon: (p: { readonly magnitude: string }) => string;
  readonly takeControlOfTargetEnemySpirit: () => string;
  readonly becomeYourMinionsWhileYouBear: (p: { readonly name: string }) => string;
  readonly targetMinionWithAMasterBecomesMasterless: (p: { readonly magnitude: string }) => string;
  readonly leadCountsAsALeadAttackCounts: (p: { readonly role: string | undefined }) => string;
  readonly targetSuffersOvercast: (p: { readonly magnitude: string }) => string;
  readonly thisSkillThisSkillThatSkill: (p: { readonly of: string | undefined }) => string;
  readonly forEachRemoved2: (p: {
    readonly perRemoved: StatusCategory | undefined;
    readonly value: 1;
  }) => string;
  readonly takesSecondsLongerToRecharge: (p: {
    readonly which: string;
    readonly magnitude: string;
    readonly each: string;
  }) => string;
  readonly that: (p: { readonly onlyIf: string }) => string;
  readonly ifItStrikesAFoe: (p: { readonly whom: string; readonly text: string }) => string;
  readonly from: (p: { readonly text: string; readonly from: string }) => string;
  readonly takeDamageForEachPointOfEnergy: (p: {
    readonly amount: string;
    readonly type: DamageType;
    readonly perEnergyLost: true | undefined;
  }) => string;
  readonly areInterruptedAreInterruptedIfCasting: (p: {
    readonly only: string | undefined;
  }) => string;
  readonly areKnockedDownForS: (p: { readonly durationSeconds: string }) => string;
  readonly foesFoeCreaturesGain: (p: {
    readonly hits: string | undefined;
    readonly suffered: string;
    readonly sufferedWhat: string;
  }) => string;
  readonly gainHealthEqualToThisSpellS2: () => string;
  readonly gain3: (p: { readonly text: string }) => string;
  readonly gainHealth: (p: { readonly amount: string }) => string;
  readonly loseHealth: (p: { readonly amount: string }) => string;
  readonly youFromEach: (p: { readonly text: string }) => string;
  readonly transferAllTheirConditionsToYou: () => string;
  readonly resurrect: (p: { readonly kind: string | undefined; readonly text: string }) => string;
  readonly and5: (p: {
    readonly length: number;
    readonly last: string | undefined;
    readonly parts: string;
    readonly last2: string;
  }) => string;
  readonly perAlliedMinionsOwnMinionsMinionOne: (p: {
    readonly text: string;
    readonly hits: string | undefined;
  }) => string;
  readonly per: (p: { readonly perCountNoun: string }) => string;
  readonly damage3: (p: {
    readonly amount: string;
    readonly type: DamageType;
    readonly each: string;
  }) => string;
  readonly healHealsEnergy: (p: {
    readonly kind: string | undefined;
    readonly amount: string;
    readonly each: string;
  }) => string;
  readonly drainsEnergy: (p: { readonly magnitude: string }) => string;
  readonly stealsEnergy: (p: { readonly magnitude: string }) => string;
  readonly stealsHealth: (p: { readonly magnitude: string }) => string;
  readonly resurrectsEnergy: (p: { readonly energy: string }) => string;
  readonly resurrectsHealth: (p: { readonly health: string }) => string;
  readonly resurrectsPetsHealth: (p: { readonly health: string }) => string;
  readonly healsOfYourHealth: (p: {
    readonly percent: string;
    readonly fractionOfCurrent: number;
  }) => string;
  readonly balancesHealthWithTargetFoe: () => string;
  readonly allUpTo: (p: {
    readonly current: number;
    readonly Infinity: number;
    readonly moving: string;
  }) => string;
  readonly andFoesWithinOfIt: (p: {
    readonly copyToFoesWithin: number;
    readonly copyToFoesWithin2: string;
  }) => string;
  readonly withOfTheirRemainingDurations: (p: { readonly durationMultiplier: string }) => string;
  readonly movesConditionsFromFoesWithinOfIt: (p: {
    readonly count: string;
    readonly lasting: string;
    readonly foesWithin: number;
    readonly foesWithin2: string;
  }) => string;
  readonly casterMovesOfYourConditionsToThe: (p: {
    readonly from: string | undefined;
    readonly count: string;
    readonly lasting: string;
    readonly copies: string;
  }) => string;
  readonly youAreHealedForForEach: (p: {
    readonly moves: string;
    readonly magnitude: string;
  }) => string;
  readonly areDisabledForSeconds: (p: { readonly seconds: string }) => string;
  readonly allOfYourSkills: (p: { readonly time: string }) => string;
  readonly allOfYourOtherSkills: (p: { readonly time: string }) => string;
  readonly allOfYourOtherNonAttackSkills: (p: { readonly time: string }) => string;
  readonly allOfYourOtherAttackSkillsYour: (p: {
    readonly exceptWeapon: AttackWeaponClass | undefined;
    readonly time: string;
  }) => string;
  readonly allOfYourNonAttackSkills: (p: { readonly time: string }) => string;
  readonly s4: (p: { readonly type: SkillType }) => string;
  readonly yourAnd: (p: { readonly types: string; readonly time: string }) => string;
  readonly allOfYourSpells: (p: { readonly time: string }) => string;
  readonly allOfYourOther: (p: {
    readonly others: boolean;
    readonly name: string;
    readonly time: string;
  }) => string;
  readonly exceptAnd: (p: { readonly length: number; readonly except: string }) => string;
  readonly allOfYourNonSkills: (p: {
    readonly name: string;
    readonly exceptText: string;
    readonly time: string;
  }) => string;
  readonly yourWholeParty: () => string;
  readonly composedAffectsWhere2: (p: {
    readonly affects: "all" | "allies" | "enemies";
    readonly where: string;
  }) => string;
  readonly radius: (p: { readonly radius: string }) => string;
  readonly andAroundYou: (p: {
    readonly target: TargetRule;
    readonly affects: "all" | "allies" | "enemies";
    readonly where: string;
  }) => string;
  readonly range: (p: { readonly range: string }) => string;
  readonly upTo4: (p: { readonly maxTargets: string; readonly who: string }) => string;
  readonly withinOfIt: (p: { readonly radius: number; readonly radius2: string }) => string;
  readonly and6: (p: {
    readonly target: TargetRule;
    readonly count: string;
    readonly where: string;
  }) => string;
  readonly rangeRadius: (p: { readonly range: string; readonly radius: string }) => string;
  readonly free: () => string;
  readonly adrenaline: (p: { readonly amount: string }) => string;
  readonly composedAmount: (p: { readonly amount: string }) => string;
  readonly energy8: (p: {
    readonly cost: string;
    readonly base: string;
    readonly overcast: string;
  }) => string;
  readonly overcast: (p: { readonly overcast: string }) => string;
  readonly instant: () => string;
  readonly composedActivationBase: (p: {
    readonly activation: string;
    readonly base: string;
  }) => string;
  readonly dealsNoDamage: () => string;
  readonly dealsOnlyDamageDamage: (p: {
    readonly weaponless: boolean;
    readonly bonus: string;
    readonly damageType: string;
  }) => string;
  readonly damage4: (p: { readonly condition: string; readonly more: string }) => string;
  readonly damageOnThem: (p: { readonly amount: string; readonly perCount: string }) => string;
  readonly cannotBeBlocked2: () => string;
  readonly cannotBeBlocked3: (p: { readonly condition: string }) => string;
  readonly chanceToMissWithOrLess: (p: {
    readonly chance: string;
    readonly name: string;
    readonly rank: string;
  }) => string;
  readonly resultsInACriticalHit: () => string;
  readonly resultsInACriticalHit2: (p: { readonly condition: string }) => string;
  readonly hitsUpToAdjacentFoesToo: (p: { readonly cleaveTargets: string }) => string;
  readonly hitsEveryAdjacentFoe: (p: { readonly condition: string }) => string;
  readonly armorPenetration2: (p: { readonly armorPenetration: string }) => string;
  readonly ifBlocked: (p: { readonly text: string }) => string;
  readonly onACriticalHit: (p: { readonly text: string }) => string;
  readonly ifItFailsToHit: (p: { readonly text: string }) => string;
  readonly asItIsUsed: (p: { readonly text: string }) => string;
  readonly allYourPreparationsAreRemoved: () => string;
  readonly fliesAsFast: (p: { readonly multiplier: string }) => string;
  readonly fliesAsFast2: (p: { readonly condition: string; readonly multiplier: string }) => string;
  readonly only: (p: { readonly condition: string }) => string;
  readonly eachDealingLessDamage: (p: { readonly value: string }) => string;
  readonly strikesTwice: () => string;
  readonly strikesTimes: (p: { readonly count: string }) => string;
  readonly shootsArrowsAtOnce: (p: {
    readonly count: string;
    readonly weaker: string;
    readonly fewer: string;
  }) => string;
  readonly whileActivating: (p: { readonly status: string }) => string;
  readonly easilyInterrupted: () => string;
  readonly failureChanceWithOrLess: (p: {
    readonly chance: string;
    readonly name: string;
    readonly rank: string;
  }) => string;
  readonly activatesFasterSlower: (p: {
    readonly condition: string;
    readonly value: string;
    readonly multiplier: number;
  }) => string;
  readonly healthGainFromDivineFavorIsDoubled: () => string;
  readonly projectilesEachCanBeDodged: (p: { readonly shots: string }) => string;
  readonly aProjectileAtEachFoeEachCan: (p: { readonly spread: true | undefined }) => string;
  readonly halfTheNormalRange: () => string;
  readonly orSacrificesHealthIfNoneIsNear: (p: { readonly elseSacrificePercent: string }) => string;
  readonly targetExploitsTheCorpseNearestYourTarget: (p: {
    readonly near: string | undefined;
    readonly all: true | undefined;
    readonly radius: number;
    readonly radius2: string;
    readonly pick: string | undefined;
    readonly value: string;
  }) => string;
  readonly whileOnYourBarAHealthFights: (p: {
    readonly name: string;
    readonly companionHealth: string;
  }) => string;
  readonly disabledForAfterUse: (p: { readonly disabledAfterUseSeconds: number }) => string;
  readonly takeAllConditionsFromYourAlliesWith: () => string;
  readonly hitOrMiss: (p: { readonly text: string }) => string;
  readonly eliteFlash: (p: {
    readonly elite: boolean;
    readonly flash: boolean;
    readonly type: SkillType;
  }) => string;
  readonly moraleBoost: (p: {
    readonly rechargesOnMoraleBoost: true | undefined;
    readonly rechargeSeconds: number;
  }) => string;
  readonly hexHexesS2: (p: { readonly kind: string }) => string;
}

/** English, moved here from `describe.ts` unchanged. */
export const EN_WORDS: DescribeWords = {
  capitalize,
  lowerAll,
  spaced,
  typeName,
  typeFirstWord,
  blockAnswerWording,
  loseWording,
  bearerWording,
  ifItWording,
  gainWording,
  loseTargetWording,
  stealsWording,
  returnedWording,
  yourMinionsWording,
  onlyIfWording,
  splashOnlyClause,
  eachOfWording,
  requiresWording,
  requirementWording,
  requirementLine,
  anyOfWording,
  allOfWording,
  seconds,
  blockedAttacks: BLOCKED_ATTACKS,
  blockedAttack: BLOCKED_ATTACK,
  damageTaken,
  triggerWhen: TRIGGER_WHEN,
  secondPerson,
  arrowsWhen: ARROWS_WHEN,
  chantOrShoutEnds: CHANT_OR_SHOUT_ENDS,
  energyEmpty: ENERGY_EMPTY,
  dropped: DROPPED,
  targetsWords: TARGETS_WORDS,
  nextSkill: NEXT_SKILL,
  yourNextSkill: YOUR_NEXT_SKILL,
  creates: CREATES,
  areaAroundCreated: AREA_AROUND_CREATED,
  nextSkillKind: NEXT_SKILL_KIND,
  lowerFirst,
  aCategory,
  negatedText,
  yourCondition,
  typeWord,
  splashSide: SPLASH_SIDE,
  auraWho: AURA_WHO,
  groundAnchorText: GROUND_ANCHOR_TEXT,
  share,
  categoryNoun,
  weaponText: WEAPON_TEXT,
  chainRoleText: CHAIN_ROLE_TEXT,
  followsText: FOLLOWS_TEXT,
  neededWeapon: NEEDED_WEAPON,
  weaponWord: WEAPON_WORD,
  typeText: TYPE_TEXT,
  areaText: AREA_TEXT,
  areaAroundTarget: AREA_AROUND_TARGET,
  targetText: TARGET_TEXT,
  areaWho: AREA_WHO,
  s: () => "s",
  onTarget: () => "on target",
  composedLastsAtBase: (p) => (p.lasts === p.at ? p.base : `${seconds(p.lasts)} (${p.base})`),
  attributes: (p) => `${p.name} attributes`,
  attributes2: () => "attributes",
  attributePrimaryS: (p) => `${p.scope} attribute${p.scope === "primary" ? "" : "s"}`,
  setTo: (p) => `${p.scope} set to ${p.rank}`,
  allAttributes: () => "all attributes",
  toAllAllAttributes: (p) => `${p.amount} to ${p.value}`,
  renewedWheneverAChantOrShoutEnds: (p) =>
    `renewed whenever a chant or shout ends on ${p.selfOnly ? "you" : "it"}`,
  renewedWheneverYouCastItCastsA: (p) =>
    `renewed whenever ${p.selfOnly ? "you cast" : "it casts"} a spell`,
  reappliedWheneverYouCastItCastsA: (p) =>
    `reapplied whenever ${p.selfOnly ? "you cast" : "it casts"} a spell on a foe`,
  renewedWheneverYouTakeItTakesElemental: (p) =>
    `renewed whenever ${p.selfOnly ? "you take" : "it takes"} elemental damage`,
  renewedWheneverAnEnchantmentOnYouIt: (p) =>
    `renewed whenever an enchantment on ${p.selfOnly ? "you" : "it"} ends`,
  gainAdrenalineFasterSlower: (p) =>
    `gain adrenaline ${p.shown} ${p.faster > 0 ? "faster" : "slower"}`,
  onTheBearerExpireFaster: (p) => `${p.what} on the bearer expire ${p.stat} faster`,
  enchantmentsAndStances: () => "enchantments and stances",
  enchantments: () => "enchantments",
  stances: () => "stances",
  yourAttacksAgainstItHaveCriticalChance: (p) =>
    `your attacks against it have ${p.criticalChanceBonus}% critical chance`,
  armorAgainstYourAttacksWhileItHas: (p) =>
    `${p.armorModifier} armor against your attacks${p.onlyWhileNoOtherHex ? " while it has no other hexes" : ""}`,
  youTheBearer: (p) => (p.selfOnly ? "you" : "the bearer"),
  endsIfYouEndsIfTheBearer: (p) =>
    p.selfOnly ? `ends if you ${secondPerson(p.phrase)}` : `ends if the bearer ${p.phrase}`,
  healthDegeneration: (p) => `−${p.healthPips} Health degeneration`,
  healthRegeneration: (p) => `+${p.healthPips} Health regeneration`,
  healthRegenerationForEachEnchantmentOnYou: (p) =>
    `+${p.pips} Health regeneration for each enchantment on you (at most ${p.max})`,
  energyDegeneration: (p) => `−${p.energyPips} Energy degeneration`,
  energyRegeneration: (p) => `+${p.energyPips} Energy regeneration`,
  healthRegenerationForEachConditionOnYou: (p) =>
    `${p.healthPipsPerCondition} Health regeneration for each condition on you`,
  health: () => "Health",
  hex: () => "hex",
  energy: () => "Energy",
  condition: () => "condition",
  regenerationForEachOnYou: (p) => `${p.pips} ${p.what} regeneration for each ${p.each} on you`,
  armorWhileWielding: (p) =>
    `${p.sign}${p.armorModifier} armor` +
    (p.weapon === undefined ? "" : ` while wielding ${NEEDED_WEAPON[p.weapon]}`),
  armorWhileNotMoving: (p) => `${p.armorWhileStill} armor while not moving`,
  healthPerSecondWhileMoving: (p) =>
    `${p.healthPerSecondWhileMoving} Health per second while moving`,
  healthPerSecond: (p) => `+${p.healthPerSecond} Health per second`,
  healthPerSecondMoreInEarshotOf: (p) =>
    `+${p.healthPerSecondNearSpirit} Health per second more in earshot of a spirit`,
  spellsCastInEarshotOfASpirit: (p) =>
    `spells cast in earshot of a spirit recharge ${p.faster}% faster`,
  chanceToDoubleStrikeWhileWielding: (p) =>
    `+${p.chance}% chance to double strike${p.weapon === undefined ? "" : ` while wielding ${NEEDED_WEAPON[p.weapon]}`}`,
  armorNotBelow: (p) => `−${p.amount} armor (not below ${p.floor})`,
  movesAtSpeed: (p) => `moves at ${p.speed}% speed`,
  movesAtSpeedWhileEnchanted: (p) => `moves at ${p.speed}% speed while enchanted`,
  speedBoostsHaveNoEffect: () => "speed boosts have no effect",
  cannotGainAdrenaline: () => "cannot gain adrenaline",
  whenThisEndsYouReturnToWhere: () => "when this ends, you return to where you cast it",
  whenThisEndsYouShadowStepTo: (p) =>
    `when this ends, you Shadow Step to the ally you cast it on, and all of your skills are disabled for ${p.seconds} seconds`,
  ofAttacksMiss: (p) => `${p.attackMissChance}% of attacks miss`,
  maximumHealthAtMost: (p) => `−${p.fraction}% maximum health (at most ${p.cap})`,
  maximumHealth: (p) => `+${p.maxHealthBonus} maximum health`,
  maximumHealthPerEnchantment: (p) =>
    `+${p.maxHealthBonusPerEnchantment} maximum health per enchantment`,
  maximumEnergy: (p) => `+${p.maxEnergyBonus} maximum energy`,
  maximumHealthPerPointOfMaximumEnergy: (p) =>
    `+${p.per} maximum Health per point of maximum Energy`,
  yourMinionsDealDamage: (p) => `your minions deal ${p.minionDamageBonus} damage`,
  loseMaximumHealthEachTimeAMinion: (p) =>
    `lose ${p.minionHitHealthLossPercent}% maximum health each time a minion of yours hits`,
  conditionsYouWouldReceiveGoToYour: () =>
    "conditions you would receive go to your closest minion instead",
  healing: (p) => `${p.more ? "+" : "−"}${p.change} healing`,
  weaponDamage: (p) => `${p.change}% weapon damage`,
  dealsDamage: (p) => `deals ${p.more ? "+" : "−"}${p.change} damage`,
  noDeathPenalty: () => "no death penalty",
  whenTheBearerDiesSoDoesIts: () => "when the bearer dies, so does its caster",
  alliesYouResurrectReturnWithHealthAnd: (p) =>
    `allies you resurrect return with +${p.health} Health and +${p.energy} Energy`,
  youDieTheBearerDiesWhenIt: (p) => `${p.selfOnly ? "you die" : "the bearer dies"} when it ends`,
  leavesAnExploitedCorpse: () => "leaves an exploited corpse",
  takeFromPhysicalDamage: (p) => `take ${p.sign}${p.amount} from physical damage`,
  elementalDamageTakenIsDamage: (p) =>
    `elemental damage taken is ${p.elementalDamageTakenAs} damage`,
  physicalDamageTakenIsDamage: (p) => `physical damage taken is ${p.physicalDamageTakenAs} damage`,
  physicalDamageDealtIsDamage: (p) => `physical damage dealt is ${p.physicalDamageDealtAs} damage`,
  elementalDamageDealtIsDamage: (p) =>
    `elemental damage dealt is ${p.elementalDamageDealtAs} damage`,
  takeFromSpiritsAttacks: (p) => `take ${p.damageFromSpiritAttacks} from spirits' attacks`,
  attacksAttacksDealDamage: (p) =>
    `${p.weapon === undefined ? "attacks" : `${p.weapon} attacks`} deal ${p.attackDamageType} damage`,
  attacksHaveArmorPenetration: (p) => `attacks have ${p.attackArmorPenetration}% armor penetration`,
  attacksAttacksDealLessMoreDamage: (p) =>
    `${p.weapon === undefined ? "attacks" : `${p.weapon} attacks`} deal ${p.amount} ${p.delta < 0 ? "less" : "more"} damage`,
  and: () => " and ",
  immuneToAnd: (p) => `immune to ${p.names}`,
  setOnFire: () => "set on fire",
  or: () => " or ",
  cannotBeOr: (p) => `cannot be ${p.names}`,
  attacksFromAttacks: (p) =>
    `${p.adrenalineGain}${p.adrenalineGainFasterFrom === "attacks" ? " from attacks" : ""}`,
  yourEliteEliteSkillSUse: (p) =>
    `your ${p.skillType === "elite" ? "elite skill" : p.skillType}s use ${p.name}`,
  uses: (p) => `${p.skillType} uses`,
  sUse: (p) => `${p.uses} ${p.skillType}s use`,
  yourNext: (p) => `your next ${p.next} ${p.name}`,
  spellsTakeAsLongToCast: (p) => `spells take ${p.castTimeMultiplier}× as long to cast`,
  skillsButAttacksTakeAsLongTo: (p) =>
    `skills but attacks take ${p.skillActivationMultiplier}× as long to activate`,
  spellsAreInterruptedByAttacks: () => "spells are interrupted by attacks",
  slowerFaster: (p) => (p.attackDurationMultiplier > 1 ? "slower" : "faster"),
  attacksWhileWielding: (p) =>
    `attacks ${p.change}% ${p.way}${p.weapon === undefined ? "" : ` while wielding ${NEEDED_WEAPON[p.weapon]}`}`,
  conditionsYouApplyLastLongerWhileWielding: (p) =>
    `conditions you apply last ${p.longer}% longer${p.weapon === undefined ? "" : ` while wielding ${NEEDED_WEAPON[p.weapon]}`}`,
  enchantmentsYouMaintainCostTheUpkeep: (p) =>
    `enchantments you maintain cost ${p.upkeepMultiplier}× the upkeep`,
  spellsThatCauseOvercastCauseMoreAs: (p) =>
    `spells that cause Overcast cause ${p.overcastSurcharge} more as they finish`,
  arrowsMoveAsFast: (p) => `arrows move ${p.projectileSpeedMultiplier}× as fast`,
  cannotCastSpells: () => "cannot cast spells",
  cannotAttack: () => "cannot attack",
  cannotUseResurrectionSkills: () => "cannot use resurrection skills",
  cannotBeTheTargetOfEnemySpells: (p) =>
    p.whileCasting
      ? "cannot be the target of enemy spells while casting spells"
      : "cannot be the target of enemy spells",
  cannotBeTheTargetOfSpells: () => "cannot be the target of spells",
  hostileSpellsTargetingYouFail: () => "hostile spells targeting you fail",
  attacksAgainstYouMiss: () => "attacks against you miss",
  strippedOfAllEnchantmentsAndCannotBe: () =>
    "stripped of all enchantments, and cannot be enchanted",
  cannotBeTheTargetOfEnchantments: () => "cannot be the target of enchantments",
  cannotUseShoutsOrChants: () => "cannot use shouts or chants",
  cannotUseSignets: () => "cannot use signets",
  cannotBlockItsCasterSAttacks: () => "cannot block its caster's attacks",
  cannotBeBlockedByBlindedFoes: () => "cannot be blocked by Blinded foes",
  cannotBlock: () => "cannot block",
  renewedForSecondsIfMovingAsIt: (p) =>
    `renewed for ${p.renewsWhileMoving} seconds if moving as it would end`,
  cannotBeKnockedDown: () => "cannot be knocked down",
  cannotBeKnockedDownByAFoe: () => "cannot be knocked down by a foe",
  endsIfItPreventsAKnockdown: () => "ends if it prevents a knockdown",
  youDoNotSufferExtraDamageFrom: () => "you do not suffer extra damage from a critical attack",
  cannotLandCriticalHits: () => "cannot land critical hits",
  immuneToCriticalHits: () => "immune to critical hits",
  spellsHaveDoubleTheDivineFavorBonus: (p) =>
    `${p.attribute} spells have double the Divine Favor bonus`,
  attackSkillAttackSkills: (p) =>
    p.once
      ? p.attackSkillsOnly === true
        ? "attack skill"
        : BLOCKED_ATTACK[p.against]
      : p.attackSkillsOnly === true
        ? "attack skills"
        : BLOCKED_ATTACKS[p.against],
  whileBelowHealth: (p) => ` while below ${p.blockBelowHealth}% Health`,
  whileUnderOr: (p) => ` while under ${p.value}`,
  fromFoesUnderOr: (p) => ` from foes under ${p.value}`,
  whileAttacking: (p) => (p.blockWhileAttacking ? " while attacking" : ""),
  blocksTheNextChanceToBlock: (p) =>
    p.once
      ? `blocks the next ${p.what}${p.attacker}${p.below}${p.under}${p.attacking}`
      : `${p.chance}% chance to block ${p.what}${p.attacker}${p.below}${p.under}${p.attacking}`,
  within: (p) => AREA_TEXT.get(p.radius) ?? `within ${p.radius2}`,
  alliesTo: (p) => `allies ${p.around} to ${p.bearer}: ${p.status}`,
  whileWielding: (p) => ` while wielding ${NEEDED_WEAPON[p.weapon]}`,
  whileHoldingAWeaponOtherThan: (p) => ` while holding a weapon other than ${NEEDED_WEAPON[p.not]}`,
  againstFoesThatAreNotMoving: (p) =>
    p.criticalChanceBonusVersus === undefined ? "" : " against foes that are not moving",
  criticalChance: (p) => `${p.chance}% critical chance${p.holding}${p.versus}`,
  gainEnergyPerCriticalHit: (p) => `gain ${p.energyPerCritical} Energy per critical hit`,
  wheneverYouSuccessfullyLandACriticalHit: (p) =>
    `whenever you successfully land a critical hit, you gain ${p.healthPerCritical} Health`,
  refreshesEveryTimeYouLandACritical: () => "refreshes every time you land a critical hit",
  theNextTimeYouLandACritical: (p) =>
    p.endsWhenFired
      ? "the next time you land a critical hit"
      : "every time you land a critical hit",
  with: (p) =>
    p.weapon === undefined ? p.critical : `${p.critical} with ${NEEDED_WEAPON[p.weapon]}`,
  removeStatusFromYourTarget: (p) =>
    p.kind === "remove-status"
      ? `${p.when}: ${lowerFirst(p.text)} from your target`
      : `${p.when}: ${lowerFirst(p.text)}`,
  ifOneIsRemovedYouLoseEnergy: (p) =>
    `if one is removed, you lose ${p.energyIfRemoved} Energy or it ends`,
  endsAfterIncomingAttackS: (p) =>
    `ends after ${p.endsAfterAttacks} incoming attack${p.endsAfterAttacks2 === 1 ? "" : "s"}`,
  endsAfterYourNextAttackSHit: (p) =>
    `ends after your next ${p.endsAfterAttackCount} attack${p.endsAfterAttackCount2 === 1 ? "" : "s"}, hit, miss or block`,
  noEffectWhileUnderOr: (p) => `no effect while under ${p.suppressedWhileUnder}`,
  yourNextAttackSCannotBeBlocked: (p) =>
    `your next ${p.unblockableAttacks} attack${p.unblockableAttacks2 === 1 ? "" : "s"} cannot be blocked`,
  attacksCannotBeBlocked: (p) =>
    `${p.weapon === undefined ? "" : `${WEAPON_WORD[p.weapon]} `}attacks cannot be blocked`,
  whileYouWieldAnAWeapon: (p) =>
    `while you wield ${p.test ? "an" : "a"} ${p.weaponDamage} weapon, ${p.hit}`,
  forEachEnchantmentRemovedSCasterLoses: (p) =>
    `for each ${p.name} enchantment removed, ${p.name2}'s caster loses ${p.percentOfMax}% maximum Health`,
  with2: (p) => (p.weapon === undefined ? "" : ` with ${NEEDED_WEAPON[p.weapon]}`),
  endsAfterHitS: (p) => `ends after ${p.count} hit${p.count2 === 1 ? "" : "s"}${p.how}`,
  spellSpells: (p) => (p.one ? "spell" : `${p.count} spells`),
  yourNextCostsCostLessEnergy: (p) =>
    `your next ${p.next} ${p.one ? "costs" : "cost"} ${p.costReduction} less energy`,
  yourNextRechargesRechargeFaster: (p) =>
    `your next ${p.next} ${p.one ? "recharges" : "recharge"} ${p.rechargeFaster}% faster`,
  forYourNext: (p) => `for your next ${p.next}`,
  theirProjectilesMoveAsFast: (p) =>
    `their projectiles move ${p.projectileSpeedMultiplier}× as fast`,
  noOvercast: () => "no Overcast",
  spreadsToAdjacentCombatants: () => "spreads to adjacent combatants",
  nextAttackSkillDamage: (p) => `next attack skill: ${p.condition}: +${p.more} damage`,
  attacks: () => "attacks",
  makesAMeleeAttack: () => "makes a melee attack",
  moves: () => "moves",
  takesDamage: (p) => `takes ${p.damageTakenMultiplier} damage`,
  takesDamageFromTheNextAttack: (p) =>
    `takes ${damageTaken(p.attackDamageTakenMultiplier)} damage from the next attack`,
  damageTaken2: (p) => `−${p.damageReduction} damage taken`,
  damageTakenPerRankOfAtMost: (p) =>
    `−${p.now} damage taken (${p.perRank} per rank of ${p.attribute}, at most ${p.max})`,
  damageTakenMoreEachHit: (p) => `−${p.step} damage taken, ${p.step} more each hit`,
  theNextHitDealsLessDamage: (p) => `the next hit deals ${p.nextDamageReduction} less damage`,
  damageTakenWhileCastingS: (p) =>
    `−${p.amount} damage taken while casting ${spaced(p.skillType)}s`,
  lessDamage: (p) => `${p.value}% less ${p.type} damage`,
  lessDamageFromFoesWithAHex: (p) => `${p.fraction}% less damage from foes with a ${p.name} hex`,
  lessDamageFromFoesSufferingFrom: (p) =>
    `${p.fraction}% less damage from foes suffering from ${p.name}`,
  damageTakenFromFoesWithLessHealth: (p) =>
    `−${p.damageReductionFromWeakerFoe} damage taken from foes with less Health`,
  damageTakenFromFoesWithACondition: (p) =>
    `−${p.damageReductionFromConditionedFoe} damage taken from foes with a condition`,
  lessDamageFromSpells: (p) => `${p.less}% less damage from spells`,
  damageOverInASecondIsHealed: (p) => `damage over ${p.cap} in a second is healed`,
  physicalItsPhysicalDamageTheDamageIt: (p) =>
    p.from === "physical" ? "its physical damage" : "the damage it takes from attacks",
  whichTakesLessOfIt: (p) => `, which takes ${p.reduction} less of it`,
  goesToItsCaster: (p) => `${share(p.fraction)} ${p.hits} goes to its caster${p.less}`,
  theDamageYouTakeGoesToYour: (p) =>
    `${share(p.redirectsDamageToMinion)} the damage you take goes to your closest minion`,
  damageFromASingleHitIsCapped: (p) =>
    `damage from a single hit is capped at ${p.maxDamageFractionPerHit}% of max health`,
  eachHitItCapsCostsTheCaster: (p) =>
    `each hit it caps costs the caster ${p.casterEnergyPerReduction} Energy, and it ends when the caster cannot pay`,
  damageFromASingleAttackIsCapped: (p) =>
    `damage from a single attack is capped at ${p.attackDamageCapFraction}% of max health`,
  lifeStolen: (p) => `−${p.lifeStealReduction} life stolen`,
  yourHealthSacrificesAreLarger: (p) =>
    `your Health sacrifices are ${p.sacrificeMultiplier}% larger`,
  knockdownsLastAtLeastS: (p) => `knockdowns last at least ${p.knockdownMinSeconds}s`,
  itsSpiritLosesHealthEachTime: (p) => `its spirit loses ${p.sourceLosesHealth} health each time`,
  reappliedAsItWouldEndWhileYou: (p) =>
    `reapplied as it would end while ${p.selfOnly ? "you have" : "it has"} another hex`,
  chantsAndShoutsLastLongerOnIt: (p) => `chants and shouts last ${p.longer}% longer on it`,
  attacksDealLessMoreDamage: (p) =>
    `attacks deal ${p.attackDamageDelta} ${p.attackDamageDelta2 < 0 ? "less" : "more"} damage`,
  movesFaster: (p) => `moves ${p.moveSpeedMultiplier}% faster`,
  healthRegenerationDegeneration: (p) =>
    `${p.healthPips} Health ${p.healthPips2 > 0 ? "regeneration" : "degeneration"}`,
  armor: (p) => `${p.armorModifier} armor`,
  attacksFaster: (p) => `attacks ${p.value}% faster`,
  aOr: (p) => `a ${p.categories}`,
  listComma: () => ", ",
  whileUnderOr2: (p) => `while under ${p.under}: ${p.gains}`,
  once: () => "once",
  times: (p) => `${p.stat} times`,
  endsAfterItTakesEffect: (p) => `ends after it takes effect ${p.times}`,
  theNextHexFailsAndItsCaster: (p) => `the next hex fails, and its caster takes ${p.damage} damage`,
  theNextSpellItCastsAtFoe: (p) =>
    `the next spell it casts at ${p.on === "foe-targeted" ? "a foe" : "an ally"} fails: ${p.what}`,
  theNextTouchSkillsUsedAgainstYou: (p) =>
    `the next ${p.failsFoeTouchSkills} touch skills used against you fail`,
  foesWithinFoes: (p) => (p.area === undefined ? `foes within ${p.radius}` : `${p.area} foes`),
  moreEachSecond: (p) => `, ${p.growth} more each second`,
  eachSecondItAndTakeDamage: (p) =>
    `each second, ${p.hitsBearer ? "it and " : ""}${p.foes} take ${p.damage}${p.kind} damage${p.more}`,
  second: () => "second",
  seconds2: (p) => `${p.every} seconds`,
  everySecondSeconds: (p) => `every ${p.value}: ${p.what}`,
  itsSpiritLosesHealthForEachOne: (p) => `its spirit loses ${p.amount} Health for each one hurt`,
  itsSpiritLosesHealthForEachOne2: (p) => `its spirit loses ${p.amount} Health for each one healed`,
  everyAttack: () => "every attack",
  theNextAttack: () => "the next attack",
  theNextAttacks: (p) => `the next ${p.times} attacks`,
  typelessAsDamage: (p) => (p.type === "typeless" ? "" : ` as ${p.type} damage`),
  ofTheDamageOfThatHitIt: (p) =>
    `${p.share}% of the damage of ${p.attacks} that hit it goes back to the attacker${p.kind}, up to ${p.max}`,
  eachAttackItLandsHasAChance: (p) =>
    `each attack it lands has a ${p.chance}% chance to deal its damage to it instead, up to ${p.max}`,
  theNextDamageOrLifeStealHeals: (p) =>
    `the next damage or life steal heals for that much instead, up to ${p.reversesNextDamage}`,
  theNextDamageIsNegatedAndIts: (p) =>
    `the next damage is negated and its source takes that much instead, up to ${p.cap}`,
  meleeAttacksNeitherHitNorFailTo: (p) =>
    `melee attacks neither hit nor fail to hit, and deal ${p.damage} damage each instead`,
  allDamageHealsForThatMuchInstead: (p) =>
    `all damage heals for that much instead, up to ${p.cap} a hit`,
  theNextDamageOrLifeStealThat: (p) =>
    `the next damage or life steal that would kill ${p.selfOnly ? "you" : "it"} is negated`,
  whenOneAllySIsSpentIt: () => "when one ally's is spent, it ends on all others",
  gainMoreStrikeStrikesOfAdrenalinePer: (p) =>
    `gain ${p.extraStrikesPerHit} more ${p.extraStrikesPerHit2 === 1 ? "strike" : "strikes"} of adrenaline per hit`,
  skillsRechargeFaster: (p) => `skills recharge ${p.skillRechargeFaster}% faster`,
  skillsCostMoreLessEnergy: (p) =>
    `skills cost ${p.change}% ${p.change2 > 0 ? "more" : "less"} Energy`,
  spellsAndBindingRitualsRechargeFaster: (p) =>
    `spells and binding rituals recharge ${p.faster}% faster`,
  spellsRechargeFaster: (p) => `spells recharge ${p.spellRechargeFaster}% faster`,
  bindingRitualsRechargeFaster: (p) => `binding rituals recharge ${p.faster}% faster`,
  enchantmentsRechargeFaster: (p) => `${p.name} enchantments recharge ${p.faster}% faster`,
  hexTheTargetSYour: (p) => (p.category === "hex" ? "the target's" : "your"),
  skillsHaveArmorPenetration: (p) => `${p.name} skills have ${p.pierce}% armor penetration`,
  yourTheBearerSSkillsCannotBe: (p) =>
    `${p.selfOnly ? "your" : "the bearer's"} skills cannot be interrupted`,
  theNextTimeYouWouldBeInterrupted: () => "the next time you would be interrupted, you are not",
  youCannotBeInterruptedEachTimeYou: (p) =>
    `you cannot be interrupted; each time you would be, lose ${p.amount} Energy or this ends`,
  youCannotBeInterruptedEachTimeYou2: (p) =>
    `you cannot be interrupted; each time you would be, lose 1 ${p.profession} enchantment or this ends`,
  conditionsOnExpireFaster: (p) => `conditions on ${p.bearer} expire ${p.faster} faster`,
  hexesOnExpireFaster: (p) => `hexes on ${p.bearer} expire ${p.faster}% faster`,
  theNextHexOnLastsLonger: (p) => `the next ${p.of} hex on ${p.bearer} lasts ${p.longer} longer`,
  hexesCastOnTakeAsLongTo: (p) => `hexes cast on ${p.bearer} take ${p.times}× as long to cast`,
  otherAlliesSpellsOnTakeAsLong: (p) =>
    `other allies' spells on ${p.bearer} take ${p.times}× as long to cast`,
  yourSpellsOnTakeAsLongTo: (p) => `your spells on ${p.bearer} take ${p.times}× as long to cast`,
  enchantmentsCastOnCostLessEnergyMinimum: (p) =>
    `enchantments cast on ${p.bearer} cost ${p.less} less Energy, minimum 1`,
  hitsWithAnAttack: () => "hits with an attack",
  failsToHit: () => "fails to hit",
  hitsWithAnAttackSkill: () => "hits with an attack skill",
  skillEffectEndsIfYouUseA: (p) =>
    p.selfOnly || p.category === "skill-effect"
      ? "ends if you use a skill"
      : "ends if the bearer uses a skill",
  endsIfYouUseAnAdrenalSkill: () => "ends if you use an adrenal skill",
  endsIfYouUseANonAdrenal: () => "ends if you use a non-adrenal skill",
  endsIfYouUseANonSkill: (p) => `ends if you use a non-${p.kind} skill`,
  endsIfYouUseAnAttackSkill: () => "ends if you use an attack skill",
  endsIfYouUseASkillOn: () => "ends if you use a skill on it",
  endsIfYouUseASkillThat: (p) => `ends if you use a skill that is not a ${p.NEXT_SKILL_KIND}`,
  hexHexedEnchanted: (p) => (p.category === "hex" ? "hexed" : "enchanted"),
  becomesOr: (p) => `becomes ${p.gained}`,
  theBearerIsDestroyedWhenItExpires: () => "the bearer is destroyed when it expires",
  theMinionsYouItTookBecomeMasterless: (p) =>
    `the minions ${p.selfOnly ? "you" : "it"} took become masterless when it ends`,
  whenTheBearerDiesRisesWhereIt: (p) =>
    p.masterless === true
      ? `when the bearer dies, ${p.stands} rises where it fell, masterless`
      : `when it dies, ${p.stands} stands up in its place`,
  composedKindBoundWhenOn: (p) => p.kindBoundWhen ?? TRIGGER_WHEN[p.on],
  endsIfItEndsIfYou: (p) =>
    p.onFoe ? `ends if it ${p.when}` : `ends if you ${secondPerson(p.when)}`,
  all: (p) => (p.once && p.against === "all" ? blockAnswerWording(p.text) : p.text),
  whileHoldingAnItem: (p) =>
    p.onlyWhileHoldingItem && !p.holdingSaid ? `${p.stats} while holding an item` : p.stats,
  composedIndexText: (p) => (p.index === 0 ? p.text : capitalize(p.text)),
  listSentence: () => ". ",
  physicalAttacks: (p) => `${p.weapon ?? (p.physicalOnly ? "physical" : "")} attacks`,
  attackSkillsPhysicalAttacks: (p) =>
    p.attackSkillsOnly ? `${p.weapon === undefined ? "" : `${p.weapon} `}attack skills` : p.value,
  foesYourHitGetFor: (p) =>
    `foes your ${p.attacks} hit get ${p.statusName} ` + `for ${p.durationSeconds}`,
  foesYourHitTake: (p) => `foes your ${p.attacks} hit take ${p.riderDamage}`,
  foesYourHitLose: (p) =>
    `foes your ${p.attacks} hit lose ${p.count} ${categoryNoun(p.count2, p.category)}`,
  andSoDoFoesAdjacentToThem: (p) => `${p.pop}, and so do foes adjacent to them`,
  stealUpToHealth: (p) => `${p.attacks} steal up to ${p.amount} Health`,
  yourPetSAttacksHealYouFor: (p) => `your pet's attacks heal you for ${p.amount}`,
  yourInterruptFoesTheyHit: (p) => `your ${p.attacks} interrupt foes they hit`,
  your: (p) => `your ${p.attacks}: ${p.text}`,
  attackSkillsPhysicalAttacks2: (p) =>
    p.attackSkillsOnly
      ? `${p.weapon === undefined ? "" : `${p.weapon} `}attack skills`
      : `${p.weapon ?? "physical"} attacks`,
  foesThatBlockYourGetFor: (p) =>
    `foes that block your ${p.attacks} get ${p.statusName} ` + `for ${p.durationSeconds}`,
  foesThatBlockYour: (p) => `foes that block your ${p.attacks}: ${lowerFirst(p.text)}`,
  damage: (p) => `${p.amount}${typeWord(p.type)} damage`,
  physical: () => "physical",
  elemental: () => "elemental",
  armor2: () => "armor",
  listSpace: () => " ",
  againstProjectileAttacks: (p) => (p.projectile ? `${p.text} against projectile attacks` : p.text),
  thatAllyIsHealedFor: (p) => `that ally is healed for ${p.amount}`,
  youLoseItsCasterLoses: (p) => (p.bearerIsCaster ? "you lose" : "its caster loses"),
  energy2: (p) => `${p.who} ${p.amount} energy`,
  orSpell: (p) => `${p.value} spell`,
  wheneverYouCastItCastsAnA: (p) =>
    `whenever ${p.bearerIsCaster ? "you cast" : "it casts"} ${p.test ? "an" : "a"} ${p.spell} on an ally, ${p.value}`,
  composedKindBoundWhenEvent: (p) => p.kindBoundWhen ?? TRIGGER_WHEN[p.event],
  youOrItOr: (p) => (p.bearerIsCaster ? `you ${p.phrases}` : `it ${p.phrases2}`),
  whenItOrOrAtOnce: (p) =>
    p.length === 0 ? p.death : `when it ${p.others}, or at once ${p.death}`,
  whenItOr: (p) => `when it ${p.on}`,
  composedBearerIsCaster: (p) => (p.bearerIsCaster ? YOUR_NEXT_SKILL : NEXT_SKILL),
  theNextTime: (p) => `the next time ${p.doer}`,
  composedEventWhenOf: (p) => ARROWS_WHEN[p.event] ?? p.whenOf,
  wheneverYourArrowsOr: (p) => `whenever your arrows ${p.on}`,
  wheneverOnACreatureWithLessHealth: (p) =>
    `whenever ${p.doer}${p.victimHasLessHealth === undefined ? "" : " on a creature with less Health"}`,
  and2: () => ", and ",
  andAnd: (p) => (p.when === undefined ? p.each : `${p.when}: ${p.each}`),
  youItAnd: (p) => `${p.when}: ${p.bearerIsCaster ? "you" : "it"} and ${p.answer}`,
  youAndAllPartyMembersAreHealed: (p) =>
    `${DROPPED}: you and all party members are healed for ${p.healed}`,
  composedWhat: (p) => `${DROPPED}: ${p.what}`,
  meleeHitsWithAMeleeAttackHits: (p) =>
    p.weapon === "melee" ? "hits with a melee attack" : `hits with ${NEEDED_WEAPON[p.weapon]}`,
  meleeIsHitByAFoeS: (p) =>
    p.weapon === "melee"
      ? "is hit by a foe's melee attack"
      : `is hit by a foe's attack with ${NEEDED_WEAPON[p.weapon]}`,
  with3: (p) => `${TRIGGER_WHEN[p.event]} with ${NEEDED_WEAPON[p.weapon]}`,
  youGainEnergy: (p) => `you gain ${p.amount} Energy`,
  allYourSkillsAreRecharged: () => "all your skills are recharged",
  yourPartyIsHealedFor: (p) => `your party is healed for ${p.amount}`,
  takeDamage: (p) => `${lowerFirst(p.upTo)} take ${p.amount}${typeWord(p.type)} damage`,
  areHealedFor: (p) => `${lowerFirst(p.upTo)} are healed for ${p.amount}`,
  composedUpToText: (p) => `${lowerFirst(p.upTo)}: ${lowerFirst(p.text)}`,
  ifTargetFoeDiesWhileHexedWith: (p) =>
    p.bearerIsFoe
      ? "if target foe dies while hexed with this"
      : "if an ally dies while enchanted with this",
  and3: (p) => `${p.who}, ${p.flatMap}`,
  hasASpellInterrupted: () => "has a spell interrupted",
  isStruckForDamageWhileUsingA: (p) => `is struck for ${p.damageType} damage while using a skill`,
  takesDamageFromAFoe: (p) => `takes ${p.damageType} damage from a foe`,
  takesMoreThanDamageFromAFoe: (p) => `takes more than ${p.minDamage} damage from a foe`,
  hasItsHealthDroppedBelowByDamage: (p) =>
    `has its Health dropped below ${p.healthBelow}% by damage`,
  isMoreThanFromYou: (p) => `is more than ${p.apartBeyond} from you`,
  hitsWithAAttack: (p) => `hits with a ${p.chainRole} attack`,
  isHitByAnAttackAAttack: (p) =>
    `is hit by ${p.role === undefined ? "an attack" : `a ${p.role} attack`} of its caster's`,
  blocksAAttack: (p) => `blocks a ${p.blocked} attack`,
  losesAEnchantment: (p) => `loses a ${p.name} enchantment`,
  hex2: (p) => `${p.scopeAdjective} hex`,
  appliesAnAToAFoe: (p) => `applies ${p.test ? "an" : "a"} ${p.words} to a foe`,
  spell: (p) => (p.type === undefined ? "spell" : typeName(p.type)),
  onAllyAnAllyAFoe: (p) => ` on ${p.targets === "ally" ? "an ally" : "a foe"}`,
  castsAnA: (p) => `casts ${p.test ? "an" : "a"} ${p.words}${p.on}`,
  non: (p) => `non-${typeFirstWord(p.notType)}`,
  elite: () => "elite",
  adrenal: () => "adrenal",
  skill: () => "skill",
  isTargetedByYour: (p) => `is targeted by your ${p.words}`,
  on: (p) => (p.targets === undefined ? "" : ` on ${TARGETS_WORDS[p.targets]}`),
  usesAnA: (p) => `uses ${p.test ? "an" : "a"} ${p.words}${p.on}`,
  health2: (p) => `${p.amount} Health`,
  energy3: (p) => `${p.amount} Energy`,
  takeDamage2: (p) => `take ${p.amount}${typeWord(p.type)} damage`,
  loseAllAllS: (p) => `lose ${p.value} ${p.category}${p.count === 1 ? "" : "s"}`,
  all2: (p) => `all ${p.side}`,
  upTo: (p) => `up to ${p.maxTargets} ${p.side}`,
  withinOfThatCreature: (p) =>
    AREA_AROUND_CREATED.get(p.radius) ?? `within ${p.radius2} of that creature`,
  gain: (p) => `gain ${p.answer}`,
  youGain: (p) => `${p.when}: ${p.gains ? `you gain ${p.answers}` : p.answers}`,
  onIt: () => "on it",
  damageOnIt: (p) => p.value + `${p.amount}${typeWord(p.type)} damage ${p.perCount}`,
  composedWhenWhat: (p) => `${p.when}: ${p.what}`,
  itsAdjacentAllies: () => "its adjacent allies",
  itsAlliesWithin: (p) => `its allies ${p.area ?? `within ${p.radius}`}`,
  itsAdjacentAlliesItsAlliesWithin: (p) =>
    !p.bearerIsFoe ? `${lowerFirst(p.foesWithin)}${p.only}` : p.value,
  bearerBlocksMeleeMeleeProjectile: (p) =>
    p.on === "bearer-blocks-melee" ? "melee" : "projectile",
  whenYouBlockYouAndAlliesAre: (p) =>
    `when you block, you and allies ${p.area} are healed for ${p.amount}`,
  eachBlockCostsYouEnergyOrThis: (p) => `each block costs you ${p.amount} Energy or this ends`,
  youGainEnergyForEachSuccessfulAttack: (p) =>
    `you gain ${p.amount} Energy for each successful ${p.kind} attack blocked`,
  wheneverYouBlockAAttackThisWay: (p) =>
    `whenever you block a ${p.kind} attack this way, the attacker suffers ${p.amount}${typeWord(p.type)} damage`,
  withinOfYouFoes: (p) => `${AREA_TEXT.get(p.radius) ?? `within ${p.radius2} of you`} foes`,
  ifYouBlockAAttackSufferFrom: (p) =>
    `if you block a ${p.kind} attack, ${p.foes} suffer from ${p.statusName} for ${p.resolveMagnitudeAtRanks} seconds`,
  ifYouBlockAAttack: (p) => `if you block a ${p.kind} attack, ${p.foes}: ${lowerFirst(p.text)}`,
  stealsHealthFromThatFoe: (p) => `steals ${p.amount} Health from that foe`,
  loses: (p) => `loses ${p.count} ${categoryNoun(p.count2, p.category)}`,
  itTakesDamage: (p) => `it takes ${p.amount}${typeWord(p.type)} damage`,
  takeDamage3: (p) => `${p.splashed} take ${p.amount}${typeWord(p.type)} damage`,
  thatAttackIsInterruptedAndAnd: (p) => `${p.when}, that attack is interrupted and ${p.hurt}`,
  itIsInterruptedAndYouLoseEnergy: (p) =>
    `${p.when}, it is interrupted and you lose ${p.amount} Energy or this ends`,
  ofThatSkillSBaseEnergyCost: (p) => `${p.share} of that skill's base energy cost`,
  energy4: (p) => `${p.amount} energy`,
  youAreHealedAreHealedIsHealed: (p) =>
    p.bearerIsCaster && p.length === 0
      ? "you are healed"
      : p.bearerIsCaster
        ? "are healed"
        : "is healed",
  forOfThatSkillSEnergyCost: (p) => `${p.healed} for ${p.share} of that skill's energy cost`,
  forWord: (p) => `${p.healed} for ${p.amount}`,
  plus: () => " plus ",
  youGainGainsPlus: (p) => `${p.bearerIsCaster ? "you gain" : "gains"} ${p.gains}`,
  theNearestOf: (p) => `the nearest of ${p.splashed}`,
  upTo2: (p) => `up to ${p.maxTargets} ${p.splashed}`,
  itAndLoseEnergy: (p) => `it and ${p.others} lose ${p.amount} energy`,
  bearerFoesFoesOtherFoes: (p) => (p.to === "bearer-foes" ? "foes" : "other foes"),
  inTheAreaSufferItToo: (p) => `${p.who} in the area suffer it too`,
  ifASpellItThatSkill: (p) => (p.spellsOnly ? "if a spell, it" : "that skill"),
  takesThisSkillSSlotForSeconds: (p) =>
    `${p.which} takes this skill's slot for ${p.seconds} seconds`,
  youEnterTheSameStance: () => `you enter the same stance`,
  youLoseEnergyOrThisEnds: (p) => `you lose ${p.amount} Energy or this ends`,
  thatAttackIsInterrupted: (p) => `${p.when}, that attack is interrupted`,
  takes: (p) => `takes ${p.dealt} ${p.when}`,
  bearerFatalDamageNegatedAnd: (p) =>
    p.on === "bearer-fatal-damage-negated" ? "and" : `${p.when},`,
  theFoeWhoDealtItTakesDamage: (p) =>
    `${p.then} the foe who dealt it takes ${p.amount}${typeWord(p.type)} damage`,
  thatAttackerIsHealedFor: (p) => `${p.when}, that attacker is healed for ${p.amount}`,
  bearerGainsEnchantmentEnchantmentHexOrEnchantment: (p) =>
    p.on === "bearer-gains-enchantment" ? "enchantment" : "hex or enchantment",
  theCasterOfThatTakesDamage: (p) =>
    `${p.when}, the caster of that ${p.gained} takes ${p.amount}${typeWord(p.type)} damage`,
  theHealerTakesDamage: (p) => `${p.when}, the healer takes ${p.amount}${typeWord(p.type)} damage`,
  ofThatTarget: (p) => `${lowerFirst(p.upTo)} of that target ${p.what}${p.paid}`,
  healsItsCasterFor: (p) => `heals its caster for ${p.amount} ${p.when}`,
  itsCasterGainsEnergy: (p) => `its caster gains ${p.amount} energy ${p.when}`,
  theNextSkillYouUseItUses: (p) =>
    `the next skill ${p.bearerIsCaster ? "you use" : "it uses"} takes ${p.seconds} seconds longer to recharge`,
  itsCasterStealsHealth: (p) => `its caster steals ${p.amount} Health ${p.when}`,
  theNearestOfTakes: (p) => `the nearest of ${p.allies} takes`,
  take: (p) => `${p.allies} take`,
  upToTake: (p) => `up to ${p.maxTargets} ${p.allies} take`,
  composedAlliesText: (p) => `${p.allies}: ${lowerFirst(p.text)}`,
  onAFoe: (p) => `${p.when} on a foe`,
  adjacentToYou: () => "adjacent to you",
  withinAroundYou: (p) => `${p.area ?? `within ${p.radius}`} around you`,
  otherAdjacentToYouWithinAroundYou: (p) =>
    `${p.includesCentre === true ? "" : "other "}${SPLASH_SIDE[p.hits]} ${p.value}`,
  takeDamage4: (p) => `${p.yours}, ${p.reached} take ${p.amount}${typeWord(p.type)} damage`,
  composedYoursReachedText: (p) => `${p.yours}, ${p.reached}: ${lowerFirst(p.text)}`,
  composedBearerIsCasterSaid: (p) =>
    p.bearerIsCaster ? yourCondition(p.said) : ifItWording(p.said),
  composedWhenConditionText: (p) => `${p.when}, ${p.condition}: ${lowerFirst(p.text)}`,
  bearer: (p) => lowerFirst(p.target === "bearer" ? p.bearer : p.text),
  nextAttackSkill: (p) => `next attack skill: ${p.statusName} ${p.durationSeconds}`,
  nextAttackSkill2: (p) => `next attack skill: ${p.text}`,
  skillTargetAroundItsTarget: (p) => (p.at === "skill-target" ? " (around its target)" : ""),
  withYourNext: (p) => `with your next ${p.next}${p.around}: ${lowerFirst(p.text)}`,
  costsCostEnergy: (p) => `${p.one ? "costs" : "cost"} ${p.energyBase} Energy`,
  costsCostLessEnergy: (p) => `${p.one ? "costs" : "cost"} ${p.energyPercentOff} less Energy`,
  costsCostLessEnergyMinimum: (p) =>
    `${p.one ? "costs" : "cost"} ${p.energyDiscount} less Energy (minimum ${p.energyFloor})`,
  costsCostMoreEnergy: (p) => `${p.one ? "costs" : "cost"} ${p.energySurcharge} more Energy`,
  castsCastInstantly: (p) => `${p.one ? "casts" : "cast"} instantly`,
  castsCastFaster: (p) => `${p.one ? "casts" : "cast"} ${p.activationMultiplier} faster`,
  takesTakeAsLongToCast: (p) =>
    `${p.one ? "takes" : "take"} ${p.activationMultiplier}× as long to cast`,
  castsCastFaster2: (p) => `${p.one ? "casts" : "cast"} ${p.activationSecondsLess} faster`,
  rechargesRechargeFaster: (p) => `${p.one ? "recharges" : "recharge"} ${p.rechargeFaster} faster`,
  rechargesRechargeSlower: (p) => `${p.one ? "recharges" : "recharge"} ${p.rechargeSlower} slower`,
  lastsLastLongerShorter: (p) =>
    `${p.one ? "lasts" : "last"} ${p.durationMultiplier} ${p.durationMultiplier2 > 1 ? "longer" : "shorter"}`,
  healsHealLessMoreNotTheDivine: (p) =>
    `${p.one ? "heals" : "heal"} ${p.value} ${p.healMultiplier < 1 ? "less" : "more"}${p.sparesDivineFavor ? ", not the Divine Favor bonus" : ""}`,
  isAreNotEasilyInterrupted: (p) => `${p.one ? "is" : "are"} not easily interrupted`,
  overcastYouBy: (p) => `Overcast you by ${p.overcastPerUse}`,
  andAttack: (p) => `${p.chainRoles} attack`,
  attackSkillSkill: (p) =>
    p.weapon !== undefined
      ? `${p.weapon} attack skill`
      : p.type === undefined
        ? "skill"
        : spaced(p.type),
  hexHexesS: (p) => (p.one ? p.kind : p.kind === "hex" ? "hexes" : `${p.kind}s`),
  thatTargetsAFoeThatTargetA: (p) => (p.one ? "that targets a foe" : "that target a foe"),
  thatTargetsYouThatTargetYou: (p) => (p.one ? "that targets you" : "that target you"),
  halfRanged: () => "half-ranged",
  notFlashEnchantments: (p) => (p.notFlash ? " (not flash enchantments)" : ""),
  whileHoldingAnItem2: (p) => (p.whileHoldingItem ? "while holding an item, " : ""),
  nextNext: (p) => (p.one ? `${p.whose} next` : `${p.whose} next ${p.uses}`),
  cannotBeInterrupted: () => "cannot be interrupted",
  cannotBeBlocked: () => "cannot be blocked",
  costsLessEnergy: (p) => `costs ${p.energyDiscount} less energy`,
  castsInstantly: () => "casts instantly",
  rechargesInstantly: () => "recharges instantly",
  s2: (p) => `${p.value}s`,
  takesSLongerToRecharge: (p) => `takes ${p.extraRechargeSeconds} longer to recharge`,
  yourNextAnd: (p) => `your next ${p.NEXT_SKILL_KIND} ${p.does}`,
  youLoseAllEnergyAsItIs: () => "you lose all energy as it is cast",
  youGainOfItsEnergyCost: (p) => `you gain ${p.energyGainOfCost} of its Energy cost`,
  itRechargesFaster: (p) => `it recharges ${p.fraction}% faster`,
  rechargesInstantly2: (p) => `${p.name} recharges instantly`,
  forYourNextSkill: () => "for your next skill",
  ifItIsAAnd: (p) => `if it is a ${p.kind}, ${p.does}`,
  suffer: (p) => `suffer ${p.sufferedWhat}`,
  forWord2: (p) => `${p.statusName} for ${p.durationSeconds} ` + `(${p.status})`,
  a: (p) => `a ${p.owners} ${spaced(p.category)}`,
  ifItInterruptsASkill: () => "If it interrupts a skill",
  ifThatActionWasASpell: () => "If that action was a spell",
  ifThatActionWasAnAttack: () => "If that action was an attack",
  ifItKillsTheTarget: () => "If it kills the target",
  ifItResurrects: () => "If it resurrects",
  ifASpiritDiedInThisWay: () => "If a spirit died in this way",
  ifWasRemoved: (p) => `If ${aCategory(p.category)} was removed`,
  ifItRemoves: (p) => `If it removes ${aCategory(p.category)}`,
  ifTargetIsBelowHealth: (p) => `If target is below ${p.fraction}% Health`,
  ifTargetIsAboveHealth: (p) => `If target is above ${p.fraction}% Health`,
  ifYouHaveLessThanHealth: (p) => `If you have less than ${p.fraction}% Health`,
  ifYouHaveLessHealthThanYour: () => "If you have less Health than your pet",
  ifYourPetHasLessHealthThan: () => "If your pet has less Health than you",
  ifItFollowsOffHandAnOff: (p) =>
    `If it follows ${p.role === "off-hand" ? "an off-hand" : `a ${p.role}`} attack`,
  ifTargetHas: (p) => `If target has ${p.filteredCategory}`,
  ifTargetHasOr: (p) => `If target has ${p.categories}`,
  ifYouHave: (p) => `If you have ${aCategory(p.category)}`,
  ifYouHaveA: (p) => `If you have a ${p.name} ${p.category}`,
  other: (p) => (p.excluding === undefined ? "" : "other "),
  ifYouHaveNo: (p) => `If you have no ${p.other}${p.category}`,
  ifYouHaveNo2: (p) => `If you have no ${p.other}${p.name} ${p.category}`,
  ifTargetIsCastingASpellOr: (p) =>
    p.orChant === true ? "If target is casting a spell or chant" : "If target is casting a spell",
  ifTargetIsUsingASkill: () => "If target is using a skill",
  ifTargetHasNoOtherHex: (p) => `If target has no other ${p.name} hex`,
  ifTargetIsNotAdjacentToAny: () => "If target is not adjacent to any allies",
  ifTargetIsNotNearAnyAllies: () => "If target is not near any allies",
  ifTargetHasNoAlliesWithin: (p) => `If target has no allies within ${p.radius}`,
  ifTargetIsNearAnyOfYour: () => "If target is near any of your allies",
  ifAnyOfYourAlliesIsWithin: (p) => `If any of your allies is within ${p.radius} of target`,
  ifTargetIsWithinEarshot: () => "If target is within earshot",
  ifTargetIsWithinOfYou: (p) => `If target is within ${p.radius} of you`,
  ifTargetIsNotMoving: () => "If target is not moving",
  ifTargetIsKnockedDown: () => "If target is knocked down",
  ifTargetIsMoving: () => "If target is moving",
  ifTargetIsAFoe: () => "If target is a foe",
  ifTargetIsMovingFasterThanNormal: () => "If target is moving faster than normal",
  ifAnyFoeIsKnockedDownIf: (p) =>
    p.knockedDown === true ? `If any ${p.where} foe is knocked down` : `If any foe is ${p.where}`,
  ifYouHitOrMoreFoes: (p) => `If you hit ${p.atLeast} or more foes`,
  ifNumberOrMore: (p) => `If ${p.countAll} number ${p.atLeast} or more`,
  ifAreNoMoreThan: (p) => `If ${p.countAll} are no more than ${p.countAll2}`,
  ifTargetHas2: (p) => `If target has ${p.statusName}`,
  ifTargetDoesNotHave: (p) => `If target does not have ${p.statusName}`,
  ifYouHaveMoreEnergyThanTarget: () => "If you have more Energy than target",
  ifYouHaveLessThanEnergy: (p) => `If you have less than ${p.amount} Energy`,
  ifYouAreOvercast: () => "If you are Overcast",
  ifYouWield: (p) => `If you wield ${NEEDED_WEAPON[p.weapon]}`,
  ifYouHoldAShield: () => "If you hold a shield",
  ifYouAreHoldingAnItem: () => "If you are holding an item",
  ifTargetHasLessHealthThanYou: () => "If target has less Health than you",
  ifTargetHasMoreHealthThanYou: () => "If target has more Health than you",
  ifTargetIsAttacking: () => "If target is attacking",
  ifTargetIsNotAttacking: () => "If target is not attacking",
  ifTargetIsCastingASpellOr2: () => "If target is casting a spell or attacking",
  ifTargetIsASummonedCreature: () => "If target is a summoned creature",
  ifNoSpiritIsWithinOfYou: (p) =>
    `If no spirit is ${AREA_TEXT.get(p.radius) ?? `within ${p.radius2}`} of you`,
  ifASpiritIsWithinOfYou: (p) =>
    `If a spirit is ${AREA_TEXT.get(p.radius) ?? `within ${p.radius2}`} of you`,
  ifYouControlOrFewerS: (p) => `If you control ${p.count} or fewer ${p.creature}s`,
  ifASpiritOrACorpseIs: (p) =>
    `If a spirit or a corpse is ${AREA_TEXT.get(p.radius) ?? `within ${p.radius2}`} of you`,
  ifAnAllyIsDeadWithin: (p) =>
    `If an ally is dead ${AREA_TEXT.get(p.radius) ?? `within ${p.radius2}`}`,
  ifTargetIsNearACorpseOr: () => "If target is near a corpse or its pet is dead",
  ifTargetIsWithinOfACorpse: (p) =>
    `If target is within ${p.radius} of a corpse or its pet is dead`,
  composedType: (p) => (p.type === undefined ? "" : typeWord(p.type)),
  healthForEachAllyMax: (p) => `, +${p.amount} Health for each ally ${p.area} (max ${p.max})`,
  allPartyMembers: () => "All party members",
  allItsPartyMembers: () => "All its party members",
  allAlliedMinions: () => "All allied minions",
  yourOtherMinions: () => "Your other minions",
  within2: (p) => `${p.Who} ${p.area ?? `within ${p.radius}`}`,
  adjacent: (p) => `Adjacent ${p.who}`,
  nearby: (p) => `Nearby ${p.who}`,
  within3: (p) => (p.area === undefined ? `${p.Who} within ${p.radius}` : `${p.Who} ${p.area}`),
  loseThatSame: (p) => `lose that same ${p.category}`,
  loseAllAll: (p) => `lose all ${categoryNoun("all", p.category)}`,
  onThem: () => "on them",
  loseOneForEachOnThem: (p) => `lose one ${p.category} for each ${p.countEach}`,
  lose: (p) => `lose ${p.count} ${categoryNoun(p.count2, p.category)}`,
  enchantmentAnA: (p) => (p.onlyBearing === "enchantment" ? "an" : "a"),
  with4: (p) => (p.onlyBearing === undefined ? "" : ` with ${p.article} ${p.onlyBearing}`),
  usingSkills: (p) => (p.onlyUsing === undefined ? "" : ` using ${typeName(p.onlyUsing)} skills`),
  dead: (p) => (p.dead === true ? `Dead ${lowerFirst(p.living)}` : p.living),
  targetAndCasterAroundYouCasterAround: (p) =>
    `${p.includesCentre === true ? `Target and ${lowerFirst(p.reached)}` : p.reached}${p.around === "caster" ? " around you" : ""}${p.alsoAround === "caster" ? " around the target and you" : ""}${p.bearing}${p.using}${p.onlyIf}`,
  upTo3: (p) => `Up to ${p.maxTargets} ${lowerFirst(p.who)}`,
  inItsRange: () => "in its range",
  inTheArea: () => "in the area",
  foes: () => "foes",
  allEveryoneYouAndAlliesAllies: (p) =>
    p.affects === "all" ? "everyone" : p.includesCaster ? "you and allies" : "allies",
  enemiesFoesAllEveryoneYouAndAllies: (p) =>
    `${p.value} ${AREA_TEXT.get(p.radius) ?? `within ${p.radius2}`}`,
  whenSprung: () => "when sprung",
  after: (p) => `after ${seconds(p.delaySeconds)}`,
  everyFor: (p) => `every ${seconds(p.everySeconds)} for ${seconds(p.count)}`,
  whenItEnds: (p) => `When it ends, ${p.whom}: `,
  springsByItselfAsItsTimeRuns: () => "Springs by itself as its time runs out",
  composedWhoText: (p) => `${capitalize(p.who)}: ${lowerFirst(p.text)}`,
  composedEndingText: (p) => `${p.ending}${lowerFirst(p.text)}`,
  composedConditionText: (p) => `${p.condition}: ${lowerFirst(p.text)}`,
  itsAttacksDealDamage: (p) => `Its attacks deal ${p.magnitude} damage`,
  thisSpiritLosesHealth: (p) => `this spirit loses ${p.magnitude} Health`,
  composedCondition: (p) => `${lowerFirst(p.condition)}: `,
  itsAttacks: (p) => `Its attacks: ${p.when}${p.what}`,
  health3: (p) => `${p.health} Health`,
  health4: (p) => `${p.health} Health (${p.health2})`,
  level: (p) => `level ${p.marked}, `,
  lastsSeconds: (p) => `, lasts ${p.durationSeconds} seconds`,
  composedCountNameLevelTextHealthTextLasts: (p) =>
    `${p.count} ${p.name} (${p.levelText}${p.healthText}${p.lasts})`,
  itsAttacksDealDamage2: (p) => `Its attacks deal ${p.value} damage`,
  onlyOneAtATimeANew: () => "Only one at a time: a new one kills the old",
  leavesCorpseCorpsesWhenItDies: (p) =>
    `Leaves ${p.corpses} ${p.current === 1 ? "corpse" : "corpses"} when it dies`,
  whenItDiesStandsUpInIts: (p) => `When it dies, ${p.text} stands up in its place`,
  listSemicolon: () => "; ",
  inItsRange2: (p) => AREA_TEXT.get(p.radius) ?? "in its range",
  composedAffectsWhere: (p) => `${lowerAll(AURA_WHO[p.affects])} ${p.where}`,
  whenItDiesUnderHealthBeginFor: (p) =>
    `When it dies, ${p.who} under ${p.below} Health begin ${p.statusName} for ${p.duration} seconds`,
  whenItDiesDeadPartyMembersAre: (p) =>
    `When it dies, dead party members ${p.where} are resurrected with ${p.health}% Health and zero Energy`,
  damageTakeDamageAreHealedForHealth: (p) =>
    p.effect === "damage" ? `take ${p.amount} damage` : `are healed for ${p.amount} Health`,
  max: (p) => ` (max ${p.max})`,
  whenItDiesPerSecondItLived: (p) => `When it dies, ${p.who} ${p.what} per second it lived${p.max}`,
  everySecondsHealsTheMostHurtNon: (p) =>
    `Every ${p.everySeconds} seconds: heals the most hurt non-spirit ally ${p.where} for ${p.heal} Health`,
  whenANonSpiritDiesInIts: () => "When a non-spirit dies in its range",
  nearby2: (p) => AREA_TEXT.get(p.radius) ?? "nearby",
  itsConditionsSpreadToEachNonSpirit: (p) =>
    `${p.when}, its conditions spread to each non-spirit ${p.where} that has a condition`,
  eachOfItsTypeInItsRange: (p) =>
    `${p.when}, each of its type in its range below ${p.below} Health takes ${p.damage} damage`,
  holdingAnItem: (p) => (p.onlyWhileHoldingItem ? " holding an item" : ""),
  composedWhoWhereHoldingStatus: (p) => `${p.who} ${p.where}${p.holding}: ${p.status}`,
  perFoeHit: (p) => (p.perTarget === undefined ? "" : " per foe hit"),
  forEachMeleeAttackSkillOnYour: (p) =>
    ` for each melee attack skill on your bar (at most ${p.max})`,
  withinEarshot: (p) => (p.radius === AREA_EARSHOT ? "within earshot" : p.area),
  forEverySummonedCreatureYouControlMaximum: (p) =>
    ` for every summoned creature you control ${p.where} (maximum ${p.max} Energy)`,
  composedZeroAloneEachText: (p) => (p.zero ? `${p.alone} ${p.each}` : `${p.text}, +${p.each}`),
  maximum: (p) => ` (maximum ${p.max})`,
  forEach: (p) => `for each ${p.countEach}${p.max}`,
  pointOfEnergyGained: () => "point of Energy gained",
  pointOfEnergyRestrictedByOvercast: () => "point of Energy restricted by Overcast",
  skillDisabledInThisWay: () => "skill disabled in this way",
  orCasterOnYou: (p) => `${p.categories} ${p.on === "caster" ? "on you" : p.onTarget}`,
  ofYourRecharging: (p) => `of your recharging ${p.rechargingSkillsNoun}`,
  pointOfEnergyCasterYouHaveThey: (p) =>
    `point of Energy ${p.on === "caster" ? "you have" : "they have"}`,
  orRemoved: (p) => `${p.categories} removed`,
  orLost: (p) => `${p.name} ${p.categories} lost`,
  enchantmentYouAreMaintaining: () => "enchantment you are maintaining",
  secondItWasInEffect: () => "second it was in effect",
  foeKnockedDown: () => "foe knocked down",
  youHaveEquipped: (p) => `${p.type} you have equipped`,
  adrenalineSkillTheyHave: () => "adrenaline skill they have",
  foeHit: () => "foe hit",
  within4: (p) => `${p.perCountNoun} ${AREA_TEXT.get(p.radius) ?? `within ${p.radius2}`}`,
  attacksSkillsS: (p) =>
    p.weapon !== undefined
      ? `${WEAPON_WORD[p.weapon]} attacks`
      : p.type === undefined
        ? "skills"
        : `${spaced(p.type)}s`,
  casterYourTargetS: (p) => (p.on === "caster" ? "your" : "target's"),
  s3: (p) => `${p.perCountNoun}s`,
  pointOfOvercast: () => "point of Overcast",
  skillDisabled: () => "skill disabled",
  rechargingSkill: () => "recharging skill",
  pointOfEnergy: () => "point of Energy",
  removedOr: (p) => `removed ${p.categories}`,
  removedOr2: (p) => `removed ${p.name} ${p.categories}`,
  maintainedEnchantment: () => "maintained enchantment",
  secondHeld: () => "second held",
  adrenalineSkill: () => "adrenaline skill",
  deadAlly: () => "dead ally",
  knockedDownFoeFoe: (p) => (p.knockedDown === true ? "knocked-down foe" : "foe"),
  ally: () => "ally",
  neverAbove: (p) => `, never above ${p.upTo}`,
  forEachRemoved: (p) =>
    p.toTarget === true || p.perRemoved === undefined ? "" : ` for each ${p.perRemoved} removed`,
  perPointLost: (p) => (p.perEnergyLost === undefined ? "" : " per point lost"),
  armorPenetration: (p) => ` (${p.armorPenetration}% armor penetration)`,
  dealsDamage2: (p) =>
    `Deals ${p.magnitude}${typeWord(p.type)} damage${p.perPointLost}${p.penetration}`,
  deals: () => "Deals",
  damage2: (p) => `${typeWord(p.type)} damage`,
  composedCountedConditionAmount: (p) => `${p.counted}; ${lowerFirst(p.condition)}: +${p.amount}`,
  gainHealthEqualToThisSpellS: () => "Gain Health equal to this spell's Divine Favor bonus",
  healsIfRelievedOf: (p) => `Heals ${p.amount} if relieved of ${p.name}`,
  healsForOfYourCurrentHealthMaximum: (p) =>
    `Heals for ${p.magnitude} of your current Health (maximum ${p.max} Health)`,
  youGainHealth: (p) => `You gain ${p.amount} health`,
  yourPetGainsHealth: (p) => `Your pet gains ${p.amount} health`,
  ownerHealsItsOwnerForHealsFor: (p) =>
    p.recipient === "owner" ? `Heals its owner for ${p.amount}` : `Heals for ${p.amount}`,
  healsForEachRemovedHealsForEach: (p) =>
    p.perRemoved !== undefined
      ? `Heals ${p.amount} for each ${p.perRemoved} removed`
      : p.perDestroyedSpirit === true
        ? `Heals ${p.amount} for each spirit destroyed`
        : p.perEnergyLost === true
          ? `${p.recipient === "caster" ? "You are healed" : "Heals"} ${p.amount} for each point of Energy lost`
          : p.perUsedSkillEnergy === true
            ? `Heals for ${p.magnitude} of the spell's energy cost`
            : p.value,
  casterYouGainHeals: (p) => (p.recipient === "caster" ? "You gain" : "Heals"),
  health5: () => " Health",
  casterOnTargetFoeOnThem: (p) => (p.recipient === "caster" ? "on target foe" : "on them"),
  underHealth: (p) => `, under ${p.onlyBelowHealthFraction}% Health`,
  gainOfTheSkillSBaseEnergy: (p) => `Gain ${p.magnitude} of the skill's base energy cost`,
  targetGainsOwnerYouGainGain: (p) =>
    p.toTarget === true ? "Target gains" : p.recipient === "owner" ? "You gain" : "Gain",
  energy5: (p) =>
    `${p.gains} ${p.magnitude} energy${p.perPointLost}${p.perFoeHit}${p.perOwnCreature}${p.perRemoved}`,
  energy6: () => " energy",
  gain2: () => "Gain",
  onTargetFoe: () => "on target foe",
  strikeStrikesOfAdrenalineAdrenaline: (p) =>
    p.units
      ? `${p.magnitude} ${p.current === 1 ? "strike" : "strikes"} of adrenaline`
      : `${p.magnitude} adrenaline`,
  youGain2: () => "You gain",
  targetTargetGainsGain: (p) => (p.recipient === "target" ? "Target gains" : "Gain"),
  strikesOfAdrenaline: () => " strikes of adrenaline",
  targetRegainsAllEnergy: () => "Target regains all Energy",
  casterYouLoseTargetLoses: (p) => (p.on === "caster" ? "You lose" : "Target loses"),
  energy7: (p) => `${p.who} ${p.magnitude} energy`,
  stealsUpToEnergy: (p) => `Steals up to ${p.magnitude} energy`,
  stealsUpToHealth: (p) => `Steals up to ${p.magnitude} Health`,
  youStealHealth: (p) => `You steal ${p.magnitude} Health`,
  youSacrificeOfYourMaximumHealth: (p) => `You sacrifice ${p.percentOfMax}% of your maximum health`,
  targetFoeLosesHealth: (p) => `Target foe loses ${p.magnitude} Health`,
  targetFoeLoses: () => "Target foe loses",
  youLoseHealth: (p) => `You lose ${p.magnitude} health`,
  forEachEnchantmentRemoved: (p) => `${p.lose} for each ${p.whose} enchantment removed`,
  loseAllButHealth: (p) => `Lose all but ${p.magnitude} Health`,
  transferOfYourConditionsToFoes: (p) =>
    `Transfer ${p.magnitude} of your conditions to ${p.foesWithin}`,
  max2: (p) => (p.maxSeconds === undefined ? "" : ` (max ${seconds(p.maxSeconds)})`),
  withTheTimeEachHasLeft: () => "with the time each has left",
  withMoreTime: (p) => `with ${p.extend}% more time${p.max}`,
  foesGetTheTargetSConditionsWith: (p) => `${p.foesWithin} get the target's conditions, ${p.value}`,
  loseYourHealthHealForOfIt: (p) =>
    `Lose ${share(p.fractionOfCurrent)} your health; heal for ${p.magnitude}% of it`,
  whoeverOfYouAndTargetFoeHas: () =>
    "Whoever of you and target foe has more Health loses half the difference; the other gains that much",
  stacksOnceForEachOnThem: (p) => `. Stacks once for each ${p.countEach}`,
  stacksOnceForEachOnThem2: (p) => p.status + p.value,
  forWord3: (p) => `For ${p.durationSeconds}, ${p.what}`,
  forEachHexRemoved: (p) => ` for each ${p.name} hex removed)`,
  stackingOnceForEachOnThem: (p) => `, stacking once for each ${p.countEach}`,
  appliesCasterToYouForUntilIt: (p) =>
    `Applies ${p.statusName}${p.on === "caster" ? " to you" : ""} ` +
    (p.ends ? `for ${p.statusDuration} ` : "until it ends ") +
    `(${p.status}` +
    p.value +
    p.value2,
  composedStatusNameDurationSeconds: (p) => `${p.statusName} (${p.durationSeconds})`,
  appliesOneOfAtRandom: (p) => `Applies one of, at random: ${p.choices}`,
  maintainedCasterOnYouEnergyRegenerationWhile: (p) =>
    `Maintained${p.on === "caster" ? " on you" : ""}: −1 Energy regeneration while it lasts. ` +
    `${capitalize(p.what)}.`,
  losesThatSame: (p) => `Loses that same ${p.category}`,
  casterLoseRemoves: (p) => (p.from === "caster" ? "Lose" : "Removes"),
  oneForEachRemovedMax: (p) =>
    `${p.verb} one ${p.category} for each ${p.category2} removed (max ${p.max})`,
  oneForEachOnTarget: (p) => `${p.verb} one ${p.category} for each ${p.countEach}`,
  lose2: (p) => `Lose ${p.count} ${p.whose}${categoryNoun(p.count2, p.category)}`,
  endsTheTargetSStance: () => "Ends the target's stance",
  forEachSpiritWithinOfIt: (p) =>
    ` for each spirit ${AREA_AROUND_TARGET.get(p.near) ?? `within ${p.near2} of it`}`,
  numberUpTo: (p) => (typeof p.count === "number" && p.count > 1 ? "up to " : ""),
  and4: (p) => (p.orCategory === undefined ? "" : ` and ${categoryNoun(p.count, p.orCategory)}`),
  removes: (p) =>
    `Removes ${p.upTo}${p.count} ${p.whose}${categoryNoun(p.count2, p.category)}${p.and}${p.perSpirit}`,
  interruptsTheTargetSSpellIfThey: () => "Interrupts the target's spell, if they are casting one",
  interruptsTheTargetSSpellOrChant: () =>
    "Interrupts the target's spell or chant, if they are casting one",
  skillInterruptsTheTargetSSkillIf: (p) =>
    p.only === "skill"
      ? "Interrupts the target's skill, if they are using one"
      : "Interrupts the target's action: a skill or an attack",
  youAreKnockedDownFor: (p) => `You are knocked down for ${seconds(p.durationSeconds)}`,
  knocksDownFor: (p) => `Knocks down for ${seconds(p.durationSeconds)}`,
  shadowStepsToTheTarget: () => "Shadow steps to the target",
  youAndTheTargetShadowStepTo: () => "You and the target Shadow Step to each other's location",
  corpseTeleportsYouToThatCorpseShadow: (p) =>
    p.to === "corpse"
      ? "Teleports you to that corpse"
      : "Shadow Step to a nearby location directly away from your target",
  health6: (p) => `${p.percent}% health`,
  upToYourCurrentHealthYourHealth: (p) =>
    p.casterLosesFractionOfCurrent === 0
      ? "up to your current health"
      : `your health after losing ${share(p.casterLosesFractionOfCurrent)}`,
  perPartyMemberWithin: (p) =>
    ` per party member ${AREA_TEXT.get(p.radius) ?? `within ${p.radius2}`}`,
  casterAndTeleportsTheTargetToYou: (p) =>
    p.at === "caster" ? ", and teleports the target to you" : "",
  returnsTheTargetToLifeWithAnd: (p) =>
    `Returns the target to life with ${p.healthText} and ${p.energy}% energy${p.per}${p.teleport}`,
  returnsEveryDeadAlliedPetToLife: (p) =>
    `Returns every dead allied pet ${p.where} to life with ${p.health}% health`,
  youLoseAllYourRemainingEnergy: () => "You lose all your remaining energy",
  youGainFor: (p) =>
    `You gain ${p.statusName} for ${seconds(p.durationSeconds)} ` + `(${p.status})`,
  yourPetGainsFor: (p) =>
    `Your pet gains ${p.statusName} ` + `for ${p.duration} ` + `(${p.status})`,
  yourPetMovesToYourTargetAnd: () => "Your pet moves to your target and attacks it",
  teleportsTargetToYou: () => "Teleports target to you",
  destroysTargetAlliedSpirit: () => "Destroys target allied spirit",
  destroysTargetMinion: () => "Destroys target minion",
  nearestSpiritLosesHealthTargetAllyIs: (p) =>
    `Nearest spirit loses ${p.magnitude} Health; ` +
    `target ally is healed ${p.healPerPoint} per point`,
  nearestSpiritLosesAllEnergyYouGain: (p) =>
    `Nearest spirit loses all Energy; you gain ${p.magnitude}% of it`,
  itsOwnerGainsHealthEqualToThe: () => "Its owner gains Health equal to the damage it deals",
  destroysEveryAlliedSpiritWithin: (p) =>
    `Destroys every allied spirit ${AREA_TEXT.get(p.radius) ?? `within ${p.radius2}`}`,
  thisSkillRecharges: () => "This skill recharges",
  secondsFaster: () => " seconds faster",
  thisSkillRechargesInstantly: () => "This skill recharges instantly",
  thisSkillRechargesFaster: (p) => `This skill recharges ${p.fraction}% faster`,
  usedSkillThatSkillRechargesInstantlyThis: (p) =>
    p.of === "used-skill" ? "That skill recharges instantly" : "This skill recharges instantly",
  loseAllAdrenaline: () => "Lose all adrenaline",
  rechargesAllYourOtherSkills: () => "Recharges all your other skills",
  rechargesAllYourStances: () => "Recharges all your stances",
  rechargesAllYourOtherSkills2: (p) => `Recharges all your other ${p.which} skills`,
  rechargesAllYour: (p) => `Recharges all your ${p.rechargedKind}`,
  allOfYourSpiritsDie: () => "All of your spirits die",
  summonsPlusOnePerCorpseExploited: (p) =>
    `Summons ${p.text}` + (p.perExploitedCorpse === true ? ", plus one per corpse exploited" : ""),
  setsATrap: () => "Sets a trap",
  pulseTargetCreatesASymbolMarksThe: (p) =>
    p.kind === "pulse"
      ? p.anchor === "target"
        ? "Creates a symbol"
        : "Marks the ground"
      : p.anchor === "corpse"
        ? "Creates a well"
        : "Creates a ward",
  forSeconds: (p) => `${p.what} ${p.where} for ${p.magnitude} seconds`,
  seconds3: (p) => `${p.magnitude} seconds`,
  forEachSignetYouHaveEquipped: (p) =>
    p.perOwnSignet === true ? " for each signet you have equipped" : "",
  allOfTheTargetSSkillsAre: (p) => `All of the target's skills are disabled for ${p.time}`,
  theTargetSEliteSkillIsDisabled: (p) => `The target's elite skill is disabled for ${p.time}`,
  oneOfTheTargetSSpellsAt: (p) =>
    `One of the target's spells, at random, is disabled for ${p.time}`,
  allOfTheTargetSAttackSkills: (p) =>
    `All of the target's attack skills are disabled for ${p.time}`,
  theInterruptedSkillIsDisabledFor: (p) =>
    `The interrupted skill is disabled for ${p.time}${p.perSignet}`,
  centreInterruptedHoldingThatSkillHaveIt: (p) =>
    p.which === "centre-interrupted"
      ? `holding that skill have it disabled for ${p.time}`
      : `That skill and all skills of the same attribute are disabled for ${p.time}`,
  thisSkillBecomesTheOneYouRemoved: (p) =>
    `This skill becomes the one you removed for ${p.seconds} seconds`,
  thisSkillBecomesThatRandomSpellSpell: (p) =>
    `This skill becomes that ${p.which === "random-spell" ? "spell" : "skill"} for as long`,
  thisSkillBecomesItsTargetSNon: (p) =>
    `This skill becomes its target's non-form elite skill for ${p.magnitude} seconds`,
  takeControlOfTargetEnemySpirit: () => "Take control of target enemy spirit",
  becomeYourMinionsWhileYouBear: (p) => `Become your minions while you bear ${p.name}`,
  targetMinionWithAMasterBecomesMasterless: (p) =>
    `Target minion with a master becomes masterless; a masterless one becomes yours and is healed for ${p.magnitude} Health`,
  leadCountsAsALeadAttackCounts: (p) =>
    p.role === "lead" ? "Counts as a lead attack" : "Counts as an off-hand attack",
  targetSuffersOvercast: (p) => `Target suffers ${p.magnitude} overcast`,
  thisSkillThisSkillThatSkill: (p) => (p.of === "this-skill" ? "This skill" : "That skill"),
  forEachRemoved2: (p) =>
    p.perRemoved === undefined ? "" : ` for each ${categoryNoun(p.value, p.perRemoved)} removed`,
  takesSecondsLongerToRecharge: (p) =>
    `${p.which} takes ${p.magnitude} seconds longer to recharge${p.each}`,
  that: (p) => ` that ${p.onlyIf}`,
  ifItStrikesAFoe: (p) => `If it strikes a foe${p.whom}: ${lowerFirst(p.text)}`,
  from: (p) => `${p.text} from ${p.from}`,
  takeDamageForEachPointOfEnergy: (p) =>
    `take ${p.amount}${typeWord(p.type)} damage` +
    (p.perEnergyLost === undefined ? "" : " for each point of energy lost"),
  areInterruptedAreInterruptedIfCasting: (p) =>
    p.only === undefined ? "are interrupted" : "are interrupted if casting",
  areKnockedDownForS: (p) => `are knocked down for ${p.durationSeconds}s`,
  foesFoeCreaturesGain: (p) =>
    p.hits === "foes" || p.hits === "foe-creatures" ? p.suffered : `gain ${p.sufferedWhat}`,
  gainHealthEqualToThisSpellS2: () => "gain Health equal to this spell's Divine Favor bonus",
  gain3: (p) => `gain ${gainWording(p.text)}`,
  gainHealth: (p) => `gain ${p.amount} Health`,
  loseHealth: (p) => `lose ${p.amount} Health`,
  youFromEach: (p) => `you ${stealsWording(p.text)} from each`,
  transferAllTheirConditionsToYou: () => "transfer all their conditions to you",
  resurrect: (p) => (p.kind === "resurrect" ? returnedWording(p.text) : lowerFirst(p.text)),
  and5: (p) => (p.length === 0 ? (p.last ?? "") : `${p.parts} and ${p.last2}`),
  perAlliedMinionsOwnMinionsMinionOne: (p) =>
    `; ${lowerFirst(p.text)} per ${p.hits === "allied-minions" || p.hits === "own-minions" ? "minion" : "one"}`,
  per: (p) => ` per ${p.perCountNoun}`,
  damage3: (p) => `${p.amount}${typeWord(p.type)} damage${p.each}`,
  healHealsEnergy: (p) =>
    p.kind === "heal" ? `heals ${p.amount}${p.each}` : `+${p.amount} energy${p.each}`,
  drainsEnergy: (p) => `drains ${p.magnitude} energy`,
  stealsEnergy: (p) => `steals ${p.magnitude} energy`,
  stealsHealth: (p) => `steals ${p.magnitude} health`,
  resurrectsEnergy: (p) => `resurrects, ${p.energy}% energy`,
  resurrectsHealth: (p) => `resurrects, ${p.health}% health`,
  resurrectsPetsHealth: (p) => `resurrects pets, ${p.health}% health`,
  healsOfYourHealth: (p) => `heals ${p.percent}% of ${share(p.fractionOfCurrent)} your health`,
  balancesHealthWithTargetFoe: () => "balances health with target foe",
  allUpTo: (p) => (p.current === p.Infinity ? "all" : `up to ${p.moving}`),
  andFoesWithinOfIt: (p) =>
    ` and foes ${AREA_AROUND_TARGET.get(p.copyToFoesWithin) ?? `within ${p.copyToFoesWithin2} of it`}`,
  withOfTheirRemainingDurations: (p) =>
    ` with ${p.durationMultiplier}% of their remaining durations`,
  movesConditionsFromFoesWithinOfIt: (p) =>
    `Moves ${p.count} conditions${p.lasting} from foes ${AREA_AROUND_TARGET.get(p.foesWithin) ?? `within ${p.foesWithin2} of it`} to the target`,
  casterMovesOfYourConditionsToThe: (p) =>
    p.from === "caster"
      ? `Moves ${p.count} of your conditions${p.lasting} to the target${p.copies}`
      : `Moves ${p.count} of target's conditions${p.lasting} to you`,
  youAreHealedForForEach: (p) => `${p.moves}; you are healed for ${p.magnitude} for each`,
  areDisabledForSeconds: (p) => `are disabled for ${p.seconds} seconds`,
  allOfYourSkills: (p) => `All of your skills ${p.time}`,
  allOfYourOtherSkills: (p) => `All of your other skills ${p.time}`,
  allOfYourOtherNonAttackSkills: (p) => `All of your other non-attack skills ${p.time}`,
  allOfYourOtherAttackSkillsYour: (p) =>
    p.exceptWeapon === undefined
      ? `All of your other attack skills ${p.time}`
      : `Your non-${WEAPON_WORD[p.exceptWeapon]} attack skills ${p.time}`,
  allOfYourNonAttackSkills: (p) => `All of your non-attack skills ${p.time}`,
  s4: (p) => `${typeName(p.type)}s`,
  yourAnd: (p) => `Your ${p.types} ${p.time}`,
  allOfYourSpells: (p) => `All of your spells ${p.time}`,
  allOfYourOther: (p) => `All of your ${p.others ? "other " : ""}${p.name} ${p.time}`,
  exceptAnd: (p) => (p.length === 0 ? "" : ` except ${p.except}`),
  allOfYourNonSkills: (p) => `All of your non-${p.name} skills${p.exceptText} ${p.time}`,
  yourWholeParty: () => "Your whole party",
  composedAffectsWhere2: (p) => `${AREA_WHO[p.affects]} ${p.where}`,
  radius: (p) => `${p.radius} radius`,
  andAroundYou: (p) =>
    `${TARGET_TEXT[p.target]}, and ${lowerAll(AREA_WHO[p.affects])} ${p.where} around you`,
  range: (p) => `${p.range} range`,
  upTo4: (p) => `up to ${p.maxTargets} ${p.who}`,
  withinOfIt: (p) => AREA_AROUND_TARGET.get(p.radius) ?? `within ${p.radius2} of it`,
  and6: (p) => `${TARGET_TEXT[p.target]}, and ${p.count} ${p.where}`,
  rangeRadius: (p) => `${p.range} range, ${p.radius} radius`,
  free: () => "Free",
  adrenaline: (p) => `${p.amount} adrenaline`,
  composedAmount: (p) => ` (${p.amount})`,
  energy8: (p) => `${p.cost} energy${p.base}${p.overcast}`,
  overcast: (p) => `, ${p.overcast} overcast`,
  instant: () => "Instant",
  composedActivationBase: (p) => (p.activation === p.base ? p.base : `${p.activation} (${p.base})`),
  dealsNoDamage: () => "Deals no damage",
  dealsOnlyDamageDamage: (p) =>
    p.weaponless
      ? `Deals only ${p.bonus}${p.damageType} damage`
      : `+${p.bonus}${p.damageType} damage`,
  damage4: (p) => `${p.condition}: +${p.more} damage`,
  damageOnThem: (p) => `+${p.amount} damage ${p.perCount}`,
  cannotBeBlocked2: () => "Cannot be blocked",
  cannotBeBlocked3: (p) => `${p.condition}: cannot be blocked`,
  chanceToMissWithOrLess: (p) => `${p.chance}% chance to miss with ${p.name} ${p.rank} or less`,
  resultsInACriticalHit: () => "Results in a critical hit",
  resultsInACriticalHit2: (p) => `${p.condition}: results in a critical hit`,
  hitsUpToAdjacentFoesToo: (p) => `Hits up to ${p.cleaveTargets} adjacent foes too`,
  hitsEveryAdjacentFoe: (p) => `${p.condition}: hits every adjacent foe`,
  armorPenetration2: (p) => `${p.armorPenetration}% armor penetration`,
  ifBlocked: (p) => `If blocked: ${lowerFirst(p.text)}`,
  onACriticalHit: (p) => `On a critical hit: ${lowerFirst(p.text)}`,
  ifItFailsToHit: (p) => `If it fails to hit: ${lowerFirst(p.text)}`,
  asItIsUsed: (p) => `As it is used: ${lowerFirst(p.text)}`,
  allYourPreparationsAreRemoved: () => "All your preparations are removed",
  fliesAsFast: (p) => `Flies ×${p.multiplier} as fast`,
  fliesAsFast2: (p) => `${p.condition}: flies ×${p.multiplier} as fast`,
  only: (p) => `; ${lowerAll(p.condition)}, only 1`,
  eachDealingLessDamage: (p) => `, each dealing ${p.value}% less damage`,
  strikesTwice: () => "Strikes twice",
  strikesTimes: (p) => `Strikes ${p.count} times`,
  shootsArrowsAtOnce: (p) => `Shoots ${p.count} arrows at once${p.weaker}${p.fewer}`,
  whileActivating: (p) => `While activating: ${p.status}`,
  easilyInterrupted: () => "Easily interrupted",
  failureChanceWithOrLess: (p) => `${p.chance}% failure chance with ${p.name} ${p.rank} or less`,
  activatesFasterSlower: (p) =>
    `${p.condition}: activates ${p.value}% ${p.multiplier < 1 ? "faster" : "slower"}`,
  healthGainFromDivineFavorIsDoubled: () => "Health gain from Divine Favor is doubled",
  projectilesEachCanBeDodged: (p) => `${p.shots} projectiles: each can be dodged`,
  aProjectileAtEachFoeEachCan: (p) =>
    p.spread === true
      ? "A projectile at each foe: each can be dodged"
      : "Projectile: can be dodged",
  halfTheNormalRange: () => "Half the normal range",
  orSacrificesHealthIfNoneIsNear: (p) =>
    `, or sacrifices ${p.elseSacrificePercent}% Health if none is near`,
  targetExploitsTheCorpseNearestYourTarget: (p) =>
    (p.near === "target"
      ? "Exploits the corpse nearest your target"
      : p.all === true
        ? `Exploits every fresh corpse ${AREA_TEXT.get(p.radius) ?? `within ${p.radius2}`}`
        : p.pick === "random"
          ? "Exploits a random corpse"
          : "Exploits the nearest corpse") + p.value,
  whileOnYourBarAHealthFights: (p) =>
    `While on your bar, a ${p.name} (${p.companionHealth} Health) fights beside you`,
  disabledForAfterUse: (p) => `Disabled for ${seconds(p.disabledAfterUseSeconds)} after use`,
  takeAllConditionsFromYourAlliesWith: () =>
    "Take all conditions from your allies, with the time each has left",
  hitOrMiss: (p) => `${p.text}, hit or miss`,
  eliteFlash: (p) => `${p.elite ? "Elite " : ""}${p.flash ? "Flash " : ""}${TYPE_TEXT[p.type]}`,
  moraleBoost: (p) =>
    p.rechargesOnMoraleBoost === true ? "Morale boost" : seconds(p.rechargeSeconds),
  hexHexesS2: (p) => (p.kind === "hex" ? "hexes" : `${p.kind}s`),
};
