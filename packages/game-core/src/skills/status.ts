/**
 * Conditions, hexes and enchantments (brief §12–§13).
 *
 * All three are *timed status effects* on a combatant and share one
 * lifecycle (apply → tick → expire/remove), so they share one
 * implementation parameterised by `category` rather than three parallel
 * systems that would inevitably drift apart. What differs between them is
 * genuine game rules, encoded as data here:
 *
 * - `condition`  — negative, applied by foes, removed by condition removal.
 * - `hex`        — negative, applied by foes, removed by hex removal.
 * - `enchantment`— positive, applied by allies, removed by enchantment removal/strip.
 * - `stance`     — positive, on yourself only, ended by stance removal (#465).
 * - `preparation`— on yourself only; changes your attacks while it lasts (#525).
 * - `glyph`      — on yourself only; changes your next spells, then is gone (#526).
 * - `shout`      — a shout's lingering effect (#524); no removal touches it.
 * - `chant`      — a chant's lingering effect (#758); no removal touches it.
 * - `weapon-spell`— a spell on an ally's weapon (#758), one at a time; not
 *   an enchantment, so enchantment removal leaves it.
 * - `form`       — a GW1 form on its caster (#1437), one at a time; not an
 *   enchantment, so no removal touches it. Its end stops what the bearer does.
 * - `skill-effect`— none of GW1's removable kinds: Healing Signet's armor
 *   loss while it is activated. No removal touches it either.
 *
 * Re-application does not stack duration (GW1-style): the longer of the
 * existing and incoming duration wins. That single rule is why a spammed
 * short condition cannot out-last one well-timed long one. An exclusive
 * category (`EXCLUSIVE_CATEGORIES`) is the exception: one at a time.
 */

import type { ConditionalArmor } from "../equipment/armor.js";
import { isElementalDamage, isPhysicalDamage, type DamageType } from "../equipment/types.js";
import { wieldsFor, type Weapon, type WeaponId } from "../equipment/weapons.js";
import type { ProfessionId } from "../professions.js";
import type { Vec2 } from "../vec2.js";
import {
  isSpell,
  type AttackWeaponClass,
  type AttributeScaling,
  type Combatant,
  type ConditionalBonus,
  type Skill,
  type SkillEffect,
  type SkillType,
} from "./types.js";
import { statAt } from "./scaling.js";
import { COMMON_STATUSES, type CommonStatusId } from "./statuses/common.js";
import { WARRIOR_STATUSES, type WarriorStatusId } from "./statuses/warrior.js";
import { RANGER_STATUSES, type RangerStatusId } from "./statuses/ranger.js";
import { MONK_STATUSES, type MonkStatusId } from "./statuses/monk.js";
import { NECROMANCER_STATUSES, type NecromancerStatusId } from "./statuses/necromancer.js";
import { MESMER_STATUSES, type MesmerStatusId } from "./statuses/mesmer.js";
import { ELEMENTALIST_STATUSES, type ElementalistStatusId } from "./statuses/elementalist.js";
import { ASSASSIN_STATUSES, type AssassinStatusId } from "./statuses/assassin.js";
import { RITUALIST_STATUSES, type RitualistStatusId } from "./statuses/ritualist.js";
import { PARAGON_STATUSES, type ParagonStatusId } from "./statuses/paragon.js";
import { DERVISH_STATUSES, type DervishStatusId } from "./statuses/dervish.js";

export type StatusCategory =
  | "condition"
  | "hex"
  | "enchantment"
  | "stance"
  | "preparation"
  | "glyph"
  | "shout"
  | "chant"
  /** A Paragon's echo (#1423): no removal touches one; only its end or a death does. */
  | "echo"
  | "weapon-spell"
  /**
   * A Ritualist's ashes (#1434), held while an item spell lasts. Nothing
   * removes them: every end is a drop, and fires its `ends` triggers.
   */
  | "item"
  | "form"
  | "skill-effect";

/**
 * Categories of which a combatant has at most one at a time (GW1): a new
 * one ends whichever is up, the same one included, and starts at its full
 * duration.
 */
export const EXCLUSIVE_CATEGORIES: ReadonlySet<StatusCategory> = new Set([
  "stance",
  "preparation",
  "glyph",
  "weapon-spell",
  "item",
  "form",
]);

export type StatusId =
  | CommonStatusId
  | WarriorStatusId
  | RangerStatusId
  | MonkStatusId
  | NecromancerStatusId
  | MesmerStatusId
  | ElementalistStatusId
  | AssassinStatusId
  | RitualistStatusId
  | ParagonStatusId
  | DervishStatusId;

/** A status's modifiers that hold only while its bearer is under another (#1485). */
export interface WhileUnder {
  /**
   * The bearer must have a status, not this one, of one of these
   * categories or one of these ids (#1873): either list matching counts,
   * and one of the two is not empty. Toxicity's "Poisoned or Diseased".
   */
  readonly categories: readonly StatusCategory[];
  readonly statusIds: readonly StatusId[];
  readonly attackDurationMultiplier: number;
  readonly adrenalineGainFaster: number;
  /** Summed into the bearer's pips as the status's own (#1654): Resilient Weapon's. */
  readonly healthPips: number;
  /** Summed into the bearer's armor against every type, as the status's own (#1654). */
  readonly armorModifier: number;
  /**
   * The bearer's chance to miss with attacks, joined with its other
   * `attackMissChance`s as they join each other (#1732): Well of
   * Darkness's "hexed foes miss 50% of the time".
   */
  readonly attackMissChance: number;
}

/** Health one pip of regeneration or degeneration is worth, per second (GW1). */
export const HEALTH_PER_PIP = 2;
/** Energy one pip of regeneration is worth, per second (GW1). */
export const ENERGY_PER_PIP = 1 / 3;
/** The most pips a net regeneration or degeneration can reach, either way (GW1). */
export const MAX_PIPS = 10;

/** A net pip count as it applies: clamped to `MAX_PIPS` either way. */
export function clampPips(pips: number): number {
  return Math.max(-MAX_PIPS, Math.min(MAX_PIPS, pips));
}

/**
 * A chance to block incoming attacks (#534): a blocked attack does nothing.
 * `against` says which attacks: melee blows, projectiles, or both. Spells
 * are never blocked.
 */
export interface BlockRule {
  readonly chance: number;
  readonly against: "all" | "melee" | "projectile";
}

/**
 * A status stat (#1976): flat, or scaled by the rank of its source in an
 * attribute, as GW1 writes Endure Pain's "90...258 Health". The rank is
 * the one captured as the status lands (`ActiveStatus.ranks`), and is read
 * through `statAt`.
 */
export type StatusStat = number | { readonly scaling: AttributeScaling };

/** The ranks of a status none of whose stats scale (#1976). */
export const NO_RANKS: ReadonlyMap<string, number> = new Map();

/** The fields of a `StatusDefinition` that are a `StatusStat`. */
type StatusStatKey = {
  [K in keyof StatusDefinition]: StatusStat extends StatusDefinition[K] ? K : never;
}[keyof StatusDefinition];

/** Every `StatusStatKey`: a field widened to `StatusStat` must be listed here. */
const STATUS_STAT_KEYS: Readonly<Record<StatusStatKey, true>> = {
  healthPips: true,
  armorModifier: true,
  maxHealthBonus: true,
  physicalDamageTakenBonus: true,
  attackDurationMultiplier: true,
  damageTakenMultiplier: true,
};

/** The attributes `id`'s scaled stats name, each once: what its source's ranks are read in. */
export function scaledStatAttributes(id: StatusId): readonly string[] {
  const definition = getStatusDefinition(id);
  const attributes = new Set<string>();
  for (const key of Object.keys(STATUS_STAT_KEYS) as StatusStatKey[]) {
    const stat = definition[key];
    if (typeof stat !== "number") {
      attributes.add(stat.scaling.attributeId);
    }
  }
  return [...attributes];
}

export interface StatusDefinition {
  readonly id: StatusId;
  readonly name: string;
  readonly category: StatusCategory;
  /**
   * The profession of the skill that applies it (#845): "Dervish
   * enchantment" asks this. `undefined`: a condition or anything no
   * profession owns.
   */
  readonly profession: ProfessionId | undefined;
  /**
   * The attribute of the skill that applies it (#1765), as `profession`:
   * "if target foe is suffering from a Water Magic hex" asks this.
   * `undefined`: not tagged, which only Elementalist hexes are so far.
   */
  readonly attribute: string | undefined;
  /**
   * Health regeneration while active, in GW1 pips (`HEALTH_PER_PIP`):
   * negative degenerates. Every status's pips sum, clamped to
   * `MAX_PIPS` either way, and apply continuously, not in lumps.
   */
  readonly healthPips: StatusStat;
  /**
   * Health pips for each enchantment on the bearer, itself included,
   * counting at most `max` (#845): Mystic Regeneration. Summed with
   * `healthPips`. `undefined`: none.
   */
  readonly healthPipsPerEnchantment: PipsPerEnchantment | undefined;
  /** Energy regeneration while active, in pips (`ENERGY_PER_PIP`), summed with the base. */
  readonly energyPips: number;
  /** Flat armor modifier while active. */
  readonly armorModifier: StatusStat;
  /**
   * Armor added against a hit only when its conditions hold (#1437), as
   * an insignia's: Avatar of Melandru's "+30 elemental armor".
   */
  readonly conditionalArmor: readonly ConditionalArmor[];
  /**
   * Armor added while the bearer is not moving (#921, `Combatant.moving`):
   * "Stand Your Ground!"'s +24.
   */
  readonly armorWhileStill: number;
  /**
   * Health per second healed while the bearer is moving (#921): "Fall
   * Back!"'s. A heal, so `healingMultiplier` scales it; not pips, so
   * outside `MAX_PIPS` and not regeneration.
   */
  readonly healthPerSecondWhileMoving: number;
  /**
   * Health per second healed, moving or not (#975): Spirit Light
   * Weapon's. A heal, like `healthPerSecondWhileMoving`: scaled by
   * `healingMultiplier`, outside `MAX_PIPS` and not regeneration.
   */
  readonly healthPerSecond: number;
  /**
   * Health per second healed on top of `healthPerSecond` while the bearer
   * is within earshot of a living spirit, any team's (#1064): Spirit Light
   * Weapon's "an additional 21 Health per second". A heal, as its sibling.
   */
  readonly healthPerSecondNearSpirit: number;
  /**
   * Armor taken before `armorModifier`s add, never below a floor (#763):
   * Cracked Armor's −20, not below 60. `undefined`: none.
   */
  readonly armorReduction: ArmorReduction | undefined;
  /** Movement speed multiplier while active (1 = unaffected). */
  readonly moveSpeedMultiplier: number;
  /**
   * Every status's `moveSpeedMultiplier` above 1 counts as 1 while it
   * holds (#1745): Muddy Terrain's "speed boosts have no effect". Slows
   * still apply.
   */
  readonly preventsSpeedBoosts: boolean;
  /**
   * When it ends, for any reason, its caster Shadow Steps back to where it
   * stood when it put it up (#1826): GW1's "you return to your original
   * location". Not when it is replaced by a recast of itself: that one
   * returns to where this one's would have with `recastKeepsPoint`
   * (#1930), as Shadow Walk's "you will return to your original location
   * (from the first time you used the skill)", and to its own cast spot
   * without, as Shadow of Haste's. `skillId` is the skill the step back is
   * logged as. `undefined`: no return.
   */
  readonly returnsSource:
    { readonly skillId: string; readonly recastKeepsPoint: boolean } | undefined;
  /**
   * When it ends, for any reason, its caster Shadow Steps to the ally it
   * was cast on, and all its skills are disabled for `disableSeconds`
   * (#1930): Recall's "when Recall ends, you Shadow Step to that ally".
   * Only a maintained one knows its ally (`stepTargetId`). Not when it is
   * replaced by a recast of itself, nor with either of the two dead.
   * `skillId` is the skill the step is logged as. `undefined`: no step.
   */
  readonly stepsToTarget: { readonly skillId: string; readonly disableSeconds: number } | undefined;
  /**
   * Chance in [0, 1] that the bearer's *attacks* miss. Drawn from the
   * injectable simulation RNG, never Math.random (brief §35).
   */
  readonly attackMissChance: number;
  /**
   * What the bearer loses of its maximum health (deep wound's signature):
   * `fraction` of it, at most `cap`. `undefined`: none.
   */
  readonly maxHealthLoss: MaxHealthLoss | undefined;
  /**
   * Maximum health added while it lasts (#1359): Endure Pain's "an
   * additional 90...300 Health". Gaining it raises health by as much;
   * losing it clamps health to the maximum left, so the extra is lost.
   */
  readonly maxHealthBonus: StatusStat;
  /**
   * Maximum health added for each enchantment on the bearer, any source's,
   * counted live (#1873): Symbiosis's "+27...150 maximum Health" for each.
   * Summed into `maxHealthBonus`; losing an enchantment clamps health as
   * losing that does. 0: none.
   */
  readonly maxHealthBonusPerEnchantment: number;
  /**
   * Maximum energy added while it lasts (#1464): Mighty Was Vorizun's 30.
   * Gaining it raises only the ceiling; losing it clamps energy to the
   * ceiling left, as `maxHealthBonus` does health.
   */
  readonly maxEnergyBonus: number;
  /**
   * Damage the bearer's minions add to each hit (#1915), before armor,
   * as Order of Undeath's "your minions deal +3...13...16 damage".
   */
  readonly minionDamageBonus: number;
  /**
   * The share of its effective maximum Health, in %, the bearer loses each
   * time one of its minions lands a hit (#1915): Order of Undeath's 2%.
   * Health loss, not damage or sacrifice.
   */
  readonly minionHitHealthLossPercent: number;
  /**
   * A condition the bearer would gain goes to its closest living minion
   * instead (#1915), as Infuse Condition. None alive: it lands on the
   * bearer.
   */
  readonly redirectsConditionsToMinion: boolean;
  /**
   * Multiplier on the heals the bearer receives from skills (1 = unaffected).
   * Regeneration and life steal ignore it.
   */
  readonly healingMultiplier: number;
  /**
   * Multiplier on the bearer's weapon roll (#762): weakness's 0.34. An
   * attack skill's bonus damage is not scaled.
   */
  readonly weaponDamageMultiplier: number;
  /**
   * Damage added to each physical hit the bearer takes (#1064):
   * Winnowing's 4. After the attacker's side and before armor, fixed
   * "deals only N damage" hits included: it is on the victim, not on the
   * attack.
   */
  readonly physicalDamageTakenBonus: StatusStat;
  /**
   * The type elemental damage the bearer takes becomes, before armor is
   * read (#1745): Winter's "all elemental damage is cold damage instead".
   * Cold, fire, lightning and earth turn; physical and the rest stay.
   * After the attacker's `attackDamageType`, so Conflagration's fire
   * arrows are cold under Winter. `undefined`: none.
   */
  readonly elementalDamageTakenAs: DamageType | undefined;
  /**
   * The type the bearer's attacks deal, the weapon's roll included
   * (#1021): Staggering Force's and Dust Cloak's "your attacks deal
   * earth damage". An attack skill's own `damageType` (Spear of
   * Lightning) still wins. `undefined`: the weapon's.
   */
  readonly attackDamageType: DamageType | undefined;
  /**
   * `attackDamageType` holds only while the bearer wields this weapon
   * (#1455): Avatar of Grenth's "your scythe attacks deal dark damage".
   * `undefined`: whatever it wields.
   */
  readonly attackDamageTypeWeapon: AttackWeaponClass | undefined;
  /**
   * The type every physical packet the bearer deals becomes, attacks and
   * skills alike (#1873): Greater Conflagration's "all physical damage is
   * fire damage instead". After the bearer's `attackDamageType` and before
   * the victim's `elementalDamageTakenAs`, so armor reads the new type.
   * `undefined`: none.
   */
  readonly physicalDamageDealtAs: DamageType | undefined;
  /**
   * The least armor penetration the bearer's weapon attacks have (#1519):
   * Judge's Insight's "+20% armor penetration". It joins the blow's and
   * Strength's: the highest counts, nothing adds. 0: none.
   */
  readonly attackArmorPenetration: number;
  /**
   * Added to each of the bearer's weapon blows before armor (#1654), a
   * plain swing's or an attack skill's, each blow of a dual attack:
   * Nightmare Weapon's "-10...50 damage". A blow never goes below 0.
   * Summed over statuses. 0: none.
   */
  readonly attackDamageDelta: number;
  /**
   * `attackDamageDelta` holds only while the bearer wields this weapon
   * (#1873): Favorable Winds' "arrows strike for +6 damage". `undefined`:
   * whatever it wields.
   */
  readonly attackDamageDeltaWeapon: AttackWeaponClass | undefined;
  /**
   * Added to the bearer's attributes in each scope (#762, #1941): weakness's
   * −1 to all, Glyph of Elemental Power's +2 to the elemental ones. A
   * negative one never lowers a rank bought at 0. Read through `rankOf`
   * alone (ADR-0019).
   */
  readonly attributeDeltas: readonly AttributeDelta[];
  /**
   * The bearer's rank in a set of attributes, whatever its sheet, runes
   * and deltas say (#1929): Wail of Doom's "all of target foe's
   * attributes are 0", Master of Magic's "your elemental attributes are
   * set to 13". The newest such status wins. Read through `rankOf`
   * alone. `undefined`: none.
   */
  readonly attributeSet: AttributeSet | undefined;
  /**
   * The bearer's next `spells` spells not of `attributeId` scale with its
   * rank in `attributeId` instead of their own attribute (#1929): Signet of
   * Illusions' "your next 3 non-Illusion spells use your Illusion
   * attribute". A spell spends one as it finishes. `undefined`: none.
   */
  readonly borrowsAttribute: BorrowedAttribute | undefined;
  /**
   * Multiplier on the bearer's spell cast time; >1 is a penalty. Dazed
   * doubles it. A signet or any other skill that is not a spell ignores
   * it (#524).
   */
  readonly castTimeMultiplier: number;
  /**
   * Multiplier on the activation of every skill the bearer starts that is
   * not an attack skill (#1473): spells, signets, shouts and the rest.
   * Migraine's "takes 100% longer to activate skills" is 2. It stacks with
   * `castTimeMultiplier`, so Dazed and Migraine make a spell 4× as long.
   */
  readonly skillActivationMultiplier: number;
  /**
   * GW1's daze (#546): applying it interrupts a spell the bearer is
   * casting, and so does every attack that lands on the bearer while it
   * lasts. Anything that is not a spell is left alone.
   */
  readonly interruptsSpells: boolean;
  /**
   * Multiplier on how long the bearer's attacks take, swings and attack
   * skills alike; <1 is faster (ADR-0029). "50% slower" is 1.5, as GW1
   * counts it.
   */
  readonly attackDurationMultiplier: StatusStat;
  /**
   * Multiplier on how fast the bearer's shots fly (#1742): Read the
   * Wind's "your arrows move twice as fast" is 2. Read as each shot is
   * released, so one in flight keeps its speed; a melee blow and a spell
   * ignore it. 1: the weapon's speed.
   */
  readonly projectileSpeedMultiplier: number;
  /**
   * The bearer cannot start a spell (#1234): Shroud of Silence's "cannot
   * cast spells". A spell already being cast goes off; anything that is
   * not a spell is left alone.
   */
  readonly preventsSpells: boolean;
  /**
   * The bearer cannot attack (#1575): Obsidian Flesh's "cannot attack". It
   * starts no auto-attack, a queued one stops, and an attack skill is
   * refused before anything is paid. An attack skill already being used
   * goes off; a spell or a touch skill is left alone.
   */
  readonly preventsAttacks: boolean;
  /**
   * The bearer cannot start a resurrection skill (#1745): Frozen Soil's
   * "cannot activate resurrection skills". Refused before anything is
   * paid, as `preventsAttacks` refuses an attack skill; one already being
   * cast goes off.
   */
  readonly preventsResurrection: boolean;
  /**
   * A foe of the bearer cannot start a spell with the bearer as its target
   * (#1511): Spell Breaker's "cannot be the target of enemy spells". A cast
   * already started goes off; an area or a splash still reaches the
   * bearer, and an ally's spell or a foe's non-spell is left alone.
   */
  readonly untargetableByFoeSpells: boolean;
  /**
   * A foe's spell whose chosen target is the bearer fails as it finishes
   * (#1951): Shadow Form's "hostile spells that target you fail". It is
   * paid for and recharges, as an interrupted one, and does nothing else.
   * Unlike `untargetableByFoeSpells` it may be started; an area or a
   * splash still reaches the bearer.
   */
  readonly foeSpellsFail: boolean;
  /**
   * Every blow at the bearer misses (#1951): Shadow Form's "attacks
   * against you miss", as a blind attacker's miss, never a block, so
   * nothing that answers a block fires.
   */
  readonly attacksAgainstMiss: boolean;
  /**
   * The bearer can hold no enchantment (#1732): Well of the Profane's
   * "stripped of all enchantments and cannot be the target of further
   * enchantments". Gaining it ends every enchantment on the bearer, its
   * triggers answering as for any removal; one applied later does not
   * land, and an enchantment spell is refused at it before anything is
   * paid, the bearer's own on itself included.
   */
  readonly preventsEnchantments: boolean;
  /**
   * The bearer cannot use a shout or a chant (#1732): Well of Silence's.
   * Refused before anything is paid, as `preventsAttacks` refuses an
   * attack skill; one already used is not undone.
   */
  readonly preventsShoutsAndChants: boolean;
  /**
   * The bearer cannot block an attack of the status's source (#1234):
   * Expose Defenses' "cannot block your attacks". Anyone else's still
   * rolls block.
   */
  readonly unblockableBySource: boolean;
  /**
   * The bearer cannot block at all (#1332): Rigor Mortis's "cannot block".
   * Every attack, melee or projectile, from anyone, rolls no block.
   */
  readonly preventsBlocking: boolean;
  /**
   * Seconds it starts again for when it runs out while the bearer is
   * moving (#1234): Enduring Toxin's "if that foe is moving when it would
   * end, it is renewed". Any other end is final. `undefined`: it ends.
   */
  readonly renewsWhileMoving: number | undefined;
  /** While active, a knockdown does nothing to the bearer (#468). */
  readonly preventsKnockdown: boolean;
  /** It ends when it stops a knockdown (#845): Fleeting Stability. */
  readonly endsOnKnockdownPrevented: boolean;
  /**
   * A critical hit on the bearer deals a normal roll, not the weapon's
   * critical damage (#1329): Balanced Stance's "you do not suffer extra
   * damage from a critical attack". It is still a critical for the
   * attacker.
   */
  readonly ignoresCriticalDamage: boolean;
  /** The bearer's chance to block attacks; `undefined`: none. */
  readonly block: BlockRule | undefined;
  /**
   * `block` holds only while the bearer's health is below this share of
   * its maximum after a deep wound (#988): Shroud of Distress's "if you
   * are below 50% Health". `undefined`: at any health.
   */
  readonly blockBelowHealth: number | undefined;
  /** Added to the bearer's chance to land a critical hit (#988): Critical Eye's 0.13. */
  readonly criticalChanceBonus: number;
  /** Energy the bearer gains on each critical hit it lands, beyond Critical Strikes' (#988). */
  readonly energyPerCritical: number;
  /**
   * Health the bearer gains on each critical hit it lands (#1326): Way of
   * Perfection's. A gain, not a heal: no healing modifier touches it.
   */
  readonly healthPerCritical: number;
  /**
   * Each critical hit the bearer lands puts its remaining time back to
   * the duration it was applied with (#1315): Critical Defenses'.
   */
  readonly refreshesOnCritical: boolean;
  /**
   * It ends after this many incoming attacks, each a hit or a block
   * (#524); `undefined`: only its duration ends it. Counted on each
   * bearer's own status, so allies sharing a shout wear theirs out apart.
   */
  readonly endsAfterAttacks: number | undefined;
  /**
   * The bearer's next this many attacks cannot be blocked, and then it
   * ends (#1604): Guiding Hands'. One swing or one attack skill spends 1,
   * hit or miss, a cleave's and a double strike's blows included; a shot
   * keeps what it was released with. `undefined`: blocks as ever.
   */
  readonly unblockableAttacks: number | undefined;
  /**
   * It ends after this many of the bearer's attacks (#1916): Signet of
   * Strength's "your next 13 attacks". A hit, a miss and a block each
   * spend one, as `unblockableAttacks` does, a cleave's one swing too.
   * `undefined`: no such limit.
   */
  readonly endsAfterAttackCount: number | undefined;
  /**
   * Every attack of the bearer's cannot be blocked while it lasts, and
   * nothing is spent (#1654): Guided Weapon's. false: blocks as ever.
   */
  readonly attacksUnblockable: boolean;
  /**
   * Effects on whoever the bearer's physical attacks hit while it lasts
   * (#525): a preparation's rider, as Apply Poison's poison. Applied
   * where a blow lands, swing, attack skill or arrow alike, never on a
   * miss or a block.
   */
  readonly onAttackHit: AttackHitRider | undefined;
  /**
   * Effects on whoever blocks one of the bearer's physical attacks while
   * it lasts (#1974), shaped as `onAttackHit`: Glass Arrows' Bleeding on
   * a foe that blocked an arrow. A miss is no block, so it adds nothing.
   */
  readonly onAttackBlocked: AttackHitRider | undefined;
  /**
   * It ends after this many of the bearer's hits with a weapon of
   * `weapon` (#939): Sand Shards' "the next 4 times you hit with a
   * scythe". Each victim a blow lands on is a hit, a cleave's included;
   * a blow of another weapon spends none. `undefined`: no such limit.
   */
  readonly endsAfterHits: EndsAfterHits | undefined;
  /**
   * What it does to the bearer's next spells (#526): each costs
   * `costReduction` less energy, and it ends once `count` spells have
   * started. `undefined`: spells leave it alone.
   */
  readonly nextSpells: NextSpells | undefined;
  /**
   * It spreads (#765): every living combatant adjacent to a bearer, on
   * either team, catches it, once per outbreak. Disease's signature.
   */
  readonly spreads: boolean;
  /**
   * Effects on whoever the bearer's next attack skill hits (#758): a
   * chant's rider, as Anthem of Flame's burning. It ends when that attack
   * skill resolves, hit, miss or block, and applies only on a hit.
   * `undefined`: attack skills leave it alone.
   */
  readonly nextAttackSkill: readonly SkillEffect[] | undefined;
  /**
   * More damage on the bearer's next attack skill's blows (#1505), in the
   * blow, read on each victim before it lands: Anthem of Envy's "+10...20
   * damage against foes with more than 50% Health". Spent as
   * `nextAttackSkill` is. `undefined`: attack skills leave it alone.
   */
  readonly nextAttackSkillBonus: ConditionalBonus | undefined;
  /**
   * What the bearer's next skills of a kind do for the bearer itself
   * (#1483): once a matching skill's use completes, its effects resolve
   * on the bearer, and it ends after `count` of them. An interrupted skill
   * and a weapon swing do not count. `undefined`: skills leave it alone.
   */
  readonly nextSkill: NextSkill | undefined;
  /**
   * How the bearer's next skill of a kind goes (#1505): it cannot be
   * interrupted, cannot be blocked, or costs less. Consumed as that skill
   * starts, before its cost is paid, and it ends then; an interrupt later
   * does not give it back. `undefined`: skills leave it alone.
   */
  readonly nextSkillRule: NextSkillRule | undefined;
  /**
   * It ends the moment the bearer attacks (#758): strikes a blow or
   * releases a shot, swing or attack skill alike. A weapon spell's price.
   */
  readonly endsWhenBearerAttacks: boolean;
  /**
   * It ends the moment the bearer makes a melee attack (#976): a swing or
   * a melee attack skill, hit, miss or block. A shot or a thrown spear
   * keeps it. Escape's price.
   */
  readonly endsWhenBearerAttacksInMelee: boolean;
  /**
   * It ends the moment one of the bearer's attacks hits (#919): a blow
   * lands, swing, attack skill or arrow alike. A miss or a block keeps
   * it. Dark Escape's price.
   */
  readonly endsWhenBearerHits: boolean;
  /**
   * It ends the moment one of the bearer's attacks fails to hit (#1742):
   * a blow or arrow missed, was blocked, was dodged or struck a wall.
   * Seeking Arrows' "ends if you fail to hit".
   */
  readonly endsWhenBearerMisses: boolean;
  /**
   * It ends the moment the bearer uses a skill (#949), after its own
   * triggers have answered that use: Diversion's "the next time target
   * foe uses a skill". An interrupted or cancelled skill is not used.
   */
  readonly endsWhenBearerUsesSkill: boolean;
  /**
   * It ends the moment the bearer uses an adrenal skill (#1329), as
   * `endsWhenBearerUsesSkill` does for any: Disciplined Stance's "ends if
   * you use an adrenal skill".
   */
  readonly endsWhenBearerUsesAdrenalSkill: boolean;
  /**
   * It ends the moment the bearer starts an attack skill (#1869), before
   * that attack is timed, so the attack does not get its speed: Heket's
   * Rampage's "ends if you use an attack skill". A plain swing keeps it.
   */
  readonly endsWhenBearerUsesAttackSkill: boolean;
  /**
   * It ends, unspent, the moment the bearer starts a skill its
   * `nextSkillRule` does not answer (#1730): Glyph of Sacrifice's "ends
   * prematurely if you use a non-spell skill".
   */
  readonly endsWhenBearerUsesOtherSkill: boolean;
  /**
   * It ends once one of its triggers has fired (#1022): Vengeful Weapon's
   * and Weapon of Remedy's "the next time". Ended where the trigger fires,
   * after its effects, logged as its expiry.
   */
  readonly endsWhenTriggered: boolean;
  /**
   * It ends the moment one of the bearer's attack skills hits (#956): a
   * plain swing or arrow keeps it, as does a miss or a block. Defensive
   * Anthem's price.
   */
  readonly endsWhenBearerHitsWithAttackSkill: boolean;
  /**
   * It ends the moment a new status of one of these categories lands on
   * the bearer (#919): Natural Stride's hex or enchantment. A refresh of
   * one already on it does not end it.
   */
  readonly endsWhenBearerGains: readonly ("hex" | "enchantment")[];
  /**
   * Statuses that never land on the bearer (#1455): Avatar of Grenth's
   * "you are immune to Disease". An apply or a spread does nothing, and
   * one already on the bearer ends as this one begins.
   */
  readonly immuneTo: readonly StatusId[];
  /**
   * Multiplier on the damage the bearer takes (#919): Frenzy's 1.6, Dark
   * Escape's 0.5. Applied to every damage packet after armor; health
   * loss and degeneration never pass through it.
   */
  readonly damageTakenMultiplier: StatusStat;
  /**
   * Taken off every damage packet the bearer takes, after armor and
   * `damageTakenMultiplier` (#1108): Call of Protection's 17. Never below 0.
   */
  readonly damageReduction: number;
  /**
   * As `damageReduction`, by the bearer's rank in `attributeId` (#1592):
   * `perRank` a rank, at most `max`, Shield Stance's "reduced by 2 for each
   * rank of Strength (maximum 15)". Read as each packet lands, so a
   * Tactics-only bearer takes nothing off. `undefined`: none.
   */
  readonly damageReductionPerRank:
    { readonly attributeId: string; readonly perRank: number; readonly max: number } | undefined;
  /**
   * As `damageReduction`, but only while the bearer is activating a skill
   * of `skillType` (#1827): Armor of Unfeeling's "10 base damage reduction
   * while casting binding rituals". Read as each packet lands, so it ends
   * the moment the activation finishes or is interrupted. `undefined`: none.
   */
  readonly damageReductionWhileCasting:
    { readonly skillType: SkillType; readonly amount: number } | undefined;
  /**
   * Damage from a dealer carrying a hex of `attributeId` is cut by
   * `fraction` (#1951): Mist Form's "33% less damage from foes under a
   * Water Magic hex". Read as each packet lands, after every other
   * mitigation; several multiply. `undefined`: none.
   */
  readonly damageReductionFromHexedSource:
    { readonly attributeId: string; readonly fraction: number } | undefined;
  /**
   * Damage of `type` the bearer takes is multiplied by `multiplier` (#1964):
   * Mantra of Flame's "fire damage you take is reduced by 45%", 0.55.
   * Read as each packet lands, after `damageTakenMultiplier`, of the type
   * as taken (after `elementalDamageTakenAs`). `undefined`: none.
   */
  readonly damageTypeTakenMultiplier:
    { readonly type: DamageType; readonly multiplier: number } | undefined;
  /**
   * The bearer is destroyed when this runs its time (#1827), as
   * `destroy-target-spirit` destroys: no corpse, no killer, no morale.
   * Signet of Ghostly Might's "After 10 seconds, that creature is
   * destroyed". Only a summoned creature is; a removal before its time,
   * or the bearer dying first, destroys nothing.
   */
  readonly destroysBearerOnExpiry: boolean;
  /**
   * The share of each physical hit on the bearer that its source takes
   * instead (#1108): Symbiotic Bond's 0.5, rounded down. 0: none.
   */
  readonly redirectsPhysicalDamage: number;
  /**
   * The most of its max health the bearer can lose to one hit (#936):
   * Protective Spirit's 0.1. Applied last in `mitigate`, so it caps
   * every typed damage packet; degeneration and sacrifice are not hits.
   * `undefined`: no cap.
   */
  readonly maxDamageFractionPerHit: number | undefined;
  /**
   * As `maxDamageFractionPerHit`, but only for an attack's blow (#1265):
   * Shelter's 0.1, after everything else in `mitigate`. A spell, life
   * steal and degeneration are not capped. `undefined`: no cap.
   */
  readonly attackDamageCapFraction: number | undefined;
  /** Taken off every life steal on the bearer (#1265): Union's 15. Never below 0. */
  readonly lifeStealReduction: number;
  /**
   * Every Health sacrifice the bearer makes is multiplied by this (#1979):
   * Awaken the Blood's 1.5. Not "lose N Health", which is no sacrifice. 1: none.
   */
  readonly sacrificeMultiplier: number;
  /**
   * A knockdown of the bearer lasts at least this long (#1265):
   * Earthbind's 3 s. `undefined`: as long as it says.
   */
  readonly knockdownMinSeconds: number | undefined;
  /**
   * The health the status's source loses each time the status changes an
   * outcome for its bearer (#1265): a protective spirit paying for its
   * protection, Shelter's 51 for a capped blow. Plain health loss, no
   * armor, and it can kill; a source already dead or gone pays nothing.
   * `undefined`: the protection is free.
   */
  readonly sourceLosesHealth: number | undefined;
  /**
   * The next damage or life steal the bearer would take heals it instead,
   * up to this much, and the status ends (#987): Reversal of Fortune's 67.
   * The whole packet is negated, after `mitigate`; degeneration and
   * sacrifice are neither. `undefined`: no reversal.
   */
  readonly reversesNextDamage: number | undefined;
  /**
   * The next damage or life steal that would kill the bearer is dropped
   * whole, and the status ends (#1789): Judge's Intervention's. After
   * invulnerability, a reversal, a bond's share and a guard; damage that
   * leaves the bearer alive passes and does not spend it. Its
   * `bearer-fatal-damage-negated` triggers fire at the dealer.
   */
  readonly negatesFatalDamage: boolean;
  /**
   * A share of each attack's damage that hits the bearer goes back to the
   * attacker (#1754): Holy Wrath's. `undefined`: none.
   */
  readonly reflectsAttackDamage: ReflectsAttackDamage | undefined;
  /**
   * Strikes of adrenaline the bearer gains on top of each hit it lands
   * (#936): "For Great Justice!"'s 1. Taking damage is not a hit.
   */
  readonly extraStrikesPerHit: number;
  /**
   * The bearer gains adrenaline this much faster (#1455), from hits,
   * damage taken and skills alike: Avatar of Balthazar's 0.25.
   */
  readonly adrenalineGainFaster: number;
  /**
   * The share taken off the recharge of each spell the bearer finishes
   * (#938): Mantra of Recovery's 0.33. Read as the recharge starts, so
   * a recharge already running keeps its length when the status ends.
   */
  readonly spellRechargeFaster: number;
  /**
   * The share taken off the recharge of each skill the bearer finishes,
   * of any type (#1539): Serpent's Quickness's 0.33. Read as
   * `spellRechargeFaster` is; with a type's own share, the larger counts.
   */
  readonly skillRechargeFaster: number;
  /**
   * Multiplier on the base Energy cost of every skill the bearer uses
   * (#1745): Quickening Zephyr's "cost 30% more of the base Energy" is
   * 1.3. Several multiply; the base is scaled and rounded half up before
   * Expertise, a glyph or a chant takes anything off. 1: unaffected.
   */
  readonly energyCostMultiplier: number;
  /**
   * The share taken off the recharge of each binding ritual the bearer
   * finishes (#1064): Weapon of Quickening's 0.33, read as
   * `spellRechargeFaster` is.
   */
  readonly bindingRitualRechargeFaster: number;
  /**
   * The share taken off the recharge of each enchantment of `profession`
   * the bearer finishes (#1455), flash ones included: Avatar of Lyssa's
   * 0.5 for Dervish enchantments. Read as `spellRechargeFaster` is; with
   * it, the larger share counts. `undefined`: none.
   */
  readonly enchantmentRechargeFaster: EnchantmentRechargeFaster | undefined;
  /**
   * How the bearer's own skills of a kind go while it lasts (#1761):
   * Divine Spirit's "Monk spells cost 5 less Energy", Practiced Stance's
   * "preparations recharge 50% faster and last longer". `[]`: none.
   */
  readonly ownSkillModifiers: readonly OwnSkillModifier[];
  /**
   * Armor penetration added to the damage of each of the bearer's skills
   * of `profession` (#1464): Cruel Was Daoshen's 0.1 for Ritualist skills.
   * A weapon blow, a creature's attack and degeneration are not skills.
   * Added to the skill's own, at most 1 in all. `undefined`: none.
   */
  readonly skillArmorPenetration: SkillArmorPenetration | undefined;
  /**
   * Nothing interrupts the bearer's casts while it lasts (#1464): Tranquil
   * Was Tanasen's. The interrupting skill's other effects still land; a
   * knockdown still cancels the cast.
   */
  readonly uninterruptible: boolean;
  /**
   * Stops an interrupt of the bearer's cast or swing (#1964), checked
   * after `uninterruptible`, which spends nothing. `once`: Mantra of
   * Concentration's "the next time you would be interrupted, you are not",
   * and it ends. `pay-energy`: Mantra of Resolve's, `amount` Energy a
   * stop, and with less the status ends and the interrupt lands. A
   * knockdown is no interrupt and goes by. `undefined`: none.
   */
  readonly interruptGuard: InterruptGuard | undefined;
  /**
   * The bearer's conditions run out this much faster (#1464): Pure Was Li
   * Ming's 0.5 takes `dt × 1.5` off each a tick. Hexes and enchantments
   * keep their rate.
   */
  readonly conditionsExpireFaster: number;
  /**
   * Multiplier on how long a hex takes to cast on the bearer (#944): Holy
   * Veil's 2. Read once, as the cast begins; an instant hex stays instant.
   */
  readonly incomingHexCastTimeMultiplier: number;
  /**
   * Damage added to each spirit's attack that hits the bearer (#1270):
   * Painful Bond's 18. Armor-ignoring, on the same blow; a missed or
   * blocked one adds nothing.
   */
  readonly damageFromSpiritAttacks: number;
  /**
   * The next hex about to land on the bearer fails, and the status ends
   * (#1403): Hex Breaker's. Its caster takes `damage`, typeless, from the
   * bearer, logged as `skillId`. Only the hex is stopped: the rest of the
   * spell lands. `undefined`: hexes land.
   */
  readonly breaksNextHex: { readonly damage: number; readonly skillId: string } | undefined;
  /**
   * The next spell the bearer finishes on a target of this side fails, and
   * the status ends (#1475): Guilt's and Mistrust's foe, Shame's ally. The
   * spell is paid for and recharges, as an interrupted one, and does
   * nothing else. `undefined`: spells go off.
   */
  readonly failsNextSpell: FailsNextSpell | undefined;
  /**
   * The next this many touch skills a foe uses on the bearer fail, and
   * the status ends after the last (#1966): "Can't Touch This!". Each is
   * paid for and recharges, as a failed spell. `undefined`: they land.
   */
  readonly failsFoeTouchSkills: number | undefined;
  /**
   * Every whole second it has been on the bearer, a pulse of growing
   * damage from its source hits the source's foes near it, and the bearer
   * if it says so (#1501): Wastrel's Demise's, or Balthazar's Aura's on an
   * ally (#1754). `undefined`: none.
   */
  readonly damagePulse: DamagePulse | undefined;
  /**
   * Whenever a chant or a shout ends on the bearer, its remaining time is
   * back to the duration it was applied with (#1423): a refrain's "this
   * echo is reapplied every time a chant or shout ends on you".
   */
  readonly renewsOnChantOrShoutEnd: boolean;
  /**
   * Whenever the bearer casts a spell, its remaining time is back to the
   * duration it was applied with (#1614): Kinetic Armor's "whenever you
   * cast a spell, Kinetic Armor is renewed for 12 seconds".
   */
  readonly renewsOnBearerSpell: boolean;
  /**
   * It ends once its triggers have fired this many times (#1423): Finale
   * of Restoration's "the next 5 times". `undefined`: no such limit.
   */
  readonly endsAfterTriggers: number | undefined;
  /**
   * Multiplier on the duration of a chant or a shout applied to the bearer
   * while it lasts (#1423): Enduring Harmony's 1.5. One already up keeps
   * the time it has, and one applied keeps its longer time after this
   * ends.
   */
  readonly chantShoutDurationMultiplier: number;
  /**
   * Modifiers it adds only while the bearer holds another status of one
   * of its categories (#1485): Soldier's Fury's "if you are under the
   * effects of a chant or a shout". `undefined`: none.
   */
  readonly whileUnder: WhileUnder | undefined;
  /**
   * It does nothing while the bearer holds another status of one of
   * these categories (#1916): Brutal Weapon's "as long as the bearer is
   * under no enchantments". Its time runs on. `undefined`: always counts.
   */
  readonly suppressedWhileUnder: readonly StatusCategory[] | undefined;
  /**
   * What it does when its bearer does something (#469): Backfire's damage
   * on each spell the bearer finishes. Applied by whoever put it on.
   */
  readonly triggers: readonly StatusTrigger[];
}

/**
 * Something that happens to the bearer that a status answers (#469):
 * it casts a spell, attacks, gains a condition it did not have (#887), or
 * the status itself ends, for any reason but a refresh or a reset (#887).
 * Or (#935) it completes any skill, lands a hit, or loses health to
 * physical damage. `expires` is only the end of its duration (#944):
 * Patient Spirit's "unless it ends prematurely". Or (#1022) it loses
 * health to damage or life steal from a foe. Or (#1329) it blocks a melee
 * or a projectile attack: only the status that blocked answers. Or
 * (#1332) one of its blows fails to hit.
 */
export type StatusTriggerEvent =
  | "bearer-casts-spell"
  | "bearer-attacks"
  /**
   * The bearer begins an attack (#1593), before it resolves: an attack
   * skill as its activation begins, a plain swing at its blow, before an
   * arrow leaves or the blow lands. Fired by the simulation. What answers
   * may cancel it (`cancel-attack`); a cancelled blow never `attacks`.
   */
  | "bearer-attack-begins"
  | "bearer-uses-skill"
  /**
   * A hex the bearer put on a foe landed, new or renewed (#1951): once per
   * foe, an area hex's too, of `StatusTrigger.appliedHex`'s attributes.
   * Elemental Flame's "whenever you apply an Elemental hex". Recorded on
   * the hexed foe, and fired at the drain, at it.
   */
  | "bearer-applies-hex"
  | "bearer-hits"
  /**
   * One of the bearer's blows did not land (#1332): it missed on a roll
   * (blind, Price of Failure) or the victim blocked it. A blow that never
   * reached, its victim dead, gone or dodging, is not a fail. Recorded,
   * and fired at the drain, as hits are.
   */
  | "bearer-fails-to-hit"
  | "bearer-takes-physical-damage"
  /**
   * The bearer lost health to damage or life steal from a foe (#1022):
   * any typed packet through `applyDamage`, or a `stealLife`, whose dealer
   * is on the other team. Degeneration, sacrifice and a reversed packet are
   * neither. Recorded with the dealer, and fired at the drain, as hits are.
   */
  | "bearer-takes-damage-from-foe"
  /**
   * One packet of damage or one life steal, from anyone, took the bearer
   * from at least `StatusTrigger.healthBelow` of its effective maximum
   * Health to below it (#1789): Watchful Intervention's "the next time
   * damage drops target ally's Health below 25%". Health loss and
   * degeneration are not damage. Recorded with the dealer, the offender
   * when there is one, and fired at the drain; a status waiting to answer
   * one does not answer another.
   */
  | "bearer-health-drops-below"
  /**
   * The bearer's status that negates fatal damage (#1789) dropped a
   * killing packet and ended: only that status's triggers fire, at the
   * dealer, the offender when there is one. Recorded, and fired at the
   * drain.
   */
  | "bearer-fatal-damage-negated"
  /**
   * An attack by a foe hit the bearer (#1464): a swing, an attack skill or
   * an arrow that landed, never a miss or a block. Recorded with the
   * attacker, who is the offender, and fired at the drain, as damage from a
   * foe is. Vengeful Was Khanhei's.
   */
  | "bearer-hit-by-attack"
  /**
   * A skill's heal effect landed on the bearer (#1913), its amount above
   * 0, an overheal at full Health too: Soul Bind's. Pips, regeneration,
   * life steal and Divine Favor's bonus are no such heal. Recorded with
   * the healer, the offender, and fired at the drain, as damage from a
   * foe is.
   */
  | "bearer-healed-by-skill"
  /**
   * The bearer blocked a melee or a projectile attack (#1329), and the
   * status holding the trigger is the one whose share the block roll fell
   * in. Recorded with the attacker, who is the offender, and fired at the
   * drain, as damage from a foe is.
   */
  | "bearer-blocks-melee"
  | "bearer-blocks-projectile"
  /**
   * The bearer blocked any attack, melee or projectile, by any status
   * (#1403): every status on it that answers fires, not only the one that
   * blocked. Defile Defenses'. Recorded with the block.
   */
  | "bearer-blocks"
  /**
   * The bearer's skill was interrupted, by any source (#1473): an
   * interrupt effect, Dazed or a hit that breaks an easily interrupted
   * cast. A knockdown is no interrupt. Recorded with the interrupter,
   * the offender, and fired at the drain, as damage from a foe is.
   * Frustration's.
   */
  | "bearer-interrupted"
  /**
   * The bearer was knocked down, by any source (#1873): a new knockdown,
   * not one stopped, and never one on a body already down. Brambles'.
   * Recorded with the triggers that answered, and fired at the drain.
   */
  | "bearer-knocked-down"
  /**
   * A hex or an enchantment landed on the bearer, new or renewed (#1403):
   * Soul Barbs'. A refresh that changes nothing is no gain, and the status
   * gained never answers its own landing. Recorded with the triggers that
   * answered and the gained status's source, and fired at the drain.
   */
  | "bearer-gains-hex-or-enchantment"
  /** As `bearer-gains-hex-or-enchantment`, for an enchantment only: Scourge Enchantment's. */
  | "bearer-gains-enchantment"
  /**
   * An enchantment on the bearer ended (#1437), for any reason but the
   * bearer's death: expiry, a strip, its own rule. Once per enchantment
   * lost, of `StatusTrigger.profession` if it names one: Avatar of
   * Melandru's "whenever you lose a Dervish enchantment". Recorded with the
   * triggers that answered, and fired at the drain.
   */
  | "bearer-loses-enchantment"
  /**
   * The bearer created a creature (#1316): a spirit or a minion, once for
   * each, as it enters the world. A pet is charmed, not created. Fired by
   * the simulation from the summon itself, with the creature.
   */
  | "bearer-creates-creature"
  | "bearer-gains-condition"
  /**
   * A condition on the bearer ended (#1475), expired or removed, for any
   * reason but the bearer's death: once per condition lost. A refresh is
   * no loss. Fragility's. Recorded with the triggers that answered, and
   * fired at the drain.
   */
  | "bearer-loses-condition"
  /**
   * A chant or a shout ended on the bearer (#1423), for any reason but a
   * refresh: its duration, an "ends when" rule or a removal. Every status
   * still on the bearer that answers it fires, in `active` order; a dead
   * bearer's have ended with it. An echo's.
   */
  | "bearer-chant-or-shout-ends"
  /**
   * The bearer has no energy left (#1583): checked each step, after
   * upkeep, so it fires every step it stays at 0 until the status ends.
   * Wither's "if target foe's Energy reaches 0", which ends when triggered.
   * A dead bearer never answers.
   */
  | "bearer-energy-empty"
  /**
   * The bearer's whole Energy dropped to 0 (#1956): checked as
   * `bearer-energy-empty`, when it is below 1 and had at least 1 at the
   * last check, so once per drop. Famine's "reaches 0 Energy".
   * A dead bearer never answers.
   */
  | "bearer-energy-drops-empty"
  /**
   * The bearer died while it was on (#1762): only what a death ends,
   * never an expiry or a removal earlier in the same tick. GW1's "if
   * target foe dies while hexed with this". `ends` and `ends-early`
   * answer a death too.
   */
  | "bearer-dies"
  | "ends"
  /**
   * It ended before its time ran out (#1421): stripped, cut short by its
   * own rule, or its bearer died. GW1's "if this enchantment ends
   * prematurely". A refresh is no end.
   */
  | "ends-early"
  | "expires";

/**
 * `StatusDefinition.damagePulse` (#1501). Pulse `k`, at `k` whole
 * seconds since the status was applied, deals `damage + growth × (k − 1)`.
 * A status that ends between pulses deals no partial one, and a renewal
 * starts the count again at 1.
 */
export interface DamagePulse {
  /** The first pulse's damage. */
  readonly damage: number;
  /** Added to each pulse after the first. */
  readonly growth: number;
  readonly type: DamageType;
  /** The source's foes within this of the bearer are hit. */
  readonly radius: number;
  /** Whether the bearer is hit too (#1754): a hex's is, an ally's enchantment's is not. */
  readonly hitsBearer: boolean;
  readonly skillId: string;
}

/** A `damagePulse` that came due on the bearer (#1501): what it deals, from whom. */
export interface StatusPulse {
  readonly id: StatusId;
  readonly sourceId: string;
  readonly damage: number;
}

/** Within a hair, as a swing is: twenty additions of 0.05 fall just short of 1. */
const PULSE_EPSILON = 1e-6;

/**
 * `StatusDefinition.reflectsAttackDamage` (#1754). Each foe's attack that
 * hits the bearer costs that attacker `min(share × damage the bearer
 * took, max)` damage of `type`, from the status's source, logged as
 * `skillId`; a blow that took nothing reflects nothing. After `times`
 * reflections the status ends. A reflection is no attack, so it is never
 * reflected again, and one at an attacker dead or gone does not count.
 */
export interface ReflectsAttackDamage {
  readonly share: number;
  readonly max: number;
  readonly type: DamageType;
  readonly times: number;
  readonly skillId: string;
}

/** `StatusDefinition.skillArmorPenetration` (#1464). */
export interface SkillArmorPenetration {
  readonly share: number;
  readonly profession: ProfessionId;
}

/** `StatusDefinition.interruptGuard` (#1964). */
export type InterruptGuard =
  { readonly kind: "once" } | { readonly kind: "pay-energy"; readonly amount: number };

/** `StatusDefinition.failsNextSpell` (#1475). */
export interface FailsNextSpell {
  /**
   * Which spells it catches, by the side of the spell's chosen target:
   * one on the other team from the bearer, or one on its own, the bearer
   * included when it targeted itself. A spell with no chosen target, a
   * "you" spell, a well or a ward, never matches.
   */
  readonly on: "foe-targeted" | "ally-targeted";
  /** Applied with the status's source as caster and the bearer as target. */
  readonly effects: readonly SkillEffect[];
  /** What the failure is logged as. */
  readonly skillId: string;
}

/** Which of the bearer's own skills a modifier touches (#1761). All set fields must match. */
export interface OwnSkillFilter {
  /** `spell` is any `isSpell` type. */
  readonly type: SkillType | "spell" | undefined;
  readonly attributeId: string | undefined;
  readonly profession: ProfessionId | undefined;
}

/** `StatusDefinition.ownSkillModifiers` (#1761). */
export interface OwnSkillModifier {
  readonly filter: OwnSkillFilter;
  /**
   * The Energy the skill costs as its base (#1886), even one with no cost
   * of its own, as Primal Echoes' "signets cost 10 Energy"; then raised,
   * cut and discounted as any. `undefined`: its own.
   */
  readonly energyBase: number | undefined;
  /** Energy off the cost, never below `energyFloor`. 0: none. */
  readonly energyDiscount: number;
  /**
   * The least a discount leaves (#1886); a cost already below it is left
   * alone, as Energizing Wind's "minimum cost 10 Energy". 1: never below 1.
   */
  readonly energyFloor: number;
  /** Energy on the cost after the discount (#1886), as Roaring Winds'. 0: none. */
  readonly energySurcharge: number;
  /** On activation time. 1: none. */
  readonly activationMultiplier: number;
  /** The share taken off the recharge, as `spellRechargeFaster`. 0: none. */
  readonly rechargeFaster: number;
  /**
   * The share the recharge grows by once `rechargeFaster` is off (#1886),
   * as Energizing Wind's "recharge 25% slower". 0: none.
   */
  readonly rechargeSlower: number;
  /** On the duration of every status the skill applies, to anyone. 1: none. */
  readonly durationMultiplier: number;
  /** On every heal the skill does. 1: none. */
  readonly healMultiplier: number;
  /** Its cast is not easily interrupted (#1966), as Trapper's Focus's traps. */
  readonly notEasilyInterrupted: boolean;
  /** Skills it answers before the status ends; `undefined`: as long as the status lasts. */
  readonly uses: number | undefined;
}

/**
 * What every matching `OwnSkillModifier` on a caster does to one use of a
 * skill (#1761), taken as it is paid for and kept by the cast: discounts
 * and surcharges add, multipliers multiply, the highest base, floor
 * and recharge shares count, and any one's "not easily interrupted".
 */
export interface OwnSkillBoost {
  readonly energyBase: number | undefined;
  readonly energyDiscount: number;
  readonly energyFloor: number;
  readonly energySurcharge: number;
  readonly activationMultiplier: number;
  readonly rechargeFaster: number;
  readonly rechargeSlower: number;
  readonly durationMultiplier: number;
  readonly healMultiplier: number;
  /** Any of them says so. */
  readonly notEasilyInterrupted: boolean;
}

/** A use no `OwnSkillModifier` touched. */
export const NO_OWN_SKILL_BOOST: OwnSkillBoost = {
  energyBase: undefined,
  energyDiscount: 0,
  energyFloor: 1,
  energySurcharge: 0,
  activationMultiplier: 1,
  rechargeFaster: 0,
  rechargeSlower: 0,
  durationMultiplier: 1,
  healMultiplier: 1,
  notEasilyInterrupted: false,
};

/** Whether `skill` is one `filter` names (#1761). */
export function ownSkillAnswers(filter: OwnSkillFilter, skill: Skill): boolean {
  const type =
    filter.type === undefined ||
    (filter.type === "spell" ? isSpell(skill.type) : skill.type === filter.type);
  return (
    type &&
    (filter.attributeId === undefined || skill.attributeId === filter.attributeId) &&
    (filter.profession === undefined || skill.profession === filter.profession)
  );
}

/** What `active`'s modifiers do to a use of `skill` now (#1761). */
export function ownSkillBoost(active: readonly ActiveStatus[], skill: Skill): OwnSkillBoost {
  return active
    .flatMap(({ id }) => getStatusDefinition(id).ownSkillModifiers)
    .filter(({ filter }) => ownSkillAnswers(filter, skill))
    .reduce<OwnSkillBoost>(
      (boost, modifier) => ({
        energyBase:
          modifier.energyBase === undefined
            ? boost.energyBase
            : Math.max(boost.energyBase ?? 0, modifier.energyBase),
        energyDiscount: boost.energyDiscount + modifier.energyDiscount,
        energyFloor: Math.max(boost.energyFloor, modifier.energyFloor),
        energySurcharge: boost.energySurcharge + modifier.energySurcharge,
        activationMultiplier: boost.activationMultiplier * modifier.activationMultiplier,
        rechargeFaster: Math.max(boost.rechargeFaster, modifier.rechargeFaster),
        rechargeSlower: Math.max(boost.rechargeSlower, modifier.rechargeSlower),
        durationMultiplier: boost.durationMultiplier * modifier.durationMultiplier,
        healMultiplier: boost.healMultiplier * modifier.healMultiplier,
        notEasilyInterrupted: boost.notEasilyInterrupted || modifier.notEasilyInterrupted,
      }),
      NO_OWN_SKILL_BOOST,
    );
}

/** `StatusDefinition.enchantmentRechargeFaster` (#1455). */
export interface EnchantmentRechargeFaster {
  readonly share: number;
  readonly profession: ProfessionId;
}

export interface StatusTrigger {
  readonly on: StatusTriggerEvent;
  /**
   * Applied with the status's source as caster, on `target`: the bearer
   * (Backfire's damage), or the source itself (Parasitic Bond's heal, #887).
   * Or `offender` (#1022): the bearer turns on the foe whose damage or
   * steal set it off. The bearer is the effects' caster and that foe their
   * target, so "that ally steals ... from that foe" heals the bearer, and a
   * `remove-status` with `from: "caster"` strips the bearer.
   * Or `created` (#1316): the bearer is the effects' caster and the
   * creature it just created their target, so a splash centres on it.
   * Or `gained-source` (#1403): the status's source turns on whoever put
   * the gained hex or enchantment on the bearer, as Scourge Enchantment
   * hurts the enchanter.
   * Or `source-on-offender` (#1789): the status's source turns on the
   * offender, with its own ranks, as Judge's Intervention smites whoever
   * struck the killing blow.
   * Or `healer` (#1913): the status's source turns on whoever healed the
   * bearer, only a foe of the source's, as Soul Bind hurts the healer.
   * Or `hexed-foe` (#1951): the bearer turns on the foe its hex just
   * landed on, as Elemental Flame sets it on fire.
   */
  readonly effects: readonly TriggerEffect[];
  readonly target:
    | "bearer"
    | "source"
    | "offender"
    | "created"
    | "gained-source"
    | "source-on-offender"
    | "healer"
    | "hexed-foe";
  /**
   * On `bearer-attacks` and `bearer-hits` only (#1354, #1359): it fires
   * only for an attack made with a weapon of this class in the bearer's
   * main hand, as Hundred Blades' "whenever you attack with a sword".
   * `melee` is any weapon that strikes in melee, never a bow nor a thrown
   * spear: Warrior's Endurance's "each time you hit with a melee attack".
   * Absent: any attack.
   */
  readonly weapon?: AttackWeaponClass;
  /**
   * On `bearer-blocks` only (#1549): it fires only for a blocked attack of
   * this kind, whichever status's share the roll fell in, as Riposte's
   * "block the next melee attack". Absent: any block.
   */
  readonly blocked?: "melee" | "projectile";
  /**
   * On `bearer-loses-enchantment` only (#1437): it fires only for an
   * enchantment of this profession's (`StatusDefinition.profession`).
   * Absent: any enchantment.
   */
  readonly profession?: ProfessionId;
  /**
   * On `bearer-takes-damage-from-foe` only (#1540): it fires only for
   * damage of this type, never for a life steal, as Mark of Rodgort's
   * "whenever each foe is struck for fire damage". Absent: any damage or
   * steal.
   */
  readonly damageType?: DamageType;
  /**
   * On `bearer-takes-damage-from-foe` only (#1931): it fires only while the
   * bearer is using a skill, never mid-swing nor idle, as Spinal Shivers'
   * "whenever target foe is struck for cold damage while using a skill".
   * Absent: whatever the bearer is doing.
   */
  readonly whileUsingSkill?: true;
  /**
   * On `bearer-takes-damage-from-foe` only (#1754): it fires only for one
   * packet of damage that took more than this much health, never for a
   * life steal, as Spirit Bond's "whenever target ally takes more than 50
   * damage". Absent: any damage or steal.
   */
  readonly minDamage?: number;
  /**
   * On `bearer-health-drops-below`, and only there (#1789): the share of
   * the bearer's effective maximum Health, in (0, 1), the packet must take
   * it below, from at least that.
   */
  readonly healthBelow?: number;
  /**
   * On `bearer-applies-hex`, and only there (#1951): the hex's attribute
   * must be in `attributes`, as Elemental Flame's "Elemental hex".
   */
  readonly appliedHex?: { readonly attributes: AttributeScope };
  /**
   * On `bearer-uses-skill` only (#1437): it fires only for a skill of this
   * type and profession, as Avatar of Dwayna's "whenever you use a Dervish
   * attack skill". With `elite`, only an elite skill (#1473): Price of
   * Pride's. With `adrenal`, only one paid for in adrenaline (#1592): Rage of
   * the Ntouka's "whenever you use an adrenal skill". With `attributes`,
   * only a skill of an attribute in that scope (#1614, #1951): Fire
   * Attunement's "each time you use Fire Magic", Mist Form's "elemental
   * spell". On `bearer-casts-spell` too. Absent: any skill.
   */
  readonly usedSkill?: {
    readonly type?: SkillType;
    readonly attributes?: AttributeScope;
    readonly profession?: ProfessionId;
    readonly elite?: true;
    readonly adrenal?: true;
  };
  /** The skill the log names it after: "mesmer.backfire". */
  readonly skillId: string;
}

/**
 * What a status adds to each of the bearer's physical hits (#525), and
 * the skill the log names it after, apart from the blow (#939): "Sand
 * Shards hits", not "Scythe hits". `attackSkillsOnly` (#1551): only a blow
 * of an attack skill carries it, on each victim, before that skill's own
 * effects, as Grenth's Grasp's "your attack skills also"; a plain swing
 * carries none. `weapon` (#1629): only a blow of that weapon class
 * carries it, as Kindle Arrows' "your arrows"; `undefined`: any.
 */
export interface AttackHitRider {
  readonly effects: readonly SkillEffect[];
  readonly skillId: string;
  readonly attackSkillsOnly: boolean;
  readonly weapon: AttackWeaponClass | undefined;
}

/** How many of the bearer's hits, with which weapon, a status lasts (#939). */
export interface EndsAfterHits {
  readonly count: number;
  /** `undefined`: a hit with any weapon whose blow carries riders (#1022): Splinter Weapon's. */
  readonly weapon: AttackWeaponClass | undefined;
}

/**
 * Contagion's spread (#887): the condition the bearer just gained, for the
 * duration it was put on the bearer, on every living foe of the bearer
 * within `radius` of it. It needs positions, so the simulation resolves it.
 */
export interface SpreadGainedConditionEffect {
  readonly kind: "spread-gained-condition";
  readonly radius: number;
}

/**
 * An echo's copy (#469): the trigger's own skill's slot holds the skill the
 * bearer just used, for `seconds`, then gives it back. Only a spell, with
 * `spellsOnly`; never another copier (`copiesSkill`). The simulation's
 * trigger context names the skill used.
 */
export interface EchoEffect {
  readonly kind: "echo";
  readonly spellsOnly: boolean;
  readonly seconds: number;
}

/**
 * Mirrored Stance's copy (#1965): the stance the bearer just entered, by
 * the skill the simulation's trigger context names, goes on the status's
 * source too, as the bearer would put it on itself, at its ranks. Only
 * the skill's `apply-status`es of a stance; whatever else it does is not
 * copied.
 */
export interface MirrorStanceEffect {
  readonly kind: "mirror-stance";
}

/**
 * Clumsiness's interrupt (#1593): the attack the bearer is beginning, on
 * `bearer-attack-begins`, is interrupted. An attack skill is, as by an
 * `interrupt`, and recharges; a plain swing never lands, and its swing
 * timer starts over. Answering any other event, it does nothing.
 */
export interface CancelAttackEffect {
  readonly kind: "cancel-attack";
}

/**
 * Spinal Shivers' price (#1931): the status's source loses `amount` Energy,
 * or, with less than that or dead, the status ends and the trigger's
 * remaining effects do not happen: "the hex ends if its caster dies".
 */
export interface PayEnergyOrEndEffect {
  readonly kind: "pay-energy-or-end";
  readonly amount: number;
}

/**
 * What a trigger can do: any skill effect, Contagion's spread, an echo,
 * a cancelled attack or a price its source pays to keep it.
 */
export type TriggerEffect =
  | SkillEffect
  | SpreadGainedConditionEffect
  | EchoEffect
  | MirrorStanceEffect
  | CancelAttackEffect
  | PayEnergyOrEndEffect;

/**
 * What happened to a `StatusSet` that a trigger may answer (#887), in the
 * order it happened, until the simulation drains it: a condition newly on
 * the bearer, or a status gone from it, with who had applied it and
 * whether its duration ran out (`expired`, #944) rather than something
 * ending it. Or (#935) a hit the bearer landed, or physical damage it
 * took, with the triggers on it that answered at that moment (#953): a
 * killing blow ends them before the drain, and they still fire for it.
 * Or (#1022) damage or life steal it took from a foe, with that foe.
 * Or (#1108) the share of a physical hit a bond sent to `toId`, its source.
 * Or (#1329) an attack from `offenderId` a status blocked, with its triggers.
 * Or (#1403) a hex or an enchantment `id` from `sourceId` newly on it or
 * renewed, with the triggers that answered; or a hex from `toId` that
 * `statusId` stopped, and the damage `toId` takes for it.
 */
export type StatusChange =
  | { readonly kind: "gained-condition"; readonly id: StatusId; readonly durationSeconds: number }
  | {
      readonly kind: "gained-hex-or-enchantment";
      readonly id: StatusId;
      readonly sourceId: string;
      readonly fired: readonly AnsweringTrigger[];
    }
  /** The bearer's hex `id` landed on `hexedId`, new or renewed (#1951). */
  | {
      readonly kind: "applied-hex";
      readonly id: StatusId;
      readonly hexedId: string;
      readonly fired: readonly AnsweringTrigger[];
    }
  | {
      readonly kind: "broke-hex";
      readonly statusId: StatusId;
      readonly toId: string;
      readonly damage: number;
      readonly skillId: string;
    }
  | {
      readonly kind: "ended";
      readonly id: StatusId;
      readonly sourceId: string;
      readonly expired: boolean;
      /** Ended by its bearer's death (#1762), `endAll`. */
      readonly death: boolean;
      /** Where its source returns to (`returnsSource`, #1826); `null` for no return. */
      readonly returnPoint: Vec2 | null;
      /** Whom its source steps to (`stepsToTarget`, #1930); `null` for no step. */
      readonly stepTargetId: string | null;
    }
  /** An enchantment `id` left the bearer, alive (#1437), with the triggers that answered. */
  | {
      readonly kind: "lost-enchantment";
      readonly id: StatusId;
      readonly fired: readonly AnsweringTrigger[];
    }
  /** A condition `id` left the bearer, alive (#1475), with the triggers that answered. */
  | {
      readonly kind: "lost-condition";
      readonly id: StatusId;
      readonly fired: readonly AnsweringTrigger[];
    }
  | { readonly kind: "hit"; readonly fired: readonly AnsweringTrigger[] }
  | { readonly kind: "failed-to-hit"; readonly fired: readonly AnsweringTrigger[] }
  | { readonly kind: "took-physical-damage"; readonly fired: readonly AnsweringTrigger[] }
  | { readonly kind: "knocked-down"; readonly fired: readonly AnsweringTrigger[] }
  | {
      readonly kind: "took-damage-from-foe";
      readonly offenderId: string;
      readonly fired: readonly AnsweringTrigger[];
    }
  | {
      readonly kind: "hit-by-attack";
      readonly offenderId: string;
      readonly fired: readonly AnsweringTrigger[];
    }
  /** A skill healed the bearer (#1913); `offenderId` is the healer. */
  | {
      readonly kind: "healed-by-skill";
      readonly offenderId: string;
      readonly fired: readonly AnsweringTrigger[];
    }
  /**
   * Damage or a steal took the bearer's Health below a line (#1789), or
   * a status dropped a killing packet; `offenderId` dealt it, `undefined`
   * when nobody did.
   */
  | {
      readonly kind: "health-dropped" | "fatal-negated";
      readonly offenderId: string | undefined;
      readonly fired: readonly AnsweringTrigger[];
    }
  /** Status `statusId` from `sourceId` sends `damage` back to `toId`, who hit the bearer (#1754). */
  | {
      readonly kind: "reflected";
      readonly statusId: StatusId;
      readonly sourceId: string;
      readonly toId: string;
      readonly damage: number;
    }
  | {
      readonly kind: "blocked";
      readonly offenderId: string;
      readonly fired: readonly AnsweringTrigger[];
    }
  /**
   * `offenderId` interrupted the bearer (#1473), with the triggers that
   * answered. `undefined`: a shot whose archer has left the match.
   */
  | {
      readonly kind: "interrupted";
      readonly offenderId: string | undefined;
      readonly fired: readonly AnsweringTrigger[];
    }
  | { readonly kind: "redirected-damage"; readonly toId: string; readonly amount: number }
  /** A status of `toId`'s changed an outcome, and `toId` pays `amount` health (#1265). */
  | {
      readonly kind: "charged-source";
      readonly statusId: StatusId;
      readonly toId: string;
      readonly amount: number;
    };

/** A trigger on the bearer that answered an event, the status that holds it, and who applied it. */
export interface AnsweringTrigger {
  readonly statusId: StatusId;
  readonly sourceId: string;
  readonly trigger: StatusTrigger;
}

/** A share of maximum health a status takes, at most `cap` (GW1's deep wound). */
export interface MaxHealthLoss {
  readonly fraction: number;
  readonly cap: number;
}

/** Armor taken, but never below `floor`, nor any armor already under it (#763). */
export interface ArmorReduction {
  readonly amount: number;
  readonly floor: number;
}

/** Pips for each enchantment on the bearer, at most `max` of them counted (#845). */
export interface PipsPerEnchantment {
  readonly pips: number;
  readonly max: number;
}

/**
 * A glyph's hold on the next spells: how many, and how much cheaper
 * (#526). With `noOvercast` they cause no Overcast (#1941): Glyph of
 * Energy's.
 */
export interface NextSpells {
  readonly count: number;
  readonly costReduction: number;
  readonly noOvercast: boolean;
}

/**
 * Which attributes a set or a delta holds (#1929, #1941): `all` of them,
 * the bearer's `primary` one, the four `elemental` ones, every one of a
 * `profession` (whatever the bearer's own), or one `attributeId`.
 */
export type AttributeScope =
  | "all"
  | "primary"
  | "elemental"
  | { readonly profession: ProfessionId }
  | { readonly attributeId: string };

/** What a status adds to the bearer's attributes in `scope` (#1941). */
export interface AttributeDelta {
  readonly scope: AttributeScope;
  readonly amount: number;
}

/**
 * An `attributeSet`'s rank over its `scope` (#1929). With `plusEquipment`
 * the runes and headgear still add theirs, as Wail of Doom leaves them;
 * without, they are overridden too, as Master of Magic overrides them.
 */
export interface AttributeSet {
  readonly scope: AttributeScope;
  readonly rank: number;
  readonly plusEquipment: boolean;
}

/** A borrowed attribute's hold on the bearer's next spells (#1929). */
export interface BorrowedAttribute {
  readonly attributeId: string;
  readonly spells: number;
}

/**
 * A chant's hold on the bearer's next skills of a kind (#1483), as Aria of
 * Zeal's "the next time each ally within earshot uses a spell, that ally
 * gains 1...6 Energy".
 */
export interface NextSkill {
  /** Which of the bearer's skills set it off: `spell` is any `isSpell` type. */
  readonly which: "attack-skill" | "spell" | "signet" | "shout-or-chant" | "any";
  /** How many such skills it answers before it ends (Song of Purification: 1...6). */
  readonly count: number;
  /** Resolved with the bearer as both caster and target. */
  readonly effects: readonly SkillEffect[];
  /** The skill the log names it after: "paragon.aria-of-zeal". */
  readonly skillId: string;
}

/**
 * A chant's hold on how the bearer's next skill of a kind goes (#1505), as
 * Song of Concentration's "the next skill used by each ally within
 * earshot cannot be interrupted".
 */
export interface NextSkillRule {
  /** As `NextSkill.which`. */
  readonly which: NextSkill["which"];
  /** That skill's activation cannot be interrupted. */
  readonly uninterruptible: boolean;
  /** That attack skill's blows cannot be blocked. */
  readonly unblockable: boolean;
  /** Energy off that skill's cost, never below 0. */
  readonly energyDiscount: number;
  /** That skill's activation is 0 s (#1730): Glyph of Sacrifice's. */
  readonly castsInstantly: boolean;
  /** Seconds added to that skill's recharge (#1730): Glyph of Sacrifice's 30. */
  readonly extraRechargeSeconds: number;
  /** That skill recharges at once (#1730), over any `extraRechargeSeconds`. */
  readonly rechargesInstantly: boolean;
  /** The bearer's Energy goes to 0 once that skill is paid for (#1730). */
  readonly losesAllEnergy: boolean;
  /**
   * That skill, if of `type`, recharges `fraction` faster (#1941): Ritual
   * Lord's binding ritual, 50%. `undefined`: none.
   */
  readonly rechargeFasterIfType:
    { readonly type: SkillType; readonly fraction: number } | undefined;
  /**
   * `skillId`, the skill that applied it, recharges at once when that
   * skill is of this type (#1941): Ritual Lord's binding ritual.
   */
  readonly resetsOwnRechargeIfType: SkillType | undefined;
  /** The skill the log names it after: "paragon.song-of-concentration". */
  readonly skillId: string;
}

/** Whether `skill` is of the kind `which` names (#1483). */
export function nextSkillAnswers(which: NextSkill["which"], skill: Skill): boolean {
  switch (which) {
    case "attack-skill":
      return skill.attack !== undefined;
    case "spell":
      return isSpell(skill.type);
    case "signet":
      return skill.type === "signet";
    case "shout-or-chant":
      return skill.type === "shout" || skill.type === "chant";
    case "any":
      return true;
  }
}

/**
 * Status definitions. Conditions follow GW1: its mechanics and its
 * magnitudes (#492). Every other status carries its skill's rank-12
 * values.
 */
export const STATUS_DEFINITIONS: Readonly<Record<StatusId, StatusDefinition>> = {
  ...COMMON_STATUSES,
  ...WARRIOR_STATUSES,
  ...RANGER_STATUSES,
  ...MONK_STATUSES,
  ...NECROMANCER_STATUSES,
  ...MESMER_STATUSES,
  ...ELEMENTALIST_STATUSES,
  ...ASSASSIN_STATUSES,
  ...RITUALIST_STATUSES,
  ...PARAGON_STATUSES,
  ...DERVISH_STATUSES,
};

/**
 * One application of a spreading status by a skill, and everyone it has
 * reached (#765): the bearer it was applied to, and each combatant that
 * caught it since. Shared by every copy it spread to, so a cured
 * combatant still next to a carrier of the same outbreak is not caught
 * again. A new cast is a new outbreak. Compared by identity, so it needs
 * no id, and it is gone once no status holds it.
 */
export interface Outbreak {
  readonly infected: Set<string>;
  /** Invulnerable bodies it has already been refused by (#1233): each says so once. */
  readonly refused: Set<string>;
}

export interface ActiveStatus {
  readonly id: StatusId;
  /** Seconds of duration still remaining. */
  remainingSeconds: number;
  /** The length of the application that set this entry: a duration bar's full width. */
  durationSeconds: number;
  /** Incoming attacks before it ends (`endsAfterAttacks`); `undefined`: no such limit. */
  attacksLeft: number | undefined;
  /** The bearer's hits before it ends (`endsAfterHits`); `undefined`: no such limit. */
  hitsLeft: number | undefined;
  /** The bearer's unblockable attacks before it ends (`unblockableAttacks`); `undefined`: none. */
  unblockableLeft: number | undefined;
  /** The bearer's attacks before it ends (`endsAfterAttackCount`); `undefined`: no such limit. */
  attacksMadeLeft: number | undefined;
  /** Spells still to start before it ends (`nextSpells`); `undefined`: no such limit. */
  spellsLeft: number | undefined;
  /** Spells still to borrow an attribute for (`borrowsAttribute`); `undefined`: none. */
  castsLeft: number | undefined;
  /** Skills still to answer before it ends (`nextSkill`); `undefined`: no such limit. */
  skillsLeft: number | undefined;
  /** Own skills still to touch before it ends (`OwnSkillModifier.uses`); `undefined`: no such limit. */
  ownSkillsLeft: number | undefined;
  /** Times its triggers may still fire before it ends (`endsAfterTriggers`); `undefined`: no such limit. */
  triggersLeft: number | undefined;
  /** Reflections before it ends (`reflectsAttackDamage`); `undefined`: no such limit. */
  reflectionsLeft: number | undefined;
  /** Foes' touch skills still to fail before it ends (`failsFoeTouchSkills`); `undefined`: none. */
  touchFailsLeft: number | undefined;
  /** Who applied it — needed so a future "when this ends, heal the caster"
   *  effect knows whom to credit. */
  readonly sourceId: string;
  /**
   * The skill that put it on (#1928): what Inspired Hex's copy is of.
   * `undefined` for one a trigger, a zone or a spirit put on.
   */
  readonly sourceSkillId: string | undefined;
  /**
   * Its source's rank in each attribute its scaled stats name (#1976), as
   * `rankOf` read it as it landed: weakness and attribute changes
   * included, and fixed from then on, as GW1 does. Empty for one with none.
   */
  readonly ranks: ReadonlyMap<string, number>;
  /** The outbreak it belongs to, for a status that spreads; `null` for every other. */
  outbreak: Outbreak | null;
  /**
   * Set for a maintained enchantment (#837): one with no end of its own,
   * which costs its caster an energy pip while it lasts. `seq` orders its
   * caster's, newest highest. `outOfRangeSeconds`: how long its bearer has
   * been beyond compass range of its caster, without a break (#839).
   * `null` for every other status.
   */
  readonly maintained: { readonly seq: number; outOfRangeSeconds: number } | null;
  /**
   * Worn from a spirit while in its range (#1064, `project`): no end of its
   * own, and it leaves when its bearer does. `false` for every other.
   */
  readonly projected: boolean;
  /**
   * Where its source stood as it put it up, for a `returnsSource` status
   * (#1826), as `apply` or `maintain` put it up; `null` for every other, and for one replaced.
   */
  returnPoint: Vec2 | null;
  /**
   * The ally its source steps to as it ends, for a `stepsToTarget` status
   * (#1930), as `maintain` put it up; `null` for every other.
   */
  readonly stepTargetId: string | null;
}

/** A status `removeByCategory` took off, and the skill that put it on (#1928). */
export interface RemovedStatus {
  readonly id: StatusId;
  readonly sourceSkillId: string | undefined;
}

export function isStatusId(value: unknown): value is StatusId {
  return typeof value === "string" && Object.hasOwn(STATUS_DEFINITIONS, value);
}

/** Look up a status from an id of unknown provenance (a wire string, a tooltip). */
export function findStatusDefinition(id: string): StatusDefinition | undefined {
  return isStatusId(id) ? STATUS_DEFINITIONS[id] : undefined;
}

export function getStatusDefinition(id: StatusId): StatusDefinition {
  return STATUS_DEFINITIONS[id];
}

/**
 * Whether `trigger` answers an attack with `weapon` (#1354): any, unless
 * it is bound to a class. `melee` (#1359) asks a weapon that strikes in
 * melee, so a spear, thrown, does not answer it.
 */
export function triggerAnswersWeapon(trigger: StatusTrigger, weapon: Weapon): boolean {
  if (trigger.weapon === undefined) {
    return true;
  }
  return (
    wieldsFor(weapon.id, trigger.weapon) &&
    (trigger.weapon !== "melee" || weapon.projectileSpeed === undefined)
  );
}

/**
 * All active statuses on one combatant, plus the lifecycle rules that
 * govern them.
 */
export class StatusSet {
  readonly #statuses = new Map<StatusId, ActiveStatus>();
  #changes: StatusChange[] = [];
  #pulses: StatusPulse[] = [];

  /**
   * What happened to this set since the last drain (#887), oldest first,
   * and forget it: the simulation reads it once a tick for the triggers.
   */
  public drainChanges(): StatusChange[] {
    const changes = this.#changes;
    this.#changes = [];
    return changes;
  }

  /**
   * The damage pulses that came due since the last drain (#1501), oldest
   * first, and forget them: the simulation lands them once a tick.
   */
  public drainPulses(): StatusPulse[] {
    const pulses = this.#pulses;
    this.#pulses = [];
    return pulses;
  }

  /**
   * Take `ids` off the bearer, each recorded as ended: `expired` when its
   * duration ran out (`advance`), and for every other end not (#944).
   */
  #end(ids: readonly StatusId[], expired = false, death = false): void {
    for (const id of ids) {
      const status = this.#statuses.get(id);
      if (status !== undefined) {
        this.#statuses.delete(id);
        this.#changes.push({
          kind: "ended",
          id,
          sourceId: status.sourceId,
          expired,
          death,
          returnPoint: status.returnPoint,
          stepTargetId: status.stepTargetId,
        });
        if (!death) {
          this.#lostEnchantment(id);
          this.#lostCondition(id);
        }
      }
    }
  }

  /**
   * Record enchantment `id` gone from the bearer (#1437), only if a status
   * still on it answers that, with the triggers that do: one bound to a
   * profession only for that profession's enchantment.
   */
  #lostEnchantment(id: StatusId): void {
    const { category, profession } = getStatusDefinition(id);
    if (category !== "enchantment") {
      return;
    }
    const fired = this.triggersOn("bearer-loses-enchantment").filter(
      ({ trigger }) => trigger.profession === undefined || trigger.profession === profession,
    );
    if (fired.length > 0) {
      this.#changes.push({ kind: "lost-enchantment", id, fired });
    }
  }

  /**
   * Record condition `id` gone from the bearer (#1475), only if a status
   * still on it answers that, with the triggers that do.
   */
  #lostCondition(id: StatusId): void {
    if (getStatusDefinition(id).category !== "condition") {
      return;
    }
    const fired = this.triggersOn("bearer-loses-condition");
    if (fired.length > 0) {
      this.#changes.push({ kind: "lost-condition", id, fired });
    }
  }

  /**
   * The bearer landed a hit with `weapon` (#935), recorded only if a
   * status on it answers one, with the triggers that do (#953): one bound
   * to a weapon class only for that class (#1359).
   */
  public recordHit(weapon: Weapon): void {
    const fired = this.#answering("bearer-hits").filter(({ trigger }) =>
      triggerAnswersWeapon(trigger, weapon),
    );
    if (fired.length > 0) {
      this.#changes.push({ kind: "hit", fired });
    }
  }

  /**
   * One of the bearer's blows missed or was blocked (#1332), recorded only
   * if a status on it answers that, with the triggers that do.
   */
  public recordFailedHit(): void {
    const fired = this.#answering("bearer-fails-to-hit");
    if (fired.length > 0) {
      this.#changes.push({ kind: "failed-to-hit", fired });
    }
  }

  /**
   * The bearer lost health to physical damage (#935), recorded only if a
   * status on it answers that, with the triggers that do (#953).
   */
  public recordPhysicalDamage(): void {
    const fired = this.#answering("bearer-takes-physical-damage");
    if (fired.length > 0) {
      this.#changes.push({ kind: "took-physical-damage", fired });
    }
  }

  /**
   * The bearer's hex `id` landed on `hexedId` (#1951), recorded only if a
   * status on it answers that, with the triggers that do; which of them
   * answer a hex of `id`'s attribute is the firing's to say.
   */
  public recordAppliedHex(id: StatusId, hexedId: string): void {
    const fired = this.#answering("bearer-applies-hex");
    if (fired.length > 0) {
      this.#changes.push({ kind: "applied-hex", id, hexedId, fired });
    }
  }

  /**
   * The bearer was knocked down (#1873), recorded only if a status on it
   * answers that, with the triggers that do.
   */
  public recordKnockdown(): void {
    const fired = this.#answering("bearer-knocked-down");
    if (fired.length > 0) {
      this.#changes.push({ kind: "knocked-down", fired });
    }
  }

  /**
   * Status `statusId` blocked an attack of this kind from `offenderId`
   * (#1329), recorded only if that status answers it, with its triggers:
   * another blocking status on the bearer does not. Every status that
   * answers any block (#1403), or any of this kind (#1549), does, after it.
   */
  public recordBlock(statusId: StatusId, offenderId: string, kind: "melee" | "projectile"): void {
    const fired = [
      ...this.#answering(
        kind === "melee" ? "bearer-blocks-melee" : "bearer-blocks-projectile",
      ).filter((answering) => answering.statusId === statusId),
      ...this.#answering("bearer-blocks").filter(
        ({ trigger }) => trigger.blocked === undefined || trigger.blocked === kind,
      ),
    ];
    if (fired.length > 0) {
      this.#changes.push({ kind: "blocked", offenderId, fired });
    }
  }

  /**
   * The bearer lost `amount` health to damage of `type` or, `undefined`,
   * life steal from `offenderId`, a foe (#1022), recorded only if a status
   * on it answers that, with the triggers that do: one with a `damageType`
   * answers only that type (#1540), one with a `minDamage` only damage
   * above it (#1754), one `whileUsingSkill` only while
   * `usingSkill` (#1931). A status already waiting to answer one, undrained,
   * does not answer another: it fires once, at the first foe.
   */
  public recordDamageFromFoe(
    offenderId: string,
    type: DamageType | undefined,
    amount: number,
    usingSkill: boolean,
  ): void {
    const pending = new Set(
      this.#changes.flatMap((change) =>
        change.kind === "took-damage-from-foe" ? change.fired.map(({ statusId }) => statusId) : [],
      ),
    );
    const fired = this.#answering("bearer-takes-damage-from-foe").filter(
      ({ statusId, trigger }) =>
        !pending.has(statusId) &&
        (trigger.damageType === undefined || trigger.damageType === type) &&
        (trigger.minDamage === undefined || (type !== undefined && amount > trigger.minDamage)) &&
        (trigger.whileUsingSkill === undefined || usingSkill),
    );
    if (fired.length > 0) {
      this.#changes.push({ kind: "took-damage-from-foe", offenderId, fired });
    }
  }

  /**
   * `offenderId` interrupted the bearer's skill (#1473) or swing (#1709),
   * recorded only if a status on it answers that, with the triggers that
   * do: once for each interrupt.
   */
  public recordInterrupt(offenderId: string | undefined): void {
    const fired = this.#answering("bearer-interrupted");
    if (fired.length > 0) {
      this.#changes.push({ kind: "interrupted", offenderId, fired });
    }
  }

  /**
   * `healerId` healed the bearer with a skill (#1913), recorded only if a
   * status on it answers that, with the triggers that do: once for each
   * heal.
   */
  public recordHealedBySkill(healerId: string): void {
    const fired = this.#answering("bearer-healed-by-skill");
    if (fired.length > 0) {
      this.#changes.push({ kind: "healed-by-skill", offenderId: healerId, fired });
    }
  }

  /**
   * An attack by `offenderId`, a foe, hit the bearer (#1464) and took
   * `took` health, recorded only if a status on it answers that, with the
   * triggers that do. Every hit counts: two foes in one tick are two. Each
   * status that reflects attack damage (#1754) sends its share back.
   */
  public recordHitByAttack(offenderId: string, took: number): void {
    const fired = this.#answering("bearer-hit-by-attack");
    if (fired.length > 0) {
      this.#changes.push({ kind: "hit-by-attack", offenderId, fired });
    }
    if (took <= 0) {
      return;
    }
    for (const { id, sourceId } of this.active) {
      const reflects = getStatusDefinition(id).reflectsAttackDamage;
      if (reflects !== undefined) {
        this.#changes.push({
          kind: "reflected",
          statusId: id,
          sourceId,
          toId: offenderId,
          damage: Math.min(Math.round(reflects.share * took), reflects.max),
        });
      }
    }
  }

  /**
   * One packet took the bearer's Health from `from` to `to`, of `maxHealth`,
   * dealt by `offenderId` if anyone (#1789): recorded only if a status on
   * it answers a line the packet left Health under, with the triggers that
   * do. GW1 asks no crossing, only a real loss that does not kill (#1818):
   * a bearer already under the line answers its next hit. One packet may
   * answer two lines. A status already waiting to answer one, undrained,
   * does not answer another.
   */
  public recordHealthDrop(
    offenderId: string | undefined,
    from: number,
    to: number,
    maxHealth: number,
  ): void {
    if (to <= 0 || to >= from) {
      return;
    }
    const answering = this.#answering("bearer-health-drops-below");
    if (answering.length === 0) {
      return;
    }
    const pending = new Set(
      this.#changes.flatMap((change) =>
        change.kind === "health-dropped" ? change.fired.map(({ statusId }) => statusId) : [],
      ),
    );
    const fired = answering.filter(
      ({ statusId, trigger }) =>
        !pending.has(statusId) && to < (trigger.healthBelow ?? 0) * maxHealth,
    );
    if (fired.length > 0) {
      this.#changes.push({ kind: "health-dropped", offenderId, fired });
    }
  }

  /**
   * Spend the oldest status that negates fatal damage (#1789), recorded as
   * ended, with its `bearer-fatal-damage-negated` triggers aimed at
   * `offenderId`; `undefined` if none is up.
   */
  public takeFatalNegation(offenderId: string | undefined): StatusId | undefined {
    for (const status of this.#statuses.values()) {
      const definition = getStatusDefinition(status.id);
      if (definition.negatesFatalDamage) {
        this.#end([status.id]);
        const fired = definition.triggers
          .filter((trigger) => trigger.on === "bearer-fatal-damage-negated")
          .map((trigger) => ({ statusId: status.id, sourceId: status.sourceId, trigger }));
        if (fired.length > 0) {
          this.#changes.push({ kind: "fatal-negated", offenderId, fired });
        }
        return status.id;
      }
    }
    return undefined;
  }

  #answering(event: StatusTriggerEvent): AnsweringTrigger[] {
    return this.triggersOn(event);
  }

  /** Record a condition newly on the bearer (#887); any other category is not one. */
  #gained(id: StatusId, durationSeconds: number): void {
    if (getStatusDefinition(id).category === "condition") {
      this.#changes.push({ kind: "gained-condition", id, durationSeconds });
    }
  }

  /**
   * Record a hex or an enchantment `id` from `sourceId` landing on the
   * bearer, new or renewed (#1403), only if a status on it answers that,
   * with the triggers that do: `id` itself never answers its own landing.
   */
  #gainedHexOrEnchantment(id: StatusId, sourceId: string): void {
    const { category } = getStatusDefinition(id);
    if (category !== "hex" && category !== "enchantment") {
      return;
    }
    const fired = this.triggersOn(
      "bearer-gains-hex-or-enchantment",
      ...(category === "enchantment" ? (["bearer-gains-enchantment"] as const) : []),
    ).filter(({ statusId }) => statusId !== id);
    if (fired.length > 0) {
      this.#changes.push({ kind: "gained-hex-or-enchantment", id, sourceId, fired });
    }
  }

  /**
   * Whether hex `id` from `sourceId` fails to land (#1403): with a status
   * on the bearer that breaks the next hex, that status ends and the hex's
   * source is owed its damage. Anything not a hex lands.
   */
  #breaksHex(id: StatusId, sourceId: string): boolean {
    if (getStatusDefinition(id).category !== "hex") {
      return false;
    }
    for (const { id: breaker } of this.active) {
      const breaks = getStatusDefinition(breaker).breaksNextHex;
      if (breaks !== undefined) {
        this.#end([breaker]);
        this.#changes.push({ kind: "broke-hex", statusId: breaker, toId: sourceId, ...breaks });
        return true;
      }
    }
    return false;
  }

  /**
   * The status that fails the bearer's next spell on a target of this
   * side (#1475), if any: the newest of those that do, as removal takes
   * the newest first. It is not ended here.
   */
  public spellFailer(on: FailsNextSpell["on"]): ActiveStatus | undefined {
    return this.active.findLast(({ id }) => getStatusDefinition(id).failsNextSpell?.on === on);
  }

  /** The status that would stop the next hex on the bearer (#1403), oldest first, if any. */
  public hexBreaker(): StatusId | undefined {
    return this.active.find(({ id }) => getStatusDefinition(id).breaksNextHex !== undefined)?.id;
  }

  public get active(): readonly ActiveStatus[] {
    return [...this.#statuses.values()];
  }

  public has(id: StatusId): boolean {
    return this.#statuses.has(id);
  }

  public get(id: StatusId): ActiveStatus | undefined {
    return this.#statuses.get(id);
  }

  public get size(): number {
    return this.#statuses.size;
  }

  /**
   * Apply (or refresh) a status. Durations do not stack — the longer of
   * the existing and incoming duration wins, so re-applying a shorter
   * one never shortens a longer one already running. In an exclusive
   * category the new one replaces every one of its category, itself
   * included, at the incoming duration (a stance, #523).
   *
   * A status that spreads starts a new outbreak, even where the duration
   * already running is the longer one: a new cast is a new outbreak (#765).
   *
   * Returns whether it is newly on the bearer: `false` for a refresh, or
   * for a duration of nothing. What a status does once, as it lands
   * (deep wound's health), hangs on this. A status newly on it ends every
   * one that ends when its bearer gains that category (#919). A hex a
   * status breaks never lands (#1403): `false`, and nothing else changes.
   *
   * `returnPoint` is where its source stands as it casts, for a
   * `returnsSource` status (#1826): only the instance this call puts up
   * carries it. One kept for its longer duration keeps its own, and its
   * own `ranks` (#1976): whichever wins keeps the ranks it landed with.
   */
  public apply(
    id: StatusId,
    appliedSeconds: number,
    sourceId: string,
    ranks: ReadonlyMap<string, number>,
    returnPoint: Vec2 | null = null,
    sourceSkillId?: string,
  ): boolean {
    if (appliedSeconds <= 0 || this.isImmuneTo(id) || this.#breaksHex(id, sourceId)) {
      return false;
    }
    const wasActive = this.#statuses.has(id);
    const definition = getStatusDefinition(id);
    const durationSeconds =
      definition.category === "chant" || definition.category === "shout"
        ? appliedSeconds * this.#chantShoutDurationMultiplier()
        : appliedSeconds;
    const exclusive = EXCLUSIVE_CATEGORIES.has(definition.category);
    // A recast that replaces it: its source does not return (#1826), but
    // from where the new one does, when that one keeps its spot (#1930).
    let returnsTo = returnPoint;
    const replaced = this.#statuses.get(id);
    if (replaced !== undefined && (exclusive || replaced.remainingSeconds < durationSeconds)) {
      if (definition.returnsSource?.recastKeepsPoint === true && replaced.returnPoint !== null) {
        returnsTo = replaced.returnPoint;
      }
      replaced.returnPoint = null;
    }
    if (exclusive) {
      this.removeByCategory(definition.category);
    }
    const existing = this.#statuses.get(id);
    const outbreak = definition.spreads
      ? { infected: new Set<string>(), refused: new Set<string>() }
      : null;
    // A re-application is the newest, whichever duration wins: removal
    // takes the newest first (`removeByCategory`).
    this.#statuses.delete(id);
    if (existing !== undefined && existing.remainingSeconds >= durationSeconds) {
      existing.outbreak = outbreak;
      // A recast signet starts its count again (#1916), never adds to it.
      existing.attacksMadeLeft = definition.endsAfterAttackCount;
      existing.castsLeft = definition.borrowsAttribute?.spells;
      this.#statuses.set(id, existing);
      return false;
    }
    this.#statuses.set(id, {
      id,
      remainingSeconds: durationSeconds,
      durationSeconds,
      attacksLeft: definition.endsAfterAttacks,
      hitsLeft: definition.endsAfterHits?.count,
      unblockableLeft: definition.unblockableAttacks,
      attacksMadeLeft: definition.endsAfterAttackCount,
      spellsLeft: definition.nextSpells?.count,
      castsLeft: definition.borrowsAttribute?.spells,
      skillsLeft: definition.nextSkill?.count,
      ownSkillsLeft: definition.ownSkillModifiers.find(({ uses }) => uses !== undefined)?.uses,
      triggersLeft: definition.endsAfterTriggers,
      reflectionsLeft: definition.reflectsAttackDamage?.times,
      touchFailsLeft: definition.failsFoeTouchSkills,
      sourceId,
      sourceSkillId,
      ranks,
      outbreak,
      maintained: null,
      projected: false,
      returnPoint: definition.returnsSource === undefined ? null : returnsTo,
      stepTargetId: null,
    });
    this.#gainedHexOrEnchantment(id, sourceId);
    if (!wasActive) {
      this.#gained(id, durationSeconds);
      this.#endOnGaining(definition.category);
      this.#end(definition.immuneTo.filter((immune) => this.#statuses.has(immune)));
      this.#stripEnchantments(definition);
    }
    return !wasActive;
  }

  /**
   * Whether a status on the bearer keeps `id` off it (#1455): Avatar of
   * Grenth's Disease, or any enchantment under Well of the Profane (#1732).
   */
  public isImmuneTo(id: StatusId): boolean {
    if (getStatusDefinition(id).category === "enchantment" && preventsEnchantments(this.active)) {
      return true;
    }
    return this.active.some((status) => getStatusDefinition(status.id).immuneTo.includes(id));
  }

  /**
   * Catch a spreading status from a bearer of `outbreak` (#765). The
   * longer duration wins, as for `apply`, but a combatant already
   * carrying it keeps the outbreak it has.
   * `ranks` are the carrier copy's (#1976): a caught one scales as the cast did.
   */
  public catch(
    id: StatusId,
    durationSeconds: number,
    sourceId: string,
    outbreak: Outbreak,
    ranks: ReadonlyMap<string, number>,
  ): void {
    if (durationSeconds <= 0 || this.isImmuneTo(id) || this.#breaksHex(id, sourceId)) {
      return;
    }
    const existing = this.#statuses.get(id);
    if (existing !== undefined) {
      if (durationSeconds > existing.remainingSeconds) {
        this.#gainedHexOrEnchantment(id, sourceId);
      }
      existing.remainingSeconds = Math.max(existing.remainingSeconds, durationSeconds);
      // A bar is never over full.
      existing.durationSeconds = Math.max(existing.durationSeconds, existing.remainingSeconds);
      return;
    }
    this.#statuses.set(id, {
      id,
      remainingSeconds: durationSeconds,
      durationSeconds,
      attacksLeft: undefined,
      hitsLeft: undefined,
      unblockableLeft: undefined,
      attacksMadeLeft: undefined,
      spellsLeft: undefined,
      castsLeft: undefined,
      skillsLeft: undefined,
      ownSkillsLeft: undefined,
      triggersLeft: undefined,
      reflectionsLeft: undefined,
      touchFailsLeft: undefined,
      sourceId,
      sourceSkillId: undefined,
      ranks,
      outbreak,
      maintained: null,
      projected: false,
      returnPoint: null,
      stepTargetId: null,
    });
    this.#gained(id, durationSeconds);
    this.#gainedHexOrEnchantment(id, sourceId);
  }

  /**
   * Maintain an enchantment from `sourceId` (#837): it lasts until
   * something ends it, so `advance` never expires it. One of the same id
   * already on the bearer is replaced, whoever maintains it, and this one
   * is the newest, as `apply` makes it. Returns whether it is newly on the
   * bearer; one that is ends what `apply` would end. Throws for a status that is not an enchantment: a catalog bug,
   * not data.
   * `stepTargetId` is the ally a `stepsToTarget` status steps its source
   * to (#1930).
   */
  public maintain(
    id: StatusId,
    sourceId: string,
    seq: number,
    ranks: ReadonlyMap<string, number>,
    returnPoint: Vec2 | null = null,
    stepTargetId: string | null = null,
    sourceSkillId?: string,
  ): boolean {
    const definition = getStatusDefinition(id);
    if (definition.category !== "enchantment") {
      throw new Error(`only an enchantment can be maintained, not ${id}`);
    }
    const wasActive = this.#statuses.delete(id);
    this.#statuses.set(id, {
      id,
      remainingSeconds: Number.POSITIVE_INFINITY,
      durationSeconds: Number.POSITIVE_INFINITY,
      attacksLeft: undefined,
      hitsLeft: undefined,
      unblockableLeft: undefined,
      attacksMadeLeft: undefined,
      spellsLeft: undefined,
      castsLeft: undefined,
      skillsLeft: undefined,
      ownSkillsLeft: undefined,
      triggersLeft: undefined,
      reflectionsLeft: undefined,
      touchFailsLeft: undefined,
      sourceId,
      sourceSkillId,
      ranks,
      outbreak: null,
      maintained: { seq, outOfRangeSeconds: 0 },
      projected: false,
      returnPoint: definition.returnsSource === undefined ? null : returnPoint,
      stepTargetId: definition.stepsToTarget === undefined ? null : stepTargetId,
    });
    this.#gainedHexOrEnchantment(id, sourceId);
    if (!wasActive) {
      this.#endOnGaining("enchantment");
    }
    return !wasActive;
  }

  /**
   * Wear `id` from a spirit, `sourceId` (#1064), for as long as the
   * simulation keeps projecting it: `advance` never expires it, and it is
   * removed when its bearer leaves every such spirit's range. Already
   * worn: nothing. Returns whether it is newly on the bearer.
   */
  public project(id: StatusId, sourceId: string, ranks: ReadonlyMap<string, number>): boolean {
    if (this.#statuses.has(id) || this.isImmuneTo(id)) {
      return false;
    }
    this.#statuses.set(id, {
      id,
      remainingSeconds: Number.POSITIVE_INFINITY,
      durationSeconds: Number.POSITIVE_INFINITY,
      attacksLeft: undefined,
      hitsLeft: undefined,
      unblockableLeft: undefined,
      attacksMadeLeft: undefined,
      spellsLeft: undefined,
      castsLeft: undefined,
      skillsLeft: undefined,
      ownSkillsLeft: undefined,
      triggersLeft: undefined,
      reflectionsLeft: undefined,
      touchFailsLeft: undefined,
      sourceId,
      sourceSkillId: undefined,
      ranks,
      outbreak: null,
      maintained: null,
      projected: true,
      returnPoint: null,
      stepTargetId: null,
    });
    const definition = getStatusDefinition(id);
    this.#endOnGaining(definition.category);
    this.#stripEnchantments(definition);
    return true;
  }

  /** What a chant or a shout put on the bearer now lasts, times its applied duration (#1423). */
  #chantShoutDurationMultiplier(): number {
    let multiplier = 1;
    for (const { id } of this.#statuses.values()) {
      multiplier *= getStatusDefinition(id).chantShoutDurationMultiplier;
    }
    return multiplier;
  }

  /** The bearer cast a spell (#1614): every status that renews on that is renewed. */
  public castSpell(): void {
    for (const status of this.#statuses.values()) {
      if (getStatusDefinition(status.id).renewsOnBearerSpell) {
        status.remainingSeconds = status.durationSeconds;
      }
    }
  }

  /**
   * A chant or a shout ended on the bearer (#1423): every status that
   * renews on that is back to the duration it was applied with, and the
   * triggers that answer it, in `active` order, are returned to fire.
   */
  public chantOrShoutEnded(): AnsweringTrigger[] {
    for (const status of this.#statuses.values()) {
      if (getStatusDefinition(status.id).renewsOnChantOrShoutEnd) {
        status.remainingSeconds = status.durationSeconds;
      }
    }
    return this.triggersOn("bearer-chant-or-shout-ends");
  }

  /**
   * One of `id`'s triggers fired (#1423): one fewer before it ends.
   * Returns whether that ended it, recorded as ended.
   */
  public spendTrigger(id: StatusId): boolean {
    const status = this.#statuses.get(id);
    if (status?.triggersLeft === undefined) {
      return false;
    }
    status.triggersLeft -= 1;
    if (status.triggersLeft > 0) {
      return false;
    }
    this.#end([id]);
    return true;
  }

  /**
   * `id` reflected a blow (#1754): one fewer before it ends. Returns
   * whether that ended it, recorded as ended.
   */
  public spendReflection(id: StatusId): boolean {
    const status = this.#statuses.get(id);
    if (status?.reflectionsLeft === undefined) {
      return false;
    }
    status.reflectionsLeft -= 1;
    if (status.reflectionsLeft > 0) {
      return false;
    }
    this.#end([id]);
    return true;
  }

  /** The newest status that fails a foe's touch skill on the bearer (#1966), if any. */
  public touchFailer(): ActiveStatus | undefined {
    return this.active.findLast(({ touchFailsLeft }) => touchFailsLeft !== undefined);
  }

  /**
   * `id` failed a foe's touch skill (#1966): one fewer before it ends.
   * Returns whether that ended it, recorded as ended.
   */
  public spendTouchFail(id: StatusId): boolean {
    const status = this.#statuses.get(id);
    if (status?.touchFailsLeft === undefined) {
      return false;
    }
    status.touchFailsLeft -= 1;
    if (status.touchFailsLeft > 0) {
      return false;
    }
    this.#end([id]);
    return true;
  }

  /** Gaining `definition`, end every enchantment on the bearer if it holds none (#1732). */
  #stripEnchantments(definition: StatusDefinition): void {
    if (definition.preventsEnchantments) {
      this.removeByCategory("enchantment");
    }
  }

  /** A status of `category` is newly on the bearer (#919): Natural Stride ends on a hex. */
  #endOnGaining(category: StatusCategory): void {
    this.#end(
      this.active
        .filter(({ id }) =>
          getStatusDefinition(id).endsWhenBearerGains.some((gained) => gained === category),
        )
        .map(({ id }) => id),
    );
  }

  /**
   * Remove every status, of every category: what a respawn leaves. A
   * reset, not an ending: nothing is recorded (#887).
   */
  public clear(): void {
    this.#statuses.clear();
  }

  /**
   * End every status, of every category, each recorded as ended, in
   * `active` order: what a death does (#940), so every `ends` trigger fires.
   * No `bearer-loses-enchantment` does.
   */
  public endAll(): void {
    // The dead lose no enchantment to answer (#1437).
    this.#end([...this.#statuses.keys()], false, true);
  }

  /** End one status by id, recorded as ended (#1022): a trigger that spends it. */
  public end(id: StatusId): void {
    this.#end([id]);
  }

  /**
   * Take the bearer's ashes, its `"item"` status (#1434), off without
   * recording the end: the simulation fires their drop itself, where the
   * bearer stands now. `undefined` when it holds none.
   */
  public dropItem(): { readonly id: StatusId; readonly sourceId: string } | undefined {
    for (const status of this.#statuses.values()) {
      if (getStatusDefinition(status.id).category === "item") {
        this.#statuses.delete(status.id);
        return { id: status.id, sourceId: status.sourceId };
      }
    }
    return undefined;
  }

  /** Remove one status by id. Returns whether anything was removed. */
  public remove(id: StatusId): boolean {
    const had = this.#statuses.has(id);
    this.#end([id]);
    return had;
  }

  /**
   * Remove up to `count` statuses of a category — the shape every
   * "remove a condition"/"strip an enchantment" skill needs. Returns what
   * it actually removed, so a caller can report exactly what it stripped,
   * and the skill that put each on, for one that copies it (#1928).
   *
   * The newest applied goes first, as in GW1 (#521), where covering an
   * important enchantment or condition with a cheaper one is a tactic.
   * With a `profession`, only that profession's statuses go (#845): "lose
   * 1 Dervish enchantment". With a `statusId`, only that status (#1549):
   * "Charge!"'s "lose the Crippled condition".
   */
  public removeByCategory(
    category: StatusCategory,
    count = Number.POSITIVE_INFINITY,
    profession?: ProfessionId,
    statusId?: StatusId,
  ): RemovedStatus[] {
    const removed: RemovedStatus[] = [];
    for (const status of [...this.#statuses.values()].reverse()) {
      if (removed.length >= count) {
        break;
      }
      const definition = getStatusDefinition(status.id);
      if (
        definition.category === category &&
        (profession === undefined || definition.profession === profession) &&
        (statusId === undefined || status.id === statusId)
      ) {
        removed.push({ id: status.id, sourceSkillId: status.sourceSkillId });
      }
    }
    this.#end(removed.map(({ id }) => id));
    return removed;
  }

  /**
   * Split a physical hit of `amount` on the bearer (#1108): with a status
   * that redirects, the newest, its share, rounded down, is recorded for
   * its source and the rest returned; without one, all of it.
   */
  public redirect(amount: number): number {
    for (const status of [...this.#statuses.values()].reverse()) {
      const share = getStatusDefinition(status.id).redirectsPhysicalDamage;
      if (share > 0) {
        const sent = Math.floor(amount * share);
        if (sent > 0) {
          this.#changes.push({ kind: "redirected-damage", toId: status.sourceId, amount: sent });
        }
        return amount - sent;
      }
    }
    return amount;
  }

  /**
   * Every status on the bearer that `acted` names, and whose source pays
   * for it (#1265), records that payment for its source, landed when the
   * tick drains: Shelter's spirit loses 51 for the blow it capped.
   */
  public chargeSources(acted: (definition: StatusDefinition) => boolean): void {
    for (const status of this.#statuses.values()) {
      const definition = getStatusDefinition(status.id);
      if (definition.sourceLosesHealth !== undefined && acted(definition)) {
        this.#changes.push({
          kind: "charged-source",
          statusId: status.id,
          toId: status.sourceId,
          amount: definition.sourceLosesHealth,
        });
      }
    }
  }

  /**
   * Spend the newest status that reverses the next damage (#987),
   * recorded as ended, and return its cap; `undefined` if none is up.
   */
  public takeReversal(): { readonly id: StatusId; readonly cap: number } | undefined {
    for (const status of [...this.#statuses.values()].reverse()) {
      const cap = getStatusDefinition(status.id).reversesNextDamage;
      if (cap !== undefined) {
        this.#end([status.id]);
        return { id: status.id, cap };
      }
    }
    return undefined;
  }

  /**
   * Take up to `count` statuses of a category off the bearer, newest first,
   * as `removeByCategory`, with the time each had left (#944): Plague
   * Touch's "transfer ... with their remaining durations", and the ranks
   * each landed with (#1976).
   */
  public takeNewest(
    category: StatusCategory,
    count: number,
  ): Pick<ActiveStatus, "id" | "remainingSeconds" | "ranks">[] {
    const taken = [...this.#statuses.values()]
      .reverse()
      .filter(({ id }) => getStatusDefinition(id).category === category)
      .slice(0, count)
      .map(({ id, remainingSeconds, ranks }) => ({ id, remainingSeconds, ranks }));
    this.#end(taken.map(({ id }) => id));
    return taken;
  }

  /**
   * An attack hit the bearer or was blocked (#524): one fewer for every
   * status that ends after so many. Returns the ids that ended on it.
   */
  public countIncomingAttack(): StatusId[] {
    const ended: StatusId[] = [];
    for (const status of this.#statuses.values()) {
      if (status.attacksLeft !== undefined) {
        status.attacksLeft -= 1;
        if (status.attacksLeft <= 0) {
          ended.push(status.id);
        }
      }
    }
    this.#end(ended);
    return ended;
  }

  /**
   * The bearer attacked (#1604): whether a status of its own makes this
   * attack unblockable, each such status one attack fewer, and the ids
   * that ended on it. A counted status, as Guiding Hands, counts every
   * attack, even one another status, as Guided Weapon, already made
   * unblockable: GW1's "next N attacks" counts attacks, not saves.
   */
  public spendUnblockableAttack(): { readonly unblockable: boolean; readonly ended: StatusId[] } {
    let unblockable = false;
    const ended: StatusId[] = [];
    for (const status of this.#statuses.values()) {
      unblockable ||= getStatusDefinition(status.id).attacksUnblockable;
      if (status.unblockableLeft !== undefined && status.unblockableLeft > 0) {
        unblockable = true;
        status.unblockableLeft -= 1;
        if (status.unblockableLeft <= 0) {
          ended.push(status.id);
        }
      }
    }
    this.#end(ended);
    return { unblockable, ended };
  }

  /**
   * The bearer attacked (#1916): one fewer for every status that ends
   * after so many of its attacks, hit, miss or block. Returns the ids
   * that ended on it.
   */
  public spendAttack(): StatusId[] {
    const ended: StatusId[] = [];
    for (const status of this.#statuses.values()) {
      if (status.attacksMadeLeft !== undefined) {
        status.attacksMadeLeft -= 1;
        if (status.attacksMadeLeft <= 0) {
          ended.push(status.id);
        }
      }
    }
    this.#end(ended);
    return ended;
  }

  /**
   * One of the bearer's blows of `weaponId` hit (#939): one fewer for
   * every status that ends after so many hits with a weapon it is, or
   * with any weapon (#1022). Returns
   * the ids that ended on it.
   */
  public countHit(weaponId: WeaponId): StatusId[] {
    const ended: StatusId[] = [];
    for (const status of this.#statuses.values()) {
      const limit = getStatusDefinition(status.id).endsAfterHits;
      if (
        status.hitsLeft !== undefined &&
        limit !== undefined &&
        (limit.weapon === undefined || wieldsFor(weaponId, limit.weapon))
      ) {
        status.hitsLeft -= 1;
        if (status.hitsLeft <= 0) {
          ended.push(status.id);
        }
      }
    }
    this.#end(ended);
    return ended;
  }

  /**
   * The bearer started `skill` (#1505): every status whose
   * `nextSkillRule` answers its kind ends, and so does every one that
   * ends on any other kind (#1730), unanswered. Returns each, in
   * `active` order, with its rule and whether it answered.
   */
  public useNextSkillRules(skill: Skill): readonly {
    readonly statusId: StatusId;
    readonly rule: NextSkillRule;
    readonly answered: boolean;
  }[] {
    const used = this.active.flatMap(({ id }) => {
      const definition = getStatusDefinition(id);
      const rule = definition.nextSkillRule;
      if (rule === undefined) {
        return [];
      }
      const answered = nextSkillAnswers(rule.which, skill);
      return answered || definition.endsWhenBearerUsesOtherSkill
        ? [{ statusId: id, rule, answered }]
        : [];
    });
    this.#end(used.map(({ statusId }) => statusId));
    return used;
  }

  /**
   * The bearer started an attack skill (#1869): every status that ends
   * when it does is gone. Returns the ids that ended on it.
   */
  public endOnBearerStartAttackSkill(): StatusId[] {
    const ended = this.active
      .filter(({ id }) => getStatusDefinition(id).endsWhenBearerUsesAttackSkill)
      .map(({ id }) => id);
    this.#end(ended);
    return ended;
  }

  /**
   * The bearer used `skill` (#1761): one fewer for every status whose
   * counted `ownSkillModifiers` answer it, as Extend Enchantments' "your
   * next Dervish enchantment". Returns the ids that ended on it.
   */
  public useOwnSkillModifiers(skill: Skill): StatusId[] {
    const ended: StatusId[] = [];
    for (const status of this.#statuses.values()) {
      const counted = getStatusDefinition(status.id).ownSkillModifiers.some(
        ({ uses, filter }) => uses !== undefined && ownSkillAnswers(filter, skill),
      );
      if (status.ownSkillsLeft !== undefined && counted) {
        status.ownSkillsLeft -= 1;
        if (status.ownSkillsLeft <= 0) {
          ended.push(status.id);
        }
      }
    }
    this.#end(ended);
    return ended;
  }

  /**
   * A spell of the bearer's started (#526): one fewer for every status
   * that holds the next spells. Returns the ids that ended on it.
   */
  public countSpellStarted(): StatusId[] {
    const ended: StatusId[] = [];
    for (const status of this.#statuses.values()) {
      if (status.spellsLeft !== undefined) {
        status.spellsLeft -= 1;
        if (status.spellsLeft <= 0) {
          ended.push(status.id);
        }
      }
    }
    this.#end(ended);
    return ended;
  }

  /**
   * What the bearer's spell `skill` scales with instead of its own
   * attribute (#1929): the newest `borrowsAttribute` with a use left, if
   * `skill` is a spell of another attribute. A skill of no attribute
   * scales with nothing to borrow for.
   */
  public borrowedFor(skill: Skill): StatusId | undefined {
    if (!isSpell(skill.type) || skill.attributeId === undefined) {
      return undefined;
    }
    return [...this.#statuses.values()]
      .reverse()
      .find(
        ({ id, castsLeft }) =>
          castsLeft !== undefined &&
          getStatusDefinition(id).borrowsAttribute?.attributeId !== skill.attributeId,
      )?.id;
  }

  /**
   * The bearer finished a spell that borrowed through `id` (#1929): one
   * use fewer, and at none it ends. Returns the ids that ended on it.
   */
  public spendBorrowed(id: StatusId): StatusId[] {
    const status = this.#statuses.get(id);
    if (status?.castsLeft === undefined) {
      return [];
    }
    status.castsLeft -= 1;
    if (status.castsLeft > 0) {
      return [];
    }
    this.#end([id]);
    return [id];
  }

  /**
   * The bearer used `skill` (#1483): every status whose `nextSkill`
   * answers its kind counts it, but those in `spared`, which that skill
   * put on its own user (#999), so a chant never answers its own use.
   * Returns what they answer with, in `active` order, and the ids that
   * ended on it.
   */
  public useNextSkill(
    skill: Skill,
    spared: ReadonlySet<StatusId>,
  ): {
    readonly answered: readonly { readonly statusId: StatusId; readonly next: NextSkill }[];
    readonly ended: readonly StatusId[];
  } {
    const answered: { statusId: StatusId; next: NextSkill }[] = [];
    const ended: StatusId[] = [];
    for (const status of this.active) {
      const next = getStatusDefinition(status.id).nextSkill;
      if (
        next === undefined ||
        status.skillsLeft === undefined ||
        spared.has(status.id) ||
        !nextSkillAnswers(next.which, skill)
      ) {
        continue;
      }
      answered.push({ statusId: status.id, next });
      status.skillsLeft -= 1;
      if (status.skillsLeft <= 0) {
        ended.push(status.id);
      }
    }
    this.#end(ended);
    return { answered, ended };
  }

  /**
   * The bearer attacked (#758): every status that ends when it does is
   * gone, and, if it was a melee attack, every one that ends on one
   * (#976). Returns the ids that ended on it.
   */
  public endOnBearerAttack(kind: "melee" | "projectile"): StatusId[] {
    const ended = this.active
      .filter(({ id }) => {
        const definition = getStatusDefinition(id);
        return (
          definition.endsWhenBearerAttacks ||
          (kind === "melee" && definition.endsWhenBearerAttacksInMelee)
        );
      })
      .map(({ id }) => id);
    this.#end(ended);
    return ended;
  }

  /**
   * The bearer used a skill (#949): every status that ends when it does
   * is gone, and every one that ends on an adrenal skill if it was one
   * (#1329), but those in `spared`, which that skill put on its own user
   * (#999). Returns the ids that ended on it.
   */
  public endOnBearerUseSkill(spared: ReadonlySet<StatusId>, adrenal: boolean): StatusId[] {
    const ended = this.active
      .filter(({ id }) => {
        const definition = getStatusDefinition(id);
        return (
          (definition.endsWhenBearerUsesSkill ||
            (adrenal && definition.endsWhenBearerUsesAdrenalSkill)) &&
          !spared.has(id)
        );
      })
      .map(({ id }) => id);
    this.#end(ended);
    return ended;
  }

  /**
   * One of the bearer's attacks hit (#919): every status that ends when it
   * does is gone, and, if it was an attack skill, every one that ends when
   * an attack skill hits (#956). Returns the ids that ended on it.
   */
  public endOnBearerHit(withAttackSkill: boolean): StatusId[] {
    const ended = this.active
      .filter(({ id }) => {
        const definition = getStatusDefinition(id);
        return (
          definition.endsWhenBearerHits ||
          (withAttackSkill && definition.endsWhenBearerHitsWithAttackSkill)
        );
      })
      .map(({ id }) => id);
    this.#end(ended);
    return ended;
  }

  /**
   * One of the bearer's attacks failed to hit (#1742): every status that
   * ends when it does is gone. Returns the ids that ended on it.
   */
  public endOnBearerMiss(): StatusId[] {
    const ended = this.active
      .filter(({ id }) => getStatusDefinition(id).endsWhenBearerMisses)
      .map(({ id }) => id);
    this.#end(ended);
    return ended;
  }

  /**
   * The bearer landed a critical hit (#1315): every status that refreshes
   * on one has its remaining time put back to the duration it was
   * applied with.
   */
  public refreshOnCritical(): void {
    for (const status of this.#statuses.values()) {
      if (getStatusDefinition(status.id).refreshesOnCritical) {
        status.remainingSeconds = status.durationSeconds;
      }
    }
  }

  /**
   * An interrupt was stopped (#1964): every status whose `interruptGuard`
   * is `once`, Mantra of Concentration's, is gone. Returns the ids that
   * ended on it.
   */
  public endOnInterruptGuarded(): StatusId[] {
    const ended = this.active
      .filter(({ id }) => getStatusDefinition(id).interruptGuard?.kind === "once")
      .map(({ id }) => id);
    this.#end(ended);
    return ended;
  }

  /**
   * A knockdown was stopped (#845): every status that ends when it stops
   * one is gone. Returns the ids that ended on it.
   */
  public endOnKnockdownPrevented(): StatusId[] {
    const ended = this.active
      .filter(({ id }) => getStatusDefinition(id).endsOnKnockdownPrevented)
      .map(({ id }) => id);
    this.#end(ended);
    return ended;
  }

  /**
   * Every trigger on the bearer that answers one of `events` (#469,
   * #1403), in `active` order, with who applied the status that holds it.
   */
  public triggersOn(
    ...events: readonly StatusTriggerEvent[]
  ): { statusId: StatusId; sourceId: string; trigger: StatusTrigger }[] {
    return this.active.flatMap(({ id, sourceId }) =>
      getStatusDefinition(id)
        .triggers.filter((trigger) => events.includes(trigger.on))
        .map((trigger) => ({ statusId: id, sourceId, trigger })),
    );
  }

  /**
   * How many are up of a category; with a `profession`, only that
   * profession's (#1021); with an `attribute`, only that attribute's (#1765);
   * `excluding` is not counted (#1979).
   */
  public countByCategory(
    category: StatusCategory,
    profession?: ProfessionId,
    attribute?: string,
    excluding?: StatusId,
  ): number {
    let count = 0;
    for (const status of this.#statuses.values()) {
      const definition = getStatusDefinition(status.id);
      if (
        definition.category === category &&
        (profession === undefined || definition.profession === profession) &&
        (attribute === undefined || definition.attribute === attribute) &&
        status.id !== excluding
      ) {
        count += 1;
      }
    }
    return count;
  }

  /**
   * Advance all durations by `dt` seconds, dropping any that expire.
   * Returns the ids that expired on this tick so the caller can emit
   * end-of-status effects. Conditions run `conditionsExpireFaster`
   * faster (#1464), read as the tick begins.
   */
  public advance(dt: number, moving: boolean): StatusId[] {
    const expired: StatusId[] = [];
    const conditionDt = dt * (1 + aggregateModifiers(this.active).conditionsExpireFaster);
    for (const status of this.#statuses.values()) {
      this.#pulse(status, dt);
      status.remainingSeconds -=
        getStatusDefinition(status.id).category === "condition" ? conditionDt : dt;
      if (status.remainingSeconds > 0) {
        continue;
      }
      const renews = getStatusDefinition(status.id).renewsWhileMoving;
      if (moving && renews !== undefined) {
        status.remainingSeconds = renews;
        status.durationSeconds = renews;
      } else {
        expired.push(status.id);
      }
    }
    this.#end(expired, true);
    return expired;
  }

  /**
   * Record the pulses of `status` that fall due in the next `dt` (#1501):
   * one at each whole second since it was applied, none past its
   * duration, so one ending between pulses deals no partial one.
   */
  #pulse(status: ActiveStatus, dt: number): void {
    const pulse = getStatusDefinition(status.id).damagePulse;
    if (pulse === undefined) {
      return;
    }
    const before = status.durationSeconds - status.remainingSeconds;
    const last = Math.min(
      Math.floor(before + dt + PULSE_EPSILON),
      Math.floor(status.durationSeconds + PULSE_EPSILON),
    );
    for (let k = Math.floor(before + PULSE_EPSILON) + 1; k <= last; k += 1) {
      this.#pulses.push({
        id: status.id,
        sourceId: status.sourceId,
        damage: pulse.damage + pulse.growth * (k - 1),
      });
    }
  }
}

/**
 * Whether a foe cannot start a spell at a bearer of `statuses` (#1511,
 * `untargetableByFoeSpells`).
 */
export function untargetableByFoeSpells(statuses: readonly Pick<ActiveStatus, "id">[]): boolean {
  return statuses.some(({ id }) => getStatusDefinition(id).untargetableByFoeSpells);
}

/** Whether every blow at the bearer misses (#1951, `attacksAgainstMiss`). */
export function attacksAgainstMiss(statuses: readonly Pick<ActiveStatus, "id">[]): boolean {
  return statuses.some(({ id }) => getStatusDefinition(id).attacksAgainstMiss);
}

/**
 * Whether a bearer of `statuses` cannot start a spell (#1234,
 * `preventsSpells`). The server's refusal and the skill bar's dimming
 * both ask this, so the two cannot disagree.
 */
export function preventsSpells(statuses: readonly Pick<ActiveStatus, "id">[]): boolean {
  return statuses.some(({ id }) => getStatusDefinition(id).preventsSpells);
}

/**
 * Whether a bearer of `statuses` cannot attack (#1575, `preventsAttacks`).
 * The server's refusal of a swing or an attack skill and the skill bar's
 * dimming all ask this, so they cannot disagree.
 */
export function preventsAttacks(statuses: readonly Pick<ActiveStatus, "id">[]): boolean {
  return statuses.some(({ id }) => getStatusDefinition(id).preventsAttacks);
}

/**
 * Whether a bearer of `statuses` cannot start a resurrection skill
 * (#1745, `preventsResurrection`). The refusal and the skill bar's
 * dimming both ask this, as they do `preventsAttacks`.
 */
export function preventsResurrection(statuses: readonly Pick<ActiveStatus, "id">[]): boolean {
  return statuses.some(({ id }) => getStatusDefinition(id).preventsResurrection);
}

/**
 * The type a bearer of `statuses` deals its physical damage as (#1873):
 * the first status's `physicalDamageDealtAs`, Greater Conflagration's
 * fire. `undefined`: its own.
 */
export function physicalDamageDealtAsOf(
  statuses: readonly Pick<ActiveStatus, "id">[],
): DamageType | undefined {
  for (const { id } of statuses) {
    const turned = getStatusDefinition(id).physicalDamageDealtAs;
    if (turned !== undefined) {
      return turned;
    }
  }
  return undefined;
}

/**
 * The type a packet of `type` is as its dealer deals it (#1873): physical
 * damage turns into `dealtAs`, the dealer's `physicalDamageDealtAsOf`;
 * anything else stays. Read before the victim's `damageTypeTaken`.
 */
export function damageTypeDealt(type: DamageType, dealtAs: DamageType | undefined): DamageType {
  return dealtAs !== undefined && isPhysicalDamage(type) ? dealtAs : type;
}

/**
 * The type a packet of `type` is when it reaches a bearer of `statuses`
 * (#1745): elemental damage turns into a status's
 * `elementalDamageTakenAs`, Winter's cold; anything else stays.
 */
export function damageTypeTaken(
  type: DamageType,
  statuses: readonly Pick<ActiveStatus, "id">[],
): DamageType {
  if (!isElementalDamage(type)) {
    return type;
  }
  for (const { id } of statuses) {
    const turned = getStatusDefinition(id).elementalDamageTakenAs;
    if (turned !== undefined) {
      return turned;
    }
  }
  return type;
}

/**
 * Whether a bearer of `statuses` can hold no enchantment (#1732,
 * `preventsEnchantments`): the refusal of an enchantment spell at it
 * asks this, and so does every status landing on it.
 */
export function preventsEnchantments(statuses: readonly Pick<ActiveStatus, "id">[]): boolean {
  return statuses.some(({ id }) => getStatusDefinition(id).preventsEnchantments);
}

/**
 * Whether a bearer of `statuses` cannot use a shout or a chant (#1732,
 * `preventsShoutsAndChants`). The server's refusal and the skill bar's
 * dimming both ask this.
 */
export function preventsShoutsAndChants(statuses: readonly Pick<ActiveStatus, "id">[]): boolean {
  return statuses.some(({ id }) => getStatusDefinition(id).preventsShoutsAndChants);
}

/**
 * How long a status lasts on `target`: its nominal duration, shortened
 * by the target's condition-duration runes (a Rune of Restoration takes
 * bleeding to 80%). Every path that puts a status on a combatant asks
 * this first, so a rune cannot work for skills and not for dummies. The
 * scale is the wearer's, never the caster's.
 */
export function scaledStatusDuration(
  target: Pick<Combatant, "equipment">,
  statusId: StatusId,
  durationSeconds: number,
): number {
  return durationSeconds * (target.equipment.statusDurationScale.get(statusId) ?? 1);
}

/* -------------------------------------------------------------------------- */
/* Aggregated modifiers                                                        */
/* -------------------------------------------------------------------------- */

export interface StatusModifiers {
  /** Every status's health pips, summed and not yet clamped. */
  readonly healthPips: number;
  /** Every status's energy pips, summed and not yet clamped. */
  readonly energyPips: number;
  readonly armorModifier: number;
  /** Every status's, summed: armor while the bearer is not moving (#921). */
  readonly armorWhileStill: number;
  /** Every status's, summed: health per second while the bearer is moving (#921). */
  readonly healthPerSecondWhileMoving: number;
  /** Every status's, summed: health per second, moving or not (#975). */
  readonly healthPerSecond: number;
  /** Every status's, summed: health per second near a spirit (#1064). */
  readonly healthPerSecondNearSpirit: number;
  /** The largest armor reduction; `undefined`: none. */
  readonly armorReduction: ArmorReduction | undefined;
  readonly moveSpeedMultiplier: number;
  readonly attackMissChance: number;
  /** The largest single status's: losses do not add up. */
  readonly maxHealthLoss: MaxHealthLoss | undefined;
  /** Every status's, summed (#1359). */
  readonly maxHealthBonus: number;
  /** Every status's, summed (#1464). */
  readonly maxEnergyBonus: number;
  /** Every status's, summed (#1915). */
  readonly minionDamageBonus: number;
  /** Every status's, multiplied, and floored at `HEALING_MULTIPLIER_FLOOR`. */
  readonly healingMultiplier: number;
  readonly weaponDamageMultiplier: number;
  /** Every status's, summed (#1064). */
  readonly physicalDamageTakenBonus: number;
  /** Every status's `attributeDeltas`, in `active` order (#1941). */
  readonly attributeDeltas: readonly AttributeDelta[];
  /** Every status's `attributeSet`, oldest first (#1929). */
  readonly attributeSets: readonly AttributeSet[];
  readonly castTimeMultiplier: number;
  /** Every status's, multiplied (#1473). */
  readonly skillActivationMultiplier: number;
  readonly attackDurationMultiplier: number;
  /** Every status's, multiplied (#1742). */
  readonly projectileSpeedMultiplier: number;
  /** Every status's, multiplied (#919). */
  readonly damageTakenMultiplier: number;
  /** Every status's, summed (#1108). */
  readonly damageReduction: number;
  /** The lowest single status's (#936); `undefined`: no cap. */
  readonly maxDamageFractionPerHit: number | undefined;
  /** The lowest single status's (#1265); `undefined`: no cap. */
  readonly attackDamageCapFraction: number | undefined;
  /** Every status's, summed (#1265). */
  readonly lifeStealReduction: number;
  /** Every status's, multiplied (#1979). */
  readonly sacrificeMultiplier: number;
  /** The longest single status's (#1265); `undefined`: none. */
  readonly knockdownMinSeconds: number | undefined;
  /** Every status's, summed (#936). */
  readonly extraStrikesPerHit: number;
  /**
   * The share taken off a spell's recharge (#938): several combine as
   * 1 − Π(1 − f), never more than `MAX_RECHARGE_REDUCTION` (#975).
   */
  readonly spellRechargeFaster: number;
  /** As `spellRechargeFaster`, for a skill of any type (#1539). */
  readonly skillRechargeFaster: number;
  /** As `spellRechargeFaster`, for a binding ritual (#1064). */
  readonly bindingRitualRechargeFaster: number;
  /** Every status's, summed (#1455). */
  readonly adrenalineGainFaster: number;
  /** Every status's (#1455): the recharge takes the largest that applies. */
  readonly enchantmentRechargeFaster: readonly EnchantmentRechargeFaster[];
  /** Every status's (#1464): a skill takes every share that names its profession. */
  readonly skillArmorPenetration: readonly SkillArmorPenetration[];
  /** Any status's (#1464). */
  readonly uninterruptible: boolean;
  /** Every status's, summed (#1464). */
  readonly conditionsExpireFaster: number;
  /** Every status's, multiplied (#944). */
  readonly incomingHexCastTimeMultiplier: number;
  /** Every status's, summed (#988). */
  readonly criticalChanceBonus: number;
  /** The largest status's (#1519). */
  readonly attackArmorPenetration: number;
  /** Every status's, summed (#988). */
  readonly energyPerCritical: number;
  /** Every status's, summed (#1326). */
  readonly healthPerCritical: number;
  /** Every status's, summed (#1270). */
  readonly damageFromSpiritAttacks: number;
  /** Any status's (#1329). */
  readonly ignoresCriticalDamage: boolean;
}

/**
 * The most recharge reductions together take off (GW1, "Recharge"): they
 * multiply, and never shorten a recharge by more than half.
 */
export const MAX_RECHARGE_REDUCTION = 0.5;

/**
 * A spell's recharge of `seconds`, `faster` shorter (`StatusModifiers.
 * spellRechargeFaster`, #975): never below 1 s, and one already under
 * 1 s is not raised to it.
 */
export function reducedRecharge(seconds: number, faster: number): number {
  return faster > 0 ? Math.max(Math.min(seconds, 1), seconds * (1 - faster)) : seconds;
}

/** The weakest heals get, whatever reduces them (GW1: at most −40%). */
export const HEALING_MULTIPLIER_FLOOR = 0.6;

/**
 * Whether a status in `statuses` other than `self` is of one of `under`'s
 * categories (#1485) or one of its ids (#1873).
 */
export function isUnderAnother(
  statuses: readonly Pick<ActiveStatus, "id">[],
  self: Pick<ActiveStatus, "id">,
  under: Pick<WhileUnder, "categories" | "statusIds">,
): boolean {
  return statuses.some(
    (other) =>
      other !== self &&
      (under.statusIds.includes(other.id) ||
        under.categories.includes(getStatusDefinition(other.id).category)),
  );
}

/**
 * Whether `self` does nothing now (#1916): its bearer holds another
 * status of a category it is `suppressedWhileUnder`, as Brutal Weapon
 * beside an enchantment.
 */
export function isSuppressed(
  statuses: readonly Pick<ActiveStatus, "id">[],
  self: Pick<ActiveStatus, "id">,
): boolean {
  const categories = getStatusDefinition(self.id).suppressedWhileUnder;
  return categories !== undefined && isUnderAnother(statuses, self, { categories, statusIds: [] });
}

/**
 * Collapse every active status into one set of modifiers.
 *
 * Additive effects (health and energy pips, armor, attributes) sum;
 * multiplicative ones (move speed, healing, weapon damage, cast time,
 * damage taken, a hex's cast time on the bearer) multiply; miss chance takes the
 * worst rather than compounding, so two blinding effects cannot push a
 * player past certain failure in a way that feels arbitrary. A maximum
 * health loss and an armor reduction are each the largest single one,
 * a cap on damage per hit the lowest (#936), and healing is floored at `HEALING_MULTIPLIER_FLOOR`.
 * Attack duration is GW1's rule: only the strongest speed-up and the
 * strongest slow-down count, and they multiply. Pips per enchantment
 * (#845) count every enchantment in `statuses`, the one giving them
 * included. Under a status that bars speed boosts (#1745), only the
 * slows among the move speeds count.
 */
export function aggregateModifiers(
  statuses: readonly Pick<ActiveStatus, "id" | "ranks">[],
): StatusModifiers {
  let healthPips = 0;
  let energyPips = 0;
  let armorModifier = 0;
  let armorWhileStill = 0;
  let healthPerSecondWhileMoving = 0;
  let healthPerSecond = 0;
  let healthPerSecondNearSpirit = 0;
  let armorReduction: ArmorReduction | undefined;
  let moveSpeedMultiplier = 1;
  const speedBoostsBarred = statuses.some(({ id }) => getStatusDefinition(id).preventsSpeedBoosts);
  let attackMissChance = 0;
  let maxHealthLoss: MaxHealthLoss | undefined;
  let maxHealthBonus = 0;
  let maxEnergyBonus = 0;
  let minionDamageBonus = 0;
  const healingMultipliers: number[] = [];
  let weaponDamageMultiplier = 1;
  let physicalDamageTakenBonus = 0;
  const attributeDeltas: AttributeDelta[] = [];
  const attributeSets: AttributeSet[] = [];
  let castTimeMultiplier = 1;
  let skillActivationMultiplier = 1;
  let attackFaster = 1;
  let projectileSpeedMultiplier = 1;
  let attackSlower = 1;
  let damageTakenMultiplier = 1;
  let damageReduction = 0;
  let maxDamageFractionPerHit: number | undefined;
  let attackDamageCapFraction: number | undefined;
  let lifeStealReduction = 0;
  let sacrificeMultiplier = 1;
  let knockdownMinSeconds: number | undefined;
  let extraStrikesPerHit = 0;
  let adrenalineGainFaster = 0;
  const enchantmentRechargeFaster: EnchantmentRechargeFaster[] = [];
  const skillArmorPenetration: SkillArmorPenetration[] = [];
  let uninterruptible = false;
  let conditionsExpireFaster = 0;
  let spellRechargeKept = 1;
  let skillRechargeKept = 1;
  let bindingRitualRechargeKept = 1;
  let incomingHexCastTimeMultiplier = 1;
  let damageFromSpiritAttacks = 0;
  let criticalChanceBonus = 0;
  let attackArmorPenetration = 0;
  let energyPerCritical = 0;
  let healthPerCritical = 0;
  let ignoresCriticalDamage = false;
  const enchantments = statuses.filter(
    (status) => getStatusDefinition(status.id).category === "enchantment",
  ).length;

  for (const status of statuses) {
    const def = getStatusDefinition(status.id);
    if (isSuppressed(statuses, status)) {
      continue;
    }
    const { ranks } = status;
    healthPips += Math.round(statAt(def.healthPips, ranks));
    if (def.healthPipsPerEnchantment !== undefined) {
      const { pips, max } = def.healthPipsPerEnchantment;
      healthPips += pips * Math.min(enchantments, max);
    }
    energyPips += def.energyPips;
    armorModifier += Math.round(statAt(def.armorModifier, ranks));
    armorWhileStill += def.armorWhileStill;
    healthPerSecondWhileMoving += def.healthPerSecondWhileMoving;
    healthPerSecond += def.healthPerSecond;
    healthPerSecondNearSpirit += def.healthPerSecondNearSpirit;
    if (
      def.armorReduction !== undefined &&
      (armorReduction === undefined || def.armorReduction.amount > armorReduction.amount)
    ) {
      armorReduction = def.armorReduction;
    }
    moveSpeedMultiplier *= speedBoostsBarred
      ? Math.min(1, def.moveSpeedMultiplier)
      : def.moveSpeedMultiplier;
    attackMissChance = Math.max(attackMissChance, def.attackMissChance);
    if (
      def.maxHealthLoss !== undefined &&
      (maxHealthLoss === undefined || def.maxHealthLoss.fraction > maxHealthLoss.fraction)
    ) {
      maxHealthLoss = def.maxHealthLoss;
    }
    maxHealthBonus +=
      Math.round(statAt(def.maxHealthBonus, ranks)) +
      def.maxHealthBonusPerEnchantment * enchantments;
    maxEnergyBonus += def.maxEnergyBonus;
    minionDamageBonus += def.minionDamageBonus;
    healingMultipliers.push(def.healingMultiplier);
    weaponDamageMultiplier *= def.weaponDamageMultiplier;
    physicalDamageTakenBonus += Math.round(statAt(def.physicalDamageTakenBonus, ranks));
    for (const delta of def.attributeDeltas) {
      attributeDeltas.push(delta);
    }
    if (def.attributeSet !== undefined) {
      attributeSets.push(def.attributeSet);
    }
    castTimeMultiplier *= def.castTimeMultiplier;
    skillActivationMultiplier *= def.skillActivationMultiplier;
    const attackDuration = statAt(def.attackDurationMultiplier, ranks);
    attackFaster = Math.min(attackFaster, attackDuration);
    attackSlower = Math.max(attackSlower, attackDuration);
    projectileSpeedMultiplier *= def.projectileSpeedMultiplier;
    damageTakenMultiplier *= statAt(def.damageTakenMultiplier, ranks);
    damageReduction += def.damageReduction;
    if (
      def.maxDamageFractionPerHit !== undefined &&
      (maxDamageFractionPerHit === undefined ||
        def.maxDamageFractionPerHit < maxDamageFractionPerHit)
    ) {
      maxDamageFractionPerHit = def.maxDamageFractionPerHit;
    }
    if (
      def.attackDamageCapFraction !== undefined &&
      (attackDamageCapFraction === undefined ||
        def.attackDamageCapFraction < attackDamageCapFraction)
    ) {
      attackDamageCapFraction = def.attackDamageCapFraction;
    }
    lifeStealReduction += def.lifeStealReduction;
    sacrificeMultiplier *= def.sacrificeMultiplier;
    if (
      def.knockdownMinSeconds !== undefined &&
      (knockdownMinSeconds === undefined || def.knockdownMinSeconds > knockdownMinSeconds)
    ) {
      knockdownMinSeconds = def.knockdownMinSeconds;
    }
    extraStrikesPerHit += def.extraStrikesPerHit;
    adrenalineGainFaster += def.adrenalineGainFaster;
    if (def.whileUnder !== undefined && isUnderAnother(statuses, status, def.whileUnder)) {
      attackFaster = Math.min(attackFaster, def.whileUnder.attackDurationMultiplier);
      attackSlower = Math.max(attackSlower, def.whileUnder.attackDurationMultiplier);
      adrenalineGainFaster += def.whileUnder.adrenalineGainFaster;
      healthPips += def.whileUnder.healthPips;
      armorModifier += def.whileUnder.armorModifier;
      attackMissChance = Math.max(attackMissChance, def.whileUnder.attackMissChance);
    }
    if (def.enchantmentRechargeFaster !== undefined) {
      enchantmentRechargeFaster.push(def.enchantmentRechargeFaster);
    }
    if (def.skillArmorPenetration !== undefined) {
      skillArmorPenetration.push(def.skillArmorPenetration);
    }
    uninterruptible ||= def.uninterruptible;
    conditionsExpireFaster += def.conditionsExpireFaster;
    spellRechargeKept *= 1 - def.spellRechargeFaster;
    skillRechargeKept *= 1 - def.skillRechargeFaster;
    bindingRitualRechargeKept *= 1 - def.bindingRitualRechargeFaster;
    incomingHexCastTimeMultiplier *= def.incomingHexCastTimeMultiplier;
    damageFromSpiritAttacks += def.damageFromSpiritAttacks;
    criticalChanceBonus += def.criticalChanceBonus;
    attackArmorPenetration = Math.max(attackArmorPenetration, def.attackArmorPenetration);
    energyPerCritical += def.energyPerCritical;
    healthPerCritical += def.healthPerCritical;
    ignoresCriticalDamage ||= def.ignoresCriticalDamage;
  }

  return {
    healthPips,
    energyPips,
    armorModifier,
    armorWhileStill,
    healthPerSecondWhileMoving,
    healthPerSecond,
    healthPerSecondNearSpirit,
    armorReduction,
    moveSpeedMultiplier,
    attackMissChance,
    maxHealthLoss,
    maxHealthBonus,
    maxEnergyBonus,
    minionDamageBonus,
    healingMultiplier: combinedHealingMultiplier(healingMultipliers),
    weaponDamageMultiplier,
    physicalDamageTakenBonus,
    attributeDeltas,
    attributeSets,
    castTimeMultiplier,
    skillActivationMultiplier,
    attackDurationMultiplier: attackFaster * attackSlower,
    projectileSpeedMultiplier,
    damageTakenMultiplier,
    damageReduction,
    maxDamageFractionPerHit,
    attackDamageCapFraction,
    lifeStealReduction,
    sacrificeMultiplier,
    knockdownMinSeconds,
    extraStrikesPerHit,
    spellRechargeFaster: Math.min(MAX_RECHARGE_REDUCTION, 1 - spellRechargeKept),
    skillRechargeFaster: Math.min(MAX_RECHARGE_REDUCTION, 1 - skillRechargeKept),
    bindingRitualRechargeFaster: Math.min(MAX_RECHARGE_REDUCTION, 1 - bindingRitualRechargeKept),
    adrenalineGainFaster,
    enchantmentRechargeFaster,
    skillArmorPenetration,
    uninterruptible,
    conditionsExpireFaster,
    incomingHexCastTimeMultiplier,
    criticalChanceBonus,
    attackArmorPenetration,
    energyPerCritical,
    healthPerCritical,
    damageFromSpiritAttacks,
    ignoresCriticalDamage,
  };
}

/**
 * Several healing reductions together (GW1): they multiply, and heals are
 * never cut below `HEALING_MULTIPLIER_FLOOR`.
 */
export function combinedHealingMultiplier(multipliers: readonly number[]): number {
  return Math.max(
    HEALING_MULTIPLIER_FLOOR,
    multipliers.reduce((product, multiplier) => product * multiplier, 1),
  );
}
