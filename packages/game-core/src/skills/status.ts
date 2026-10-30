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

import { AREA_ADJACENT, AREA_EARSHOT, AREA_IN_THE_AREA, AREA_NEARBY } from "../distances.js";
import type { ConditionalArmor } from "../equipment/armor.js";
import type { DamageType } from "../equipment/types.js";
import { wieldsFor, type Weapon, type WeaponId } from "../equipment/weapons.js";
import type { ProfessionId } from "../professions.js";
import { gw1EnergyScaled } from "../ruleset.js";
import {
  isSpell,
  type AttackWeaponClass,
  type Combatant,
  type ConditionalBonus,
  type DamageEffect,
  type HealEffect,
  type Skill,
  type SkillEffect,
  type SkillType,
} from "./types.js";
import { KNOCKDOWN_SECONDS } from "./types.js";

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
  // Conditions (brief §12's starting set).
  | "bleeding"
  | "burning"
  | "poison"
  | "crippled"
  | "blind"
  | "weakness"
  | "cracked-armor"
  | "deep-wound"
  | "dazed"
  | "disease"
  // Hexes / enchantments implemented so far.
  | "faintheartedness"
  | "malaise"
  | "backfire"
  | "empathy"
  | "parasitic-bond"
  | "contagion"
  | "shard-storm"
  | "shadow-of-fear"
  | "spiteful-spirit"
  | "insidious-parasite"
  | "mark-of-pain"
  | "diversion"
  | "arcane-echo"
  | "echo"
  | "ice-spikes"
  | "deep-freeze"
  | "regeneration"
  | "blood-ritual"
  | "armor-boost"
  | "guardian"
  | "mending"
  | "patient-spirit"
  | "holy-veil"
  | "healing-breeze"
  | "protective-spirit"
  | "shadow-refuge"
  | "shroud-of-distress"
  | "reversal-of-fortune"
  | "vigorous-spirit"
  // Stances.
  | "sprint"
  | "dash"
  | "frenzy"
  | "dark-escape"
  | "natural-stride"
  | "lightning-reflexes"
  | "escape"
  // Warrior Tactics stances (#1329).
  | "bonettis-defense"
  | "deflect-arrows"
  | "gladiators-defense"
  | "disciplined-stance"
  | "balanced-stance"
  | "mantra-of-recovery"
  // Preparations.
  | "apply-poison"
  // Glyphs.
  | "glyph-of-lesser-energy"
  // Shouts and skill effects (#524).
  | "watch-yourself"
  | "healing-signet-armor"
  | "for-great-justice"
  | "critical-eye"
  | "critical-defenses"
  // Shadow Arts (#1326).
  | "feigned-neutrality"
  | "way-of-perfection"
  // Swordsmanship (#1354).
  | "hundred-blades"
  // Strength (#1359).
  | "rush"
  | "dolyak-signet"
  | "endure-pain"
  | "warriors-endurance"
  // Paragon shouts (#921).
  | "fall-back"
  | "stand-your-ground"
  // Paragon shouts and a chant (#956).
  | "incoming"
  | "make-haste"
  | "defensive-anthem"
  | "song-of-restoration"
  // Chants and weapon spells (#758).
  | "anthem-of-flame"
  | "weapon-of-warding"
  // Paragon chants 2 (#1483): the next skill of a kind.
  | "zealous-anthem"
  | "aria-of-zeal"
  | "lyric-of-zeal"
  | "aria-of-restoration"
  | "chorus-of-restoration"
  | "lyric-of-purification"
  | "song-of-purification"
  | "hexbreaker-aria"
  | "anthem-of-fury"
  | "anthem-of-weariness"
  | "crippling-anthem"
  | "anthem-of-disruption"
  | "song-of-concentration"
  | "anthem-of-guidance"
  | "energizing-chorus"
  | "anthem-of-envy"
  // Ritualist weapon spells (#975).
  | "spirit-light-weapon"
  | "weapon-of-quickening"
  | "weapon-of-aggression"
  // Ritualist weapon spells 2 (#1022).
  | "weapon-of-remedy"
  | "vengeful-weapon"
  | "splinter-weapon"
  // Paragon command (#923).
  | "never-surrender"
  // Dervish enchantments and stances (#845).
  | "mystic-regeneration"
  | "fleeting-stability"
  | "heart-of-fury"
  | "vow-of-strength"
  | "sand-shards"
  | "pious-haste"
  | "pious-haste-run"
  // Dervish earth enchantments (#1021).
  | "staggering-force"
  | "dust-cloak"
  | "aura-of-thorns"
  | "enchanted-haste"
  | "heart-of-holy-flame"
  | "balthazars-rage"
  | "harriers-haste"
  // Spirits' auras (#1064), worn while in a spirit's range.
  | "winnowing"
  | "recuperation"
  // Ritualist protective spirits' auras (#1265).
  | "shelter"
  | "union"
  | "displacement"
  | "earthbind"
  // Wards' auras (#1087), worn while inside a ward.
  | "ward-against-melee"
  // Wells' auras (#1104), worn while inside a well.
  | "well-of-suffering"
  // Ranger calls and bonds on a pet (#1108).
  | "call-of-haste"
  | "call-of-protection"
  | "symbiotic-bond"
  // Mesmer Illusion Magic (#1228).
  | "conjure-phantasm"
  | "imagined-burden"
  | "phantom-pain"
  | "shrinking-armor"
  | "illusion-of-haste"
  | "ineptitude"
  | "crippling-anguish"
  // Assassin Deadly Arts (#1234).
  | "shroud-of-silence"
  | "expose-defenses"
  | "enduring-toxin"
  | "mark-of-death"
  // Ritualist Channeling (#1270).
  | "painful-bond"
  | "lamentation"
  // Necromancer Curses hexes (#1332).
  | "barbs"
  | "price-of-failure"
  | "suffering"
  | "defile-flesh"
  | "rigor-mortis"
  | "lingering-curse"
  // Ritualist Spawning Power creation staples (#1316).
  | "boon-of-creation"
  | "explosive-growth"
  | "spirits-gift"
  // Hex and enchantment gain triggers (#1403).
  | "soul-barbs"
  | "defile-defenses"
  | "scourge-enchantment"
  | "hex-breaker"
  // Paragon echoes (#1423).
  | "aggressive-refrain"
  | "blazing-finale"
  | "burning-refrain"
  | "enduring-harmony"
  | "finale-of-restoration"
  | "hasty-refrain"
  | "mending-refrain"
  | "purifying-finale"
  | "bladeturn-refrain"
  | "energizing-finale"
  | "soldiers-fury"
  // Elementalist Water Magic staples (#1367).
  | "ice-prison"
  | "frozen-burst"
  | "ice-spear"
  | "blurred-vision"
  | "armor-of-mist"
  | "shatterstone"
  | "mind-freeze"
  // Ritualist item spells (#1434).
  | "protective-was-kaolai"
  | "generous-was-tsungrai"
  | "defiant-was-xinrae"
  | "blind-was-mingson"
  | "grasping-was-kuurong"
  | "energetic-was-lee-sa"
  // Ritualist item spells 2 (#1464).
  | "mighty-was-vorizun"
  | "cruel-was-daoshen"
  | "destructive-was-glaive"
  | "tranquil-was-tanasen"
  | "vengeful-was-khanhei"
  | "pure-was-li-ming"
  // Dervish forms (#1437).
  | "avatar-of-melandru"
  | "avatar-of-dwayna"
  | "avatar-of-balthazar"
  | "avatar-of-grenth"
  | "avatar-of-lyssa"
  // Mesmer "the next spell fails" hexes (#1475).
  | "guilt"
  | "shame"
  | "mistrust"
  | "fragility";

/** A status's modifiers that hold only while its bearer is under another (#1485). */
export interface WhileUnder {
  /** The bearer must have a status of one of these categories, not this one. */
  readonly categories: readonly StatusCategory[];
  readonly attackDurationMultiplier: number;
  readonly adrenalineGainFaster: number;
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
   * Health regeneration while active, in GW1 pips (`HEALTH_PER_PIP`):
   * negative degenerates. Every status's pips sum, clamped to
   * `MAX_PIPS` either way, and apply continuously, not in lumps.
   */
  readonly healthPips: number;
  /**
   * Health pips for each enchantment on the bearer, itself included,
   * counting at most `max` (#845): Mystic Regeneration. Summed with
   * `healthPips`. `undefined`: none.
   */
  readonly healthPipsPerEnchantment: PipsPerEnchantment | undefined;
  /** Energy regeneration while active, in pips (`ENERGY_PER_PIP`), summed with the base. */
  readonly energyPips: number;
  /** Flat armor modifier while active. */
  readonly armorModifier: number;
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
  readonly maxHealthBonus: number;
  /**
   * Maximum energy added while it lasts (#1464): Mighty Was Vorizun's 30.
   * Gaining it raises only the ceiling; losing it clamps energy to the
   * ceiling left, as `maxHealthBonus` does health.
   */
  readonly maxEnergyBonus: number;
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
  readonly physicalDamageTakenBonus: number;
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
   * Added to every attribute of the bearer above rank 0 (#762): weakness's
   * −1. Read through `rankOf` alone (ADR-0019).
   */
  readonly attributeDelta: number;
  /**
   * Multiplier on the bearer's spell cast time; >1 is a penalty. Dazed
   * doubles it. A signet or any other skill that is not a spell ignores
   * it (#524).
   */
  readonly castTimeMultiplier: number;
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
  readonly attackDurationMultiplier: number;
  /**
   * The bearer cannot start a spell (#1234): Shroud of Silence's "cannot
   * cast spells". A spell already being cast goes off; anything that is
   * not a spell is left alone.
   */
  readonly preventsSpells: boolean;
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
   * Effects on whoever the bearer's physical attacks hit while it lasts
   * (#525): a preparation's rider, as Apply Poison's poison. Applied
   * where a blow lands, swing, attack skill or arrow alike, never on a
   * miss or a block.
   */
  readonly onAttackHit: AttackHitRider | undefined;
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
   * Multiplier on the damage the bearer takes (#919): Frenzy's 2, Dark
   * Escape's 0.5. Applied to every damage packet after armor; health
   * loss and degeneration never pass through it.
   */
  readonly damageTakenMultiplier: number;
  /**
   * Taken off every damage packet the bearer takes, after armor and
   * `damageTakenMultiplier` (#1108): Call of Protection's 17. Never below 0.
   */
  readonly damageReduction: number;
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
   * Whenever a chant or a shout ends on the bearer, its remaining time is
   * back to the duration it was applied with (#1423): a refrain's "this
   * echo is reapplied every time a chant or shout ends on you".
   */
  readonly renewsOnChantOrShoutEnd: boolean;
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
  | "bearer-uses-skill"
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
   * An attack by a foe hit the bearer (#1464): a swing, an attack skill or
   * an arrow that landed, never a miss or a block. Recorded with the
   * attacker, who is the offender, and fired at the drain, as damage from a
   * foe is. Vengeful Was Khanhei's.
   */
  | "bearer-hit-by-attack"
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
  | "ends"
  /**
   * It ended before its time ran out (#1421): stripped, cut short by its
   * own rule, or its bearer died. GW1's "if this enchantment ends
   * prematurely". A refresh is no end.
   */
  | "ends-early"
  | "expires";

/** `StatusDefinition.skillArmorPenetration` (#1464). */
export interface SkillArmorPenetration {
  readonly share: number;
  readonly profession: ProfessionId;
}

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
   */
  readonly effects: readonly TriggerEffect[];
  readonly target: "bearer" | "source" | "offender" | "created" | "gained-source";
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
   * On `bearer-loses-enchantment` only (#1437): it fires only for an
   * enchantment of this profession's (`StatusDefinition.profession`).
   * Absent: any enchantment.
   */
  readonly profession?: ProfessionId;
  /**
   * On `bearer-uses-skill` only (#1437): it fires only for a skill of this
   * type and profession, as Avatar of Dwayna's "whenever you use a Dervish
   * attack skill". Absent: any skill.
   */
  readonly usedSkill?: { readonly type?: SkillType; readonly profession?: ProfessionId };
  /** The skill the log names it after: "mesmer.backfire". */
  readonly skillId: string;
}

/**
 * What a status adds to each of the bearer's physical hits (#525), and
 * the skill the log names it after, apart from the blow (#939): "Sand
 * Shards hits", not "Scythe hits".
 */
export interface AttackHitRider {
  readonly effects: readonly SkillEffect[];
  readonly skillId: string;
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
 * `spellsOnly`; never another echo skill (`isEchoSkill`). The simulation's
 * trigger context names the skill used.
 */
export interface EchoEffect {
  readonly kind: "echo";
  readonly spellsOnly: boolean;
  readonly seconds: number;
}

/** What a trigger can do: any skill effect, Contagion's spread or an echo. */
export type TriggerEffect = SkillEffect | SpreadGainedConditionEffect | EchoEffect;

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
  | {
      readonly kind: "blocked";
      readonly offenderId: string;
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

/** A glyph's hold on the next spells: how many, and how much cheaper (#526). */
export interface NextSpells {
  readonly count: number;
  readonly costReduction: number;
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

function define(
  id: StatusId,
  name: string,
  category: StatusCategory,
  overrides: Partial<Omit<StatusDefinition, "id" | "name" | "category">> = {},
): StatusDefinition {
  return {
    id,
    name,
    category,
    profession: undefined,
    healthPips: 0,
    healthPipsPerEnchantment: undefined,
    energyPips: 0,
    armorModifier: 0,
    conditionalArmor: [],
    armorWhileStill: 0,
    healthPerSecondWhileMoving: 0,
    healthPerSecond: 0,
    healthPerSecondNearSpirit: 0,
    armorReduction: undefined,
    moveSpeedMultiplier: 1,
    attackMissChance: 0,
    maxHealthLoss: undefined,
    maxHealthBonus: 0,
    maxEnergyBonus: 0,
    healingMultiplier: 1,
    weaponDamageMultiplier: 1,
    physicalDamageTakenBonus: 0,
    attackDamageType: undefined,
    attackDamageTypeWeapon: undefined,
    attributeDelta: 0,
    castTimeMultiplier: 1,
    interruptsSpells: false,
    attackDurationMultiplier: 1,
    preventsSpells: false,
    unblockableBySource: false,
    preventsBlocking: false,
    renewsWhileMoving: undefined,
    preventsKnockdown: false,
    endsOnKnockdownPrevented: false,
    ignoresCriticalDamage: false,
    block: undefined,
    blockBelowHealth: undefined,
    criticalChanceBonus: 0,
    energyPerCritical: 0,
    healthPerCritical: 0,
    refreshesOnCritical: false,
    endsAfterAttacks: undefined,
    onAttackHit: undefined,
    endsAfterHits: undefined,
    nextSpells: undefined,
    spreads: false,
    nextAttackSkill: undefined,
    nextAttackSkillBonus: undefined,
    nextSkill: undefined,
    nextSkillRule: undefined,
    endsWhenBearerAttacks: false,
    endsWhenBearerAttacksInMelee: false,
    endsWhenBearerHits: false,
    endsWhenBearerUsesSkill: false,
    endsWhenBearerUsesAdrenalSkill: false,
    endsWhenTriggered: false,
    endsWhenBearerHitsWithAttackSkill: false,
    endsWhenBearerGains: [],
    immuneTo: [],
    damageTakenMultiplier: 1,
    damageReduction: 0,
    redirectsPhysicalDamage: 0,
    maxDamageFractionPerHit: undefined,
    attackDamageCapFraction: undefined,
    lifeStealReduction: 0,
    knockdownMinSeconds: undefined,
    sourceLosesHealth: undefined,
    reversesNextDamage: undefined,
    extraStrikesPerHit: 0,
    adrenalineGainFaster: 0,
    spellRechargeFaster: 0,
    bindingRitualRechargeFaster: 0,
    enchantmentRechargeFaster: undefined,
    skillArmorPenetration: undefined,
    uninterruptible: false,
    conditionsExpireFaster: 0,
    incomingHexCastTimeMultiplier: 1,
    damageFromSpiritAttacks: 0,
    breaksNextHex: undefined,
    failsNextSpell: undefined,
    renewsOnChantOrShoutEnd: false,
    endsAfterTriggers: undefined,
    chantShoutDurationMultiplier: 1,
    whileUnder: undefined,
    triggers: [],
    ...overrides,
  };
}

/**
 * Status definitions. Conditions follow GW1: its mechanics and its
 * magnitudes (#492). Every other status carries its skill's rank-12
 * values.
 */
/** Spiteful Spirit's damage, on its bearer and each ally beside it (#935). */
const SPITEFUL_SPIRIT_DAMAGE: DamageEffect = {
  kind: "damage",
  amount: { flat: 39 },
  type: "shadow",
  armorPenetration: 0,
};
/**
 * Vigorous Spirit's heal, each time its bearer attacks or casts a spell:
 * scaled by its caster's Healing Prayers, as the trigger's caster is the
 * status's source.
 */
const VIGOROUS_SPIRIT_HEAL: HealEffect = {
  kind: "heal",
  amount: { scaling: { attributeId: "monk.healing-prayers", atZero: 5, atTwelve: 17 } },
  perStatusOnTarget: [],
};

export const STATUS_DEFINITIONS: Readonly<Record<StatusId, StatusDefinition>> = {
  bleeding: define("bleeding", "Bleeding", "condition", { healthPips: -3 }),
  burning: define("burning", "Burning", "condition", { healthPips: -7 }),
  poison: define("poison", "Poison", "condition", { healthPips: -4 }),
  crippled: define("crippled", "Crippled", "condition", { moveSpeedMultiplier: 0.5 }),
  blind: define("blind", "Blind", "condition", { attackMissChance: 0.9 }),
  weakness: define("weakness", "Weakness", "condition", {
    weaponDamageMultiplier: 0.34,
    attributeDelta: -1,
  }),
  "cracked-armor": define("cracked-armor", "Cracked Armor", "condition", {
    armorReduction: { amount: 20, floor: 60 },
  }),
  "deep-wound": define("deep-wound", "Deep Wound", "condition", {
    maxHealthLoss: { fraction: 0.2, cap: 100 },
    healingMultiplier: 0.8,
  }),
  dazed: define("dazed", "Dazed", "condition", { castTimeMultiplier: 2, interruptsSpells: true }),
  disease: define("disease", "Disease", "condition", { healthPips: -4, spreads: true }),

  // Faintheartedness at rank 12: attacks 50% slower, −2 pips (GW1 PvP).
  faintheartedness: define("faintheartedness", "Faintheartedness", "hex", {
    profession: "necromancer",
    healthPips: -2,
    attackDurationMultiplier: 1.5,
  }),
  malaise: define("malaise", "Malaise", "hex", {
    profession: "necromancer",
    energyPips: -1,
  }),
  // "Whenever target foe casts a spell, that foe takes 35...119...140
  // damage": 119, its rank-12 value.
  backfire: define("backfire", "Backfire", "hex", {
    profession: "mesmer",
    triggers: [
      {
        on: "bearer-casts-spell",
        effects: [{ kind: "damage", amount: { flat: 119 }, type: "typeless", armorPenetration: 0 }],
        target: "bearer",
        skillId: "mesmer.backfire",
      },
    ],
  }),
  // "Whenever target foe attacks, that foe takes 15...39...45 damage"
  // (PvP): 39, its rank-12 value.
  empathy: define("empathy", "Empathy", "hex", {
    profession: "mesmer",
    triggers: [
      {
        on: "bearer-attacks",
        effects: [{ kind: "damage", amount: { flat: 39 }, type: "typeless", armorPenetration: 0 }],
        target: "bearer",
        skillId: "mesmer.empathy",
      },
    ],
  }),
  // "For 20 seconds, target foe suffers health degeneration of 1. The
  // caster is healed for 30...102...120 when Parasitic Bond ends": 102,
  // its rank-12 value.
  "parasitic-bond": define("parasitic-bond", "Parasitic Bond", "hex", {
    profession: "necromancer",
    healthPips: -1,
    triggers: [
      {
        on: "ends",
        effects: [{ kind: "heal", amount: { flat: 102 }, perStatusOnTarget: [] }],
        target: "source",
        skillId: "necromancer.parasitic-bond",
      },
    ],
  }),
  // "For 60 seconds, whenever you suffer from a new Condition, all foes in
  // the area suffer from that same Condition and you sacrifice
  // 10...6...5% maximum Health": 6%, its rank-12 value.
  contagion: define("contagion", "Contagion", "enchantment", {
    profession: "necromancer",
    triggers: [
      {
        on: "bearer-gains-condition",
        effects: [
          { kind: "spread-gained-condition", radius: AREA_IN_THE_AREA },
          { kind: "sacrifice-health", percentOfMax: 6 },
        ],
        target: "bearer",
        skillId: "necromancer.contagion",
      },
    ],
  }),
  // "...move 66% slower for 2...5...6 seconds" (#918).
  "shard-storm": define("shard-storm", "Shard Storm", "hex", {
    profession: "elementalist",
    moveSpeedMultiplier: 0.34,
  }),
  // "...attack 50% slower": Faintheartedness's slow without its degeneration (#918).
  "shadow-of-fear": define("shadow-of-fear", "Shadow of Fear", "hex", {
    profession: "necromancer",
    attackDurationMultiplier: 1.5,
  }),
  // "Whenever target foe attacks or uses a skill, Spiteful Spirit deals
  // 15...39...45 shadow damage to that foe and all adjacent allies of that
  // foe" (#935): 39, its rank-12 value. An attack skill is both, so twice.
  "spiteful-spirit": define("spiteful-spirit", "Spiteful Spirit", "hex", {
    profession: "necromancer",
    triggers: (["bearer-uses-skill", "bearer-attacks"] as const).map((on) => ({
      on,
      effects: [
        SPITEFUL_SPIRIT_DAMAGE,
        {
          kind: "splash",
          hits: "foes",
          radius: AREA_ADJACENT,
          maxTargets: undefined,
          effects: [SPITEFUL_SPIRIT_DAMAGE],
        },
      ],
      target: "bearer",
      skillId: "necromancer.spiteful-spirit",
    })),
  }),
  // "For 6 seconds, the next time target foe uses a skill, that skill
  // takes an additional 10...47...56 seconds to recharge" (#949): 47, its
  // rank-12 value.
  diversion: define("diversion", "Diversion", "hex", {
    profession: "mesmer",
    triggers: [
      {
        on: "bearer-uses-skill",
        effects: [{ kind: "lengthen-recharge", seconds: { flat: 47 } }],
        target: "bearer",
        skillId: "mesmer.diversion",
      },
    ],
    endsWhenBearerUsesSkill: true,
  }),
  // "If you cast a spell in the next 20 seconds, Arcane Echo is replaced
  // with that spell for 20 seconds. Arcane Echo ends prematurely if you
  // use a non-spell skill" (#469).
  "arcane-echo": define("arcane-echo", "Arcane Echo", "enchantment", {
    profession: "mesmer",
    triggers: [
      {
        on: "bearer-uses-skill",
        effects: [{ kind: "echo", spellsOnly: true, seconds: 20 }],
        target: "bearer",
        skillId: "mesmer.arcane-echo",
      },
    ],
    endsWhenBearerUsesSkill: true,
  }),
  // "For 30 seconds, Echo is replaced with the next skill you use. Echo
  // acts as this skill for 20 seconds" (#469).
  echo: define("echo", "Echo", "enchantment", {
    profession: "mesmer",
    triggers: [
      {
        on: "bearer-uses-skill",
        effects: [{ kind: "echo", spellsOnly: false, seconds: 20 }],
        target: "bearer",
        skillId: "mesmer.echo",
      },
    ],
    endsWhenBearerUsesSkill: true,
  }),
  // "Whenever target foe hits with an attack, you steal 15...39...45
  // health from that foe" (#935): 39, its rank-12 value.
  "insidious-parasite": define("insidious-parasite", "Insidious Parasite", "hex", {
    profession: "necromancer",
    triggers: [
      {
        on: "bearer-hits",
        effects: [{ kind: "life-steal", amount: { flat: 39 } }],
        target: "bearer",
        skillId: "necromancer.insidious-parasite",
      },
    ],
  }),
  // "Whenever target foe takes physical damage, Mark of Pain deals
  // 10...34...40 shadow damage to adjacent foes" (#935): 34, its rank-12
  // value, on the bearer's allies beside it, never the bearer.
  "mark-of-pain": define("mark-of-pain", "Mark of Pain", "hex", {
    profession: "necromancer",
    triggers: [
      {
        on: "bearer-takes-physical-damage",
        effects: [
          {
            kind: "splash",
            hits: "foes",
            radius: AREA_ADJACENT,
            maxTargets: undefined,
            effects: [
              { kind: "damage", amount: { flat: 34 }, type: "shadow", armorPenetration: 0 },
            ],
          },
        ],
        target: "bearer",
        skillId: "necromancer.mark-of-pain",
      },
    ],
  }),
  // "...move 66% slower for 2...5...6 seconds" (#938).
  "ice-spikes": define("ice-spikes", "Ice Spikes", "hex", {
    profession: "elementalist",
    moveSpeedMultiplier: 0.34,
  }),
  // "For 10 seconds, all foes move 66% slower" (#938).
  "deep-freeze": define("deep-freeze", "Deep Freeze", "hex", {
    profession: "elementalist",
    moveSpeedMultiplier: 0.34,
  }),
  // Troll Unguent's (a ranger skill), though it is an enchantment here.
  regeneration: define("regeneration", "Regeneration", "enchantment", {
    profession: "ranger",
    healthPips: 4,
  }),
  "blood-ritual": define("blood-ritual", "Blood Ritual", "enchantment", {
    profession: "necromancer",
    energyPips: 3,
  }),
  // The slow is Armor of Earth's price: without it, +24 armor is free.
  "armor-boost": define("armor-boost", "Armor Boost", "enchantment", {
    profession: "elementalist",
    armorModifier: 24,
    moveSpeedMultiplier: 0.75,
  }),
  guardian: define("guardian", "Guardian", "enchantment", {
    profession: "monk",
    block: { chance: 0.5, against: "all" },
  }),
  // Mending at rank 12: +3 Health regeneration while maintained (#837).
  mending: define("mending", "Mending", "enchantment", { profession: "monk", healthPips: 3 }),
  // "...Unless Patient Spirit ends prematurely, that ally is healed for
  // 30...102...120 Health when Patient Spirit ends", by its caster's
  // Healing Prayers.
  "patient-spirit": define("patient-spirit", "Patient Spirit", "enchantment", {
    profession: "monk",
    triggers: [
      {
        on: "expires",
        effects: [
          {
            kind: "heal",
            amount: {
              scaling: { attributeId: "monk.healing-prayers", atZero: 30, atTwelve: 102 },
            },
            perStatusOnTarget: [],
          },
        ],
        target: "bearer",
        skillId: "monk.patient-spirit",
      },
    ],
  }),
  // "While you maintain this enchantment, any hexes cast on target other
  // ally take twice as long to cast. When Holy Veil ends, 1 hex is removed
  // from that ally."
  "holy-veil": define("holy-veil", "Holy Veil", "enchantment", {
    profession: "monk",
    incomingHexCastTimeMultiplier: 2,
    triggers: [
      {
        on: "ends",
        effects: [{ kind: "remove-status", category: "hex", count: 1 }],
        target: "bearer",
        skillId: "monk.holy-veil",
      },
    ],
  }),
  // "For 15 seconds, target ally gains health regeneration of 4...8...9":
  // +8, its rank-12 value.
  "healing-breeze": define("healing-breeze", "Healing Breeze", "enchantment", {
    profession: "monk",
    healthPips: 8,
  }),
  // "For 5...19...23 seconds, target ally cannot lose more than 10% max
  // Health from a single hit": 19 s, its rank-12 value, on the skill.
  "protective-spirit": define("protective-spirit", "Protective Spirit", "enchantment", {
    profession: "monk",
    maxDamageFractionPerHit: 0.1,
  }),
  // "For 6 seconds, you gain 5...9...10 Health regeneration. When Shadow
  // Refuge ends, you gain 40...88...100 Health if you are attacking" (#988).
  // Any end, a strip included: GW1 says "ends", not "expires".
  "shadow-refuge": define("shadow-refuge", "Shadow Refuge", "enchantment", {
    profession: "assassin",
    healthPips: 9,
    triggers: [
      {
        on: "ends",
        effects: [
          {
            kind: "if",
            condition: { kind: "target-attacking" },
            effects: [{ kind: "heal", amount: { flat: 88 }, perStatusOnTarget: [] }],
          },
        ],
        target: "bearer",
        skillId: "assassin.shadow-refuge",
      },
    ],
  }),
  // "For 30...54...60 seconds, if you are below 50% Health, you have a 75%
  // chance to block attacks" (#988), read at each block roll.
  "shroud-of-distress": define("shroud-of-distress", "Shroud of Distress", "enchantment", {
    profession: "assassin",
    block: { chance: 0.75, against: "all" },
    blockBelowHealth: 0.5,
  }),
  // "For 8 seconds, the next time target ally would take damage or life
  // steal, that ally gains that amount of health instead, maximum
  // 15...67...80": 67, its rank-12 cap; the 8 s are the skill's.
  "reversal-of-fortune": define("reversal-of-fortune", "Reversal of Fortune", "enchantment", {
    profession: "monk",
    reversesNextDamage: 67,
  }),
  // "For 30 seconds, each time target ally attacks or casts a spell,
  // that ally is healed for 5...17...20 health", at the caster's rank.
  "vigorous-spirit": define("vigorous-spirit", "Vigorous Spirit", "enchantment", {
    profession: "monk",
    triggers: (["bearer-attacks", "bearer-casts-spell"] as const).map((on) => ({
      on,
      effects: [VIGOROUS_SPIRIT_HEAL],
      target: "bearer",
      skillId: "monk.vigorous-spirit",
    })),
  }),

  sprint: define("sprint", "Sprint", "stance", {
    profession: "warrior",
    moveSpeedMultiplier: 1.25,
  }),
  dash: define("dash", "Dash", "stance", { profession: "assassin", moveSpeedMultiplier: 1.5 }),
  // "For 8 seconds, you attack 33% faster but take double damage": faster
  // is 1 − x (ADR-0029).
  frenzy: define("frenzy", "Frenzy", "stance", {
    profession: "warrior",
    attackDurationMultiplier: 0.67,
    damageTakenMultiplier: 2,
  }),
  // "For 5...13...15 seconds, you move 25% faster and take half damage.
  // Dark Escape ends if you successfully hit with an attack."
  "dark-escape": define("dark-escape", "Dark Escape", "stance", {
    profession: "assassin",
    moveSpeedMultiplier: 1.25,
    damageTakenMultiplier: 0.5,
    endsWhenBearerHits: true,
  }),
  // "For 1...7...8 seconds, you run 33% faster and have a 50% chance to
  // block incoming attacks. Natural Stride ends if you become Hexed or
  // Enchanted."
  "natural-stride": define("natural-stride", "Natural Stride", "stance", {
    profession: "ranger",
    moveSpeedMultiplier: 1.33,
    block: { chance: 0.5, against: "all" },
    endsWhenBearerGains: ["hex", "enchantment"],
  }),
  // "For 5...10...11 seconds, you have a 75% chance to block melee and
  // projectile attacks, and you attack 33% faster" (#976).
  "lightning-reflexes": define("lightning-reflexes", "Lightning Reflexes", "stance", {
    profession: "ranger",
    block: { chance: 0.75, against: "all" },
    attackDurationMultiplier: 0.67,
  }),
  // "For 1...7...8 seconds, you move 33% faster and have a 75% chance to
  // block attacks. Escape ends if you make a melee attack." (#976, PvP)
  escape: define("escape", "Escape", "stance", {
    profession: "ranger",
    moveSpeedMultiplier: 1.33,
    block: { chance: 0.75, against: "all" },
    endsWhenBearerAttacksInMelee: true,
  }),
  // "For 5...11 seconds, you have a 75% chance to block melee and
  // projectile attacks. You gain 5 Energy for each successful melee attack
  // blocked. Bonetti's Defense ends if you use a skill." (#1329)
  "bonettis-defense": define("bonettis-defense", "Bonetti's Defense", "stance", {
    profession: "warrior",
    block: { chance: 0.75, against: "all" },
    endsWhenBearerUsesSkill: true,
    triggers: [
      {
        on: "bearer-blocks-melee",
        target: "bearer",
        effects: [{ kind: "energy-gain", amount: { flat: 5 } }],
        skillId: "warrior.bonettis-defense",
      },
    ],
  }),
  // "For 1...6 seconds, you have a 75% chance to block attacks. If you
  // block a projectile attack, adjacent foes suffer from Bleeding for
  // 5...15 seconds" (#1329): 13 s, its rank-12 value.
  "deflect-arrows": define("deflect-arrows", "Deflect Arrows", "stance", {
    profession: "warrior",
    block: { chance: 0.75, against: "all" },
    triggers: [
      {
        on: "bearer-blocks-projectile",
        target: "bearer",
        effects: [
          {
            kind: "splash",
            hits: "foes",
            radius: AREA_ADJACENT,
            maxTargets: undefined,
            effects: [{ kind: "apply-status", statusId: "bleeding", durationSeconds: 13 }],
          },
        ],
        skillId: "warrior.deflect-arrows",
      },
    ],
  }),
  // "For 5...11 seconds, you have a 75% chance to block incoming attacks.
  // Whenever you block a melee attack this way, the attacker suffers
  // 5...35 damage" (#1329): 29, its rank-12 value.
  "gladiators-defense": define("gladiators-defense", "Gladiator's Defense", "stance", {
    profession: "warrior",
    block: { chance: 0.75, against: "all" },
    triggers: [
      {
        on: "bearer-blocks-melee",
        target: "offender",
        effects: [{ kind: "damage", amount: { flat: 29 }, type: "typeless", armorPenetration: 0 }],
        skillId: "warrior.gladiators-defense",
      },
    ],
  }),
  // "For 1...4 seconds, you gain +10 armor and have a 75% chance to block
  // attacks. Disciplined Stance ends if you use an adrenal skill." (#1329)
  "disciplined-stance": define("disciplined-stance", "Disciplined Stance", "stance", {
    profession: "warrior",
    armorModifier: 10,
    block: { chance: 0.75, against: "all" },
    endsWhenBearerUsesAdrenalSkill: true,
  }),
  // "For 8...20 seconds, you cannot be knocked down and you do not suffer
  // extra damage from a critical attack." (#1329) Unlike Fleeting
  // Stability, stopping a knockdown does not end it.
  "balanced-stance": define("balanced-stance", "Balanced Stance", "stance", {
    profession: "warrior",
    preventsKnockdown: true,
    ignoresCriticalDamage: true,
  }),
  // "For 5...17...20 seconds, spells you cast recharge 33% faster" (#938).
  "mantra-of-recovery": define("mantra-of-recovery", "Mantra of Recovery", "stance", {
    profession: "mesmer",
    spellRechargeFaster: 0.33,
  }),

  // "Watch Yourself!" at rank 12: +5...21 armor, ending after 1...3 attacks.
  "watch-yourself": define("watch-yourself", "Watch Yourself!", "shout", {
    profession: "warrior",
    armorModifier: 21,
    endsAfterAttacks: 3,
  }),
  // "For Great Justice!" (PvP): "For 8 seconds, whenever you hit with an
  // attack, you gain 1 additional strike of adrenaline."
  "for-great-justice": define("for-great-justice", "For Great Justice!", "shout", {
    profession: "warrior",
    extraStrikesPerHit: 1,
  }),
  // "For 10...30...35 seconds, you have an additional 3...13...15% chance
  // to land a critical hit when attacking. You gain 1 Energy whenever you
  // score a critical hit" (#988). A skill effect: no strip removes it.
  "critical-eye": define("critical-eye", "Critical Eye", "skill-effect", {
    profession: "assassin",
    criticalChanceBonus: 0.13,
    energyPerCritical: 1,
  }),
  // "For 4...10 seconds, you have +7 Health regeneration and +80 armor.
  // This enchantment ends if you successfully hit with an attack or use a
  // skill" (#1326): 9 s at rank 12. Its own cast is no use of a skill,
  // since it is applied after the use.
  "feigned-neutrality": define("feigned-neutrality", "Feigned Neutrality", "enchantment", {
    profession: "assassin",
    healthPips: 7,
    armorModifier: 80,
    endsWhenBearerHits: true,
    endsWhenBearerUsesSkill: true,
  }),
  // "For 60 seconds, whenever you successfully land a critical hit, you
  // gain 10...40 Health" (#1326): 34 at rank 12.
  "way-of-perfection": define("way-of-perfection", "Way of Perfection", "enchantment", {
    profession: "assassin",
    healthPerCritical: 34,
  }),
  // "For 15 seconds, whenever you attack with a sword, all adjacent foes
  // take 10...30 slashing damage" (PvP, #1354): 26, its rank-12 value. Any
  // attack, an auto-attack or a skill, hit or not. The splash is centred
  // on the bearer and leaves it out.
  "hundred-blades": define("hundred-blades", "Hundred Blades", "skill-effect", {
    profession: "warrior",
    triggers: [
      {
        on: "bearer-attacks",
        weapon: "sword",
        effects: [
          {
            kind: "splash",
            hits: "foes",
            radius: AREA_ADJACENT,
            maxTargets: undefined,
            effects: [
              { kind: "damage", amount: { flat: 26 }, type: "slashing", armorPenetration: 0 },
            ],
          },
        ],
        target: "bearer",
        skillId: "warrior.hundred-blades",
      },
    ],
  }),
  // "For 8...20 seconds, you move 25% faster" (#1359).
  rush: define("rush", "Rush", "stance", { profession: "warrior", moveSpeedMultiplier: 1.25 }),
  // "For 8...20 seconds, you have +10...40 armor and cannot be knocked
  // down, but your movement is slowed by 75%" (#1359): +34, its rank-12
  // value.
  "dolyak-signet": define("dolyak-signet", "Dolyak Signet", "skill-effect", {
    profession: "warrior",
    armorModifier: 34,
    preventsKnockdown: true,
    moveSpeedMultiplier: 0.25,
  }),
  // "For 7...18 seconds you have an additional 90...300 Health" (#1359):
  // 258, its rank-12 value.
  "endure-pain": define("endure-pain", "Endure Pain", "skill-effect", {
    profession: "warrior",
    maxHealthBonus: 258,
  }),
  // "For 5...35 seconds, you gain 3 Energy each time you hit with a melee
  // attack. Warrior's Endurance cannot raise your Energy above 10...25"
  // (PvP, #1359): 22, its rank-12 value, scaled to the pool (#1395): 55 of
  // 50, as 22 sat against GW1's 20. A bow or a thrown spear gains none.
  "warriors-endurance": define("warriors-endurance", "Warrior's Endurance", "stance", {
    profession: "warrior",
    triggers: [
      {
        on: "bearer-hits",
        weapon: "melee",
        effects: [{ kind: "energy-gain", amount: { flat: 3 }, upTo: gw1EnergyScaled(22) }],
        target: "bearer",
        skillId: "warrior.warriors-endurance",
      },
    ],
  }),
  // "For 4...10 seconds, you have a 75% chance to block. Critical Defenses
  // refreshes every time you land a critical hit" (#1315).
  "critical-defenses": define("critical-defenses", "Critical Defenses", "enchantment", {
    profession: "assassin",
    block: { chance: 0.75, against: "all" },
    refreshesOnCritical: true,
  }),
  "healing-signet-armor": define("healing-signet-armor", "Healing Signet", "skill-effect", {
    profession: "warrior",
    armorModifier: -40,
  }),
  // What a spirit projects on whoever is in its range (#1064): worn while
  // there, never stripped, only escaped. "Non-spirit creatures within
  // range take 4 additional damage whenever they take physical damage."
  winnowing: define("winnowing", "Winnowing", "skill-effect", {
    profession: "ranger",
    physicalDamageTakenBonus: 4,
  }),
  // "Non-Spirit allies within its range gain +1...3...3 Health
  // regeneration": the rank-12 3, as statuses carry fixed numbers.
  recuperation: define("recuperation", "Recuperation", "skill-effect", {
    profession: "ritualist",
    healthPips: 3,
  }),
  // The protective spirits (#1265), each paying for what it does with its
  // own health, at rank 12. "Non-spirit allies within its range cannot
  // lose more than 10% maximum Health from a single attack. When this
  // spirit prevents damage, it loses 75...45 Health."
  shelter: define("shelter", "Shelter", "skill-effect", {
    profession: "ritualist",
    attackDamageCapFraction: 0.1,
    sourceLosesHealth: 51,
  }),
  // "Whenever a non-spirit ally in its range takes damage or life steal,
  // it is reduced by 15 and the spirit takes 15 damage."
  union: define("union", "Union", "skill-effect", {
    profession: "ritualist",
    damageReduction: 15,
    lifeStealReduction: 15,
    sourceLosesHealth: 15,
  }),
  // "All non-spirit allies within its range have a 75% chance to block
  // incoming attacks. Every time an attack is blocked in this way, this
  // spirit takes 60 damage."
  displacement: define("displacement", "Displacement", "skill-effect", {
    profession: "ritualist",
    block: { chance: 0.75, against: "all" },
    sourceLosesHealth: 60,
  }),
  // "All non-spirit foes knocked down within its range are knocked down
  // for at least 3 seconds. Whenever this happens, this spirit loses
  // 50...25 Health."
  earthbind: define("earthbind", "Earthbind", "skill-effect", {
    profession: "ritualist",
    knockdownMinSeconds: 3,
    sourceLosesHealth: 30,
  }),
  // What a ward projects on the allies inside it (#1087), as a spirit's
  // aura: "non-spirit allies in this area have a 50% chance to block
  // melee attacks".
  "ward-against-melee": define("ward-against-melee", "Ward Against Melee", "skill-effect", {
    profession: "elementalist",
    block: { chance: 0.5, against: "melee" },
  }),
  // What a well projects on the foes inside it (#1104), at rank 12, as
  // statuses carry fixed numbers: "foes in that area suffer health
  // degeneration of -1...5...6".
  "well-of-suffering": define("well-of-suffering", "Well of Suffering", "skill-effect", {
    profession: "necromancer",
    healthPips: -5,
  }),
  // Calls and a bond on a Ranger's pet (#1108), at rank 12. Call of
  // Haste: "25% faster attack speed and moves 25% faster".
  "call-of-haste": define("call-of-haste", "Call of Haste", "shout", {
    profession: "ranger",
    moveSpeedMultiplier: 1.25,
    attackDurationMultiplier: 0.75,
  }),
  // Call of Protection: "5...17...20 base damage reduction".
  "call-of-protection": define("call-of-protection", "Call of Protection", "shout", {
    profession: "ranger",
    damageReduction: 17,
  }),
  // Symbiotic Bond: "+1...3...3 health regeneration, and half of any
  // physical damage dealt to your animal companion is redirected to you".
  "symbiotic-bond": define("symbiotic-bond", "Symbiotic Bond", "shout", {
    profession: "ranger",
    healthPips: 3,
    redirectsPhysicalDamage: 0.5,
  }),
  // "Fall Back!" at rank 12: 13 Health per second while moving, 33%
  // faster, ending on its bearer's hit.
  "fall-back": define("fall-back", "Fall Back!", "shout", {
    profession: "paragon",
    moveSpeedMultiplier: 1.33,
    healthPerSecondWhileMoving: 13,
    endsWhenBearerHits: true,
  }),
  // "Stand Your Ground!" at rank 12: +24 armor when not moving, ending if
  // its bearer attacks.
  "stand-your-ground": define("stand-your-ground", "Stand Your Ground!", "shout", {
    profession: "paragon",
    armorWhileStill: 24,
    endsWhenBearerAttacks: true,
  }),
  // "Incoming!" at rank 12: "Fall Back!" with no end on a hit (#956).
  incoming: define("incoming", "Incoming!", "shout", {
    profession: "paragon",
    moveSpeedMultiplier: 1.33,
    healthPerSecondWhileMoving: 13,
  }),
  // "Make Haste!": 33% faster, until that ally successfully hits (#956).
  "make-haste": define("make-haste", "Make Haste!", "shout", {
    profession: "paragon",
    moveSpeedMultiplier: 1.33,
    endsWhenBearerHits: true,
  }),
  // "...has a 50% chance to block incoming attacks. This chant ends if
  // that party member hits with an attack skill." (#956)
  "defensive-anthem": define("defensive-anthem", "Defensive Anthem", "chant", {
    profession: "paragon",
    block: { chance: 0.5, against: "all" },
    endsWhenBearerHitsWithAttackSkill: true,
  }),
  // "For 10 seconds, the next time each party member within earshot uses a
  // Skill, that party member gains 45...97...110 Health" (#999, PvP): a
  // heal, by the chanter's Motivation.
  "song-of-restoration": define("song-of-restoration", "Song of Restoration", "chant", {
    profession: "paragon",
    triggers: [
      {
        on: "bearer-uses-skill",
        effects: [
          {
            kind: "heal",
            amount: { scaling: { attributeId: "paragon.motivation", atZero: 45, atTwelve: 97 } },
            perStatusOnTarget: [],
          },
        ],
        target: "bearer",
        skillId: "paragon.song-of-restoration",
      },
    ],
    endsWhenBearerUsesSkill: true,
  }),

  // "Enemies struck by your physical attacks become poisoned for
  // 3...13...15 seconds": 13 s, its rank-12 value.
  "apply-poison": define("apply-poison", "Apply Poison", "preparation", {
    profession: "ranger",
    onAttackHit: {
      effects: [{ kind: "apply-status", statusId: "poison", durationSeconds: 13 }],
      skillId: "ranger.apply-poison",
    },
  }),

  // "Your next 2 spells cost 10...16...18 less Energy to cast": 16, its
  // rank-12 value; Energy Storage scaling waits for #532.
  "glyph-of-lesser-energy": define("glyph-of-lesser-energy", "Glyph of Lesser Energy", "glyph", {
    profession: "elementalist",
    nextSpells: { count: 2, costReduction: 16 },
  }),

  // "The next attack skill used by each party member within earshot also
  // causes Burning for 1...3...3 seconds": 3 s, its rank-12 value.
  "anthem-of-flame": define("anthem-of-flame", "Anthem of Flame", "chant", {
    profession: "paragon",
    nextAttackSkill: [{ kind: "apply-status", statusId: "burning", durationSeconds: 3 }],
  }),
  // "For 10 seconds, the next time each ally within earshot uses an attack
  // skill, that ally gains 1...8 Energy" (#1483): 7, its rank-12 value.
  "zealous-anthem": define("zealous-anthem", "Zealous Anthem", "chant", {
    profession: "paragon",
    nextSkill: {
      which: "attack-skill",
      count: 1,
      effects: [{ kind: "energy-gain", amount: { flat: 7 } }],
      skillId: "paragon.zealous-anthem",
    },
  }),
  // "...uses a spell, that ally gains 1...6 Energy" (#1483): 5 at rank 12.
  "aria-of-zeal": define("aria-of-zeal", "Aria of Zeal", "chant", {
    profession: "paragon",
    nextSkill: {
      which: "spell",
      count: 1,
      effects: [{ kind: "energy-gain", amount: { flat: 5 } }],
      skillId: "paragon.aria-of-zeal",
    },
  }),
  // "...uses a signet, that ally gains 1...8 Energy" (#1483): 7 at rank 12.
  "lyric-of-zeal": define("lyric-of-zeal", "Lyric of Zeal", "chant", {
    profession: "paragon",
    nextSkill: {
      which: "signet",
      count: 1,
      effects: [{ kind: "energy-gain", amount: { flat: 7 } }],
      skillId: "paragon.lyric-of-zeal",
    },
  }),
  // "...uses a spell, that party member gains 30...90 Health" (#1483): 78
  // at rank 12, a heal.
  "aria-of-restoration": define("aria-of-restoration", "Aria of Restoration", "chant", {
    profession: "paragon",
    nextSkill: {
      which: "spell",
      count: 1,
      effects: [{ kind: "heal", amount: { flat: 78 }, perStatusOnTarget: [] }],
      skillId: "paragon.aria-of-restoration",
    },
  }),
  // "...uses a shout or chant, that ally is healed for 30...90 Health"
  // (#1483): 78 at rank 12.
  "chorus-of-restoration": define("chorus-of-restoration", "Chorus of Restoration", "chant", {
    profession: "paragon",
    nextSkill: {
      which: "shout-or-chant",
      count: 1,
      effects: [{ kind: "heal", amount: { flat: 78 }, perStatusOnTarget: [] }],
      skillId: "paragon.chorus-of-restoration",
    },
  }),
  // "...uses a signet, that ally loses 1 condition" (#1483).
  "lyric-of-purification": define("lyric-of-purification", "Lyric of Purification", "chant", {
    profession: "paragon",
    nextSkill: {
      which: "signet",
      count: 1,
      effects: [{ kind: "remove-status", category: "condition", count: 1 }],
      skillId: "paragon.lyric-of-purification",
    },
  }),
  // "The next 1...6 skills used by each ally within earshot remove 1
  // condition from that ally" (#1483): 5 skills at rank 12.
  "song-of-purification": define("song-of-purification", "Song of Purification", "chant", {
    profession: "paragon",
    nextSkill: {
      which: "any",
      count: 5,
      effects: [{ kind: "remove-status", category: "condition", count: 1 }],
      skillId: "paragon.song-of-purification",
    },
  }),
  // "...casts a spell, that ally loses 1 hex" (#1483).
  "hexbreaker-aria": define("hexbreaker-aria", "Hexbreaker Aria", "chant", {
    profession: "paragon",
    nextSkill: {
      which: "spell",
      count: 1,
      effects: [{ kind: "remove-status", category: "hex", count: 1 }],
      skillId: "paragon.hexbreaker-aria",
    },
  }),
  // "...gain 2...5 strikes of adrenaline the next time they use an attack
  // skill" (#1483): 4 at rank 12.
  "anthem-of-fury": define("anthem-of-fury", "Anthem of Fury", "chant", {
    profession: "paragon",
    nextSkill: {
      which: "attack-skill",
      count: 1,
      effects: [{ kind: "adrenaline-gain", strikes: 4 }],
      skillId: "paragon.anthem-of-fury",
    },
  }),
  // "The next attack skill used by each ally within earshot also causes
  // Weakness for 1...16 seconds" (#1483): 13 s at rank 12.
  "anthem-of-weariness": define("anthem-of-weariness", "Anthem of Weariness", "chant", {
    profession: "paragon",
    nextAttackSkill: [{ kind: "apply-status", statusId: "weakness", durationSeconds: 13 }],
  }),
  // "...causes Crippling for 5...15 seconds" (#1483): 13 s at rank 12.
  "crippling-anthem": define("crippling-anthem", "Crippling Anthem", "chant", {
    profession: "paragon",
    nextAttackSkill: [{ kind: "apply-status", statusId: "crippled", durationSeconds: 13 }],
  }),
  // "...also interrupts an action" (#1483).
  "anthem-of-disruption": define("anthem-of-disruption", "Anthem of Disruption", "chant", {
    profession: "paragon",
    nextAttackSkill: [{ kind: "interrupt" }],
  }),
  // "For 10 seconds, the next skill used by each ally within earshot
  // cannot be interrupted" (#1505).
  "song-of-concentration": define("song-of-concentration", "Song of Concentration", "chant", {
    profession: "paragon",
    nextSkillRule: {
      which: "any",
      uninterruptible: true,
      unblockable: false,
      energyDiscount: 0,
      skillId: "paragon.song-of-concentration",
    },
  }),
  // "...the next attack skill used by each party member within earshot
  // cannot be blocked" (#1505).
  "anthem-of-guidance": define("anthem-of-guidance", "Anthem of Guidance", "chant", {
    profession: "paragon",
    nextSkillRule: {
      which: "attack-skill",
      uninterruptible: false,
      unblockable: true,
      energyDiscount: 0,
      skillId: "paragon.anthem-of-guidance",
    },
  }),
  // "...the next shout or chant used by each ally within earshot costs
  // 3...7 less Energy" (#1505): 6 at rank 12.
  "energizing-chorus": define("energizing-chorus", "Energizing Chorus", "chant", {
    profession: "paragon",
    nextSkillRule: {
      which: "shout-or-chant",
      uninterruptible: false,
      unblockable: false,
      energyDiscount: 6,
      skillId: "paragon.energizing-chorus",
    },
  }),
  // "...the next attack skill used by each ally within earshot deals
  // +10...20 damage against foes with more than 50% Health" (#1505, PvP):
  // 18 at rank 12.
  "anthem-of-envy": define("anthem-of-envy", "Anthem of Envy", "chant", {
    profession: "paragon",
    nextAttackSkillBonus: {
      condition: { kind: "target-health-above", fraction: 0.5 },
      amount: { flat: 18 },
    },
  }),
  // "+2...4...4 Health regeneration and a 50% chance to block. Weapon of
  // Warding ends if that ally attacks."
  "weapon-of-warding": define("weapon-of-warding", "Weapon of Warding", "weapon-spell", {
    profession: "ritualist",
    healthPips: 4,
    block: { chance: 0.5, against: "all" },
    endsWhenBearerAttacks: true,
  }),
  // "Target ally gains 5...21...25 Health per second and an additional
  // 5...21...25 Health per second if that ally is within earshot of a
  // Spirit" (#1064): any team's spirit.
  "spirit-light-weapon": define("spirit-light-weapon", "Spirit Light Weapon", "weapon-spell", {
    profession: "ritualist",
    healthPerSecond: 21,
    healthPerSecondNearSpirit: 21,
  }),
  // "Spells and Binding Rituals recharge 33% faster" (#1064).
  "weapon-of-quickening": define("weapon-of-quickening", "Weapon of Quickening", "weapon-spell", {
    profession: "ritualist",
    spellRechargeFaster: 0.33,
    bindingRitualRechargeFaster: 0.33,
  }),
  // "You attack 25% faster": Heart of Fury's speed-up, as a weapon spell.
  "weapon-of-aggression": define("weapon-of-aggression", "Weapon of Aggression", "weapon-spell", {
    profession: "ritualist",
    attackDurationMultiplier: 0.75,
  }),
  // "For 8 seconds, the next time target ally takes damage or life steal
  // from a foe, that ally steals up to 20...68...80 health from that foe
  // and loses 2 conditions" (#1022): 68, its rank-12 value, as for every
  // trigger (#935).
  "weapon-of-remedy": define("weapon-of-remedy", "Weapon of Remedy", "weapon-spell", {
    profession: "ritualist",
    triggers: [
      {
        on: "bearer-takes-damage-from-foe",
        target: "offender",
        effects: [
          { kind: "life-steal", amount: { flat: 68 } },
          { kind: "remove-status", category: "condition", count: 2, from: "caster" },
        ],
        skillId: "ritualist.weapon-of-remedy",
      },
    ],
    endsWhenTriggered: true,
  }),
  // "For 8 seconds, the next time target ally takes damage or life steal
  // from a foe, that ally steals up to 15...51...60 Health from that foe"
  // (#1022): 51.
  "vengeful-weapon": define("vengeful-weapon", "Vengeful Weapon", "weapon-spell", {
    profession: "ritualist",
    triggers: [
      {
        on: "bearer-takes-damage-from-foe",
        target: "offender",
        effects: [{ kind: "life-steal", amount: { flat: 51 } }],
        skillId: "ritualist.vengeful-weapon",
      },
    ],
    endsWhenTriggered: true,
  }),
  // "For 20 seconds, target ally's next 1...4...5 attacks deal 5...25...30
  // damage to up to 4 adjacent foes" (#1022): 4 and 25, its rank-12
  // values. Adjacent to the foe hit, that foe excluded, as Sand Shards
  // (#939). GW1's is armor-ignoring physical; typeless ignores armor here.
  "splinter-weapon": define("splinter-weapon", "Splinter Weapon", "weapon-spell", {
    profession: "ritualist",
    onAttackHit: {
      effects: [
        {
          kind: "splash",
          hits: "foes",
          radius: AREA_ADJACENT,
          maxTargets: undefined,
          effects: [
            { kind: "damage", amount: { flat: 25 }, type: "typeless", armorPenetration: 0 },
          ],
        },
      ],
      skillId: "ritualist.splinter-weapon",
    },
    endsAfterHits: { count: 4, weapon: undefined },
  }),

  // "For 5...17...20 seconds, you have 1...3...4 Health regeneration for
  // each Enchantment (maximum of 3) on you."
  "mystic-regeneration": define("mystic-regeneration", "Mystic Regeneration", "enchantment", {
    profession: "dervish",
    healthPipsPerEnchantment: { pips: 3, max: 3 },
  }),
  // "You cannot be knocked down and move 25% faster. This enchantment
  // ends prematurely if it prevents a knockdown."
  "fleeting-stability": define("fleeting-stability", "Fleeting Stability", "enchantment", {
    profession: "dervish",
    moveSpeedMultiplier: 1.25,
    preventsKnockdown: true,
    endsOnKnockdownPrevented: true,
  }),
  // "You attack 25% faster": GW1 counts faster as 1 − x (ADR-0029).
  "heart-of-fury": define("heart-of-fury", "Heart of Fury", "stance", {
    profession: "dervish",
    attackDurationMultiplier: 0.75,
  }),
  // "For 15 seconds, whenever you attack a foe with your scythe, you deal
  // 10...22...25 slashing damage to all adjacent foes": 22, its rank-12
  // value. Hit, miss or block: an attack. Its own Dervish is the splash's
  // centre, so the foe it attacks is among them (#939).
  "vow-of-strength": define("vow-of-strength", "Vow of Strength", "enchantment", {
    profession: "dervish",
    triggers: [
      {
        on: "bearer-attacks",
        target: "bearer",
        effects: [
          {
            kind: "if",
            condition: { kind: "caster-wields", weapon: "scythe" },
            effects: [
              {
                kind: "splash",
                hits: "foes",
                radius: AREA_ADJACENT,
                maxTargets: undefined,
                effects: [
                  { kind: "damage", amount: { flat: 22 }, type: "slashing", armorPenetration: 0 },
                ],
              },
            ],
          },
        ],
        skillId: "dervish.vow-of-strength",
      },
    ],
  }),
  // "For 30 seconds, the next 1...4...5 times you hit with a scythe, all
  // other adjacent foes take 10...50...60 earth damage": 4 and 50, its
  // rank-12 values. Adjacent to the foe hit, not to the Dervish: at melee
  // reach the two barely differ (#939).
  "sand-shards": define("sand-shards", "Sand Shards", "enchantment", {
    profession: "dervish",
    onAttackHit: {
      effects: [
        {
          kind: "if",
          condition: { kind: "caster-wields", weapon: "scythe" },
          effects: [
            {
              kind: "splash",
              hits: "foes",
              radius: AREA_ADJACENT,
              maxTargets: undefined,
              effects: [
                { kind: "damage", amount: { flat: 50 }, type: "earth", armorPenetration: 0 },
              ],
            },
          ],
        },
      ],
      skillId: "dervish.sand-shards",
    },
    endsAfterHits: { count: 4, weapon: "scythe" },
  }),
  // "...for 1...6...7 [seconds] you move 25% faster. If an enchantment was
  // removed, you run 50% faster instead" (#939): two stances, so the
  // faster replaces the slower as it lands.
  "pious-haste": define("pious-haste", "Pious Haste", "stance", {
    profession: "dervish",
    moveSpeedMultiplier: 1.25,
  }),
  "pious-haste-run": define("pious-haste-run", "Pious Haste (run)", "stance", {
    profession: "dervish",
    moveSpeedMultiplier: 1.5,
  }),
  // "For 30 seconds, your attacks deal earth damage. When this enchantment
  // ends, all nearby foes have Cracked Armor for 1...8...10 seconds" (#1021):
  // 8 s, its rank-12 value. Any end counts: expiry, a strip, a death.
  "staggering-force": define("staggering-force", "Staggering Force", "enchantment", {
    profession: "dervish",
    attackDamageType: "earth",
    triggers: [
      {
        on: "ends",
        target: "bearer",
        effects: [
          {
            kind: "splash",
            hits: "foes",
            radius: AREA_NEARBY,
            maxTargets: undefined,
            effects: [{ kind: "apply-status", statusId: "cracked-armor", durationSeconds: 8 }],
          },
        ],
        skillId: "dervish.staggering-force",
      },
    ],
  }),
  // "For 30 seconds, your attacks deal earth damage. When this Enchantment
  // ends, all nearby foes are Blinded for 1...3...4 seconds" (#1021): 3 s.
  "dust-cloak": define("dust-cloak", "Dust Cloak", "enchantment", {
    profession: "dervish",
    attackDamageType: "earth",
    triggers: [
      {
        on: "ends",
        target: "bearer",
        effects: [
          {
            kind: "splash",
            hits: "foes",
            radius: AREA_NEARBY,
            maxTargets: undefined,
            effects: [{ kind: "apply-status", statusId: "blind", durationSeconds: 3 }],
          },
        ],
        skillId: "dervish.dust-cloak",
      },
    ],
  }),
  // "For 30 seconds, this enchantment does nothing. When this enchantment
  // ends, all nearby foes are Crippled for 3...7...8 seconds" (#1021): 7 s.
  // Until then it counts as a Dervish enchantment, nothing more.
  "aura-of-thorns": define("aura-of-thorns", "Aura of Thorns", "enchantment", {
    profession: "dervish",
    triggers: [
      {
        on: "ends",
        target: "bearer",
        effects: [
          {
            kind: "splash",
            hits: "foes",
            radius: AREA_NEARBY,
            maxTargets: undefined,
            effects: [{ kind: "apply-status", statusId: "crippled", durationSeconds: 7 }],
          },
        ],
        skillId: "dervish.aura-of-thorns",
      },
    ],
  }),
  // "For 7 seconds, you move 25% faster. If this enchantment ends
  // prematurely, you lose 1 conditions" (#1421): stripped, or cut short
  // any other way, but not run out.
  "enchanted-haste": define("enchanted-haste", "Enchanted Haste", "enchantment", {
    profession: "dervish",
    moveSpeedMultiplier: 1.25,
    triggers: [
      {
        on: "ends-early",
        target: "bearer",
        effects: [{ kind: "remove-status", category: "condition", count: 1 }],
        skillId: "dervish.enchanted-haste",
      },
    ],
  }),
  // "For 30 seconds afterward, your attacks deal holy damage. When this
  // enchantment ends, all nearby foes are set on fire for 2...5 seconds"
  // (#1421): 4 s, its rank-12 value. Dust Cloak's pattern.
  "heart-of-holy-flame": define("heart-of-holy-flame", "Heart of Holy Flame", "enchantment", {
    profession: "dervish",
    attackDamageType: "holy",
    triggers: [
      {
        on: "ends",
        target: "bearer",
        effects: [
          {
            kind: "splash",
            hits: "foes",
            radius: AREA_NEARBY,
            maxTargets: undefined,
            effects: [{ kind: "apply-status", statusId: "burning", durationSeconds: 4 }],
          },
        ],
        skillId: "dervish.heart-of-holy-flame",
      },
    ],
  }),
  // "For 20 seconds afterward, this enchantment does nothing. When this
  // enchantment ends, you gain 1...2 strikes of adrenaline if any foes are
  // within earshot" (#1421): 2, its rank-12 value. A splash that reaches
  // one foe is the "if any": the gain is the caster's, once.
  "balthazars-rage": define("balthazars-rage", "Balthazar's Rage", "enchantment", {
    profession: "dervish",
    triggers: [
      {
        on: "ends",
        target: "bearer",
        effects: [
          {
            kind: "splash",
            hits: "foes",
            radius: AREA_EARSHOT,
            maxTargets: 1,
            effects: [{ kind: "adrenaline-gain", strikes: 2 }],
          },
        ],
        skillId: "dervish.balthazars-rage",
      },
    ],
  }),
  // "You move 25% faster and deal +3...12 more damage against moving foes"
  // (#1421): 10, its rank-12 value, on each hit that lands on a foe moving,
  // as a second packet beside the blow's, slashing as a scythe's.
  "harriers-haste": define("harriers-haste", "Harrier's Haste", "enchantment", {
    profession: "dervish",
    moveSpeedMultiplier: 1.25,
    onAttackHit: {
      effects: [
        {
          kind: "if",
          condition: { kind: "target-moving" },
          effects: [
            { kind: "damage", amount: { flat: 10 }, type: "slashing", armorPenetration: 0 },
          ],
        },
      ],
      skillId: "dervish.harriers-haste",
    },
  }),
  // PvP "Never Surrender!" at rank 12: +4 Health regeneration (#923).
  "never-surrender": define("never-surrender", "Never Surrender!", "shout", {
    profession: "paragon",
    healthPips: 4,
  }),

  // Mesmer Illusion Magic (#1228), each at its rank-12 values.
  // "...target foe experiences -5 Health degeneration."
  "conjure-phantasm": define("conjure-phantasm", "Conjure Phantasm", "hex", {
    profession: "mesmer",
    healthPips: -5,
  }),
  // "...target foe moves 50% slower": Crippled's slow, as a hex.
  "imagined-burden": define("imagined-burden", "Imagined Burden", "hex", {
    profession: "mesmer",
    moveSpeedMultiplier: 0.5,
  }),
  // "For 10 seconds, target foe suffers -1...3...4 Health degeneration.
  // When Phantom Pain ends, that foe suffers a Deep Wound ... for
  // 5...17...20 seconds." Any end, a strip included.
  "phantom-pain": define("phantom-pain", "Phantom Pain", "hex", {
    profession: "mesmer",
    healthPips: -3,
    triggers: [
      {
        on: "ends",
        target: "bearer",
        effects: [{ kind: "apply-status", statusId: "deep-wound", durationSeconds: 17 }],
        skillId: "mesmer.phantom-pain",
      },
    ],
  }),
  // "For 10 seconds, target foe suffers from -1...3...4 Health
  // degeneration. When this hex ends, that foe has Cracked Armor for
  // 5...17...20 seconds." Any end, a strip included.
  "shrinking-armor": define("shrinking-armor", "Shrinking Armor", "hex", {
    profession: "mesmer",
    healthPips: -3,
    triggers: [
      {
        on: "ends",
        target: "bearer",
        effects: [{ kind: "apply-status", statusId: "cracked-armor", durationSeconds: 17 }],
        skillId: "mesmer.shrinking-armor",
      },
    ],
  }),
  // "...you move 33% faster. When Illusion of Haste ends, you become
  // Crippled for 3 seconds" (PvP). Any end, a strip included.
  "illusion-of-haste": define("illusion-of-haste", "Illusion of Haste", "enchantment", {
    profession: "mesmer",
    moveSpeedMultiplier: 1.33,
    triggers: [
      {
        on: "ends",
        target: "bearer",
        effects: [{ kind: "apply-status", statusId: "crippled", durationSeconds: 3 }],
        skillId: "mesmer.illusion-of-haste",
      },
    ],
  }),
  // "For 4 seconds, the next time the target foe or any adjacent foe
  // attacks, they take 30...114...135 damage and are Blinded for 10
  // seconds": each foe it lands on bears its own, fired once by its own
  // attack. The damage is its caster's Illusion Magic, as the trigger's
  // caster is the hex's source.
  ineptitude: define("ineptitude", "Ineptitude", "hex", {
    profession: "mesmer",
    triggers: [
      {
        on: "bearer-attacks",
        target: "bearer",
        effects: [
          {
            kind: "damage",
            amount: {
              scaling: { attributeId: "mesmer.illusion-magic", atZero: 30, atTwelve: 114 },
            },
            type: "typeless",
            armorPenetration: 0,
          },
          { kind: "apply-status", statusId: "blind", durationSeconds: 10 },
        ],
        skillId: "mesmer.ineptitude",
      },
    ],
    endsWhenTriggered: true,
  }),
  // "...target moves 50% slower and suffers -2...5...6 Health
  // degeneration" (PvP).
  "crippling-anguish": define("crippling-anguish", "Crippling Anguish", "hex", {
    profession: "mesmer",
    moveSpeedMultiplier: 0.5,
    healthPips: -5,
  }),

  // Assassin Deadly Arts (#1234), each at its rank-12 values.
  // "For 1...6 seconds, target touched foe cannot cast spells."
  "shroud-of-silence": define("shroud-of-silence", "Shroud of Silence", "hex", {
    profession: "assassin",
    preventsSpells: true,
  }),
  // "For 1...11 seconds, target foe cannot block your attacks."
  "expose-defenses": define("expose-defenses", "Expose Defenses", "hex", {
    profession: "assassin",
    unblockableBySource: true,
  }),
  // "For 5 seconds, target foe suffers -1...5 Health degeneration. If that
  // foe is moving when Enduring Toxin would end, Enduring Toxin is renewed
  // for another 5 seconds."
  "enduring-toxin": define("enduring-toxin", "Enduring Toxin", "hex", {
    profession: "assassin",
    healthPips: -4,
    renewsWhileMoving: 5,
  }),
  // "For 4...10 seconds, target foe gains 50% less benefit from healing."
  "mark-of-death": define("mark-of-death", "Mark of Death", "hex", {
    profession: "assassin",
    healingMultiplier: 0.5,
  }),
  // "...take 8...18...20 damage whenever hit by a spirit's attack" (#1270):
  // 18, its rank-12 value.
  "painful-bond": define("painful-bond", "Painful Bond", "hex", {
    profession: "ritualist",
    damageFromSpiritAttacks: 18,
  }),
  // "...suffer -0...2...3 Health degeneration" (#1270): 2, its rank-12 value.
  lamentation: define("lamentation", "Lamentation", "hex", {
    profession: "ritualist",
    healthPips: -2,
  }),
  // "...takes 4...16 more damage when hit by physical damage" (#1332): 14,
  // its rank-12 value.
  barbs: define("barbs", "Barbs", "hex", {
    profession: "necromancer",
    physicalDamageTakenBonus: 14,
  }),
  // "...has a 25% chance to miss with attacks and takes 1...46 damage
  // whenever that foe fails to hit in combat" (#1332): 37, its rank-12
  // value.
  "price-of-failure": define("price-of-failure", "Price of Failure", "hex", {
    profession: "necromancer",
    attackMissChance: 0.25,
    triggers: [
      {
        on: "bearer-fails-to-hit",
        effects: [{ kind: "damage", amount: { flat: 37 }, type: "typeless", armorPenetration: 0 }],
        target: "bearer",
        skillId: "necromancer.price-of-failure",
      },
    ],
  }),
  // "...suffer -0...3 Health degeneration" (#1332): 2, its rank-12 value.
  suffering: define("suffering", "Suffering", "hex", {
    profession: "necromancer",
    healthPips: -2,
  }),
  // "...gains only two-thirds Health from healing" (#1332).
  "defile-flesh": define("defile-flesh", "Defile Flesh", "hex", {
    profession: "necromancer",
    healingMultiplier: 2 / 3,
  }),
  // "...cannot block" (#1332).
  "rigor-mortis": define("rigor-mortis", "Rigor Mortis", "hex", {
    profession: "necromancer",
    preventsBlocking: true,
  }),
  // "...suffer -1...4 Health degeneration, and receive 25% less benefit
  // from healing" (#1332): 3, its rank-12 value.
  "lingering-curse": define("lingering-curse", "Lingering Curse", "hex", {
    profession: "necromancer",
    healthPips: -3,
    healingMultiplier: 0.75,
  }),
  // "Whenever you create a creature, you gain 5...50 Health and 1...6
  // Energy" (#1316): scaled by the Ritualist's own Spawning Power.
  "boon-of-creation": define("boon-of-creation", "Boon of Creation", "enchantment", {
    profession: "ritualist",
    triggers: [
      {
        on: "bearer-creates-creature",
        target: "bearer",
        effects: [
          {
            kind: "heal",
            amount: {
              scaling: { attributeId: "ritualist.spawning-power", atZero: 5, atTwelve: 41 },
            },
            perStatusOnTarget: [],
          },
          {
            kind: "energy-gain",
            amount: {
              scaling: { attributeId: "ritualist.spawning-power", atZero: 1, atTwelve: 5 },
            },
          },
        ],
        skillId: "ritualist.boon-of-creation",
      },
    ],
  }),
  // "Whenever you create a creature, up to 5 foes near that creature are
  // struck for 20...65 lightning damage" (#1316).
  "explosive-growth": define("explosive-growth", "Explosive Growth", "enchantment", {
    profession: "ritualist",
    triggers: [
      {
        on: "bearer-creates-creature",
        target: "created",
        effects: [
          {
            kind: "splash",
            hits: "foes",
            radius: AREA_NEARBY,
            maxTargets: 5,
            effects: [
              {
                kind: "damage",
                amount: {
                  scaling: { attributeId: "ritualist.spawning-power", atZero: 20, atTwelve: 56 },
                },
                type: "lightning",
                armorPenetration: 0,
              },
            ],
          },
        ],
        skillId: "ritualist.explosive-growth",
      },
    ],
  }),
  // "Whenever you create a creature, all allies near that creature gain
  // 5...50 Health and lose 1 condition" (#1316).
  "spirits-gift": define("spirits-gift", "Spirit's Gift", "enchantment", {
    profession: "ritualist",
    triggers: [
      {
        on: "bearer-creates-creature",
        target: "created",
        effects: [
          {
            kind: "splash",
            hits: "allies",
            radius: AREA_NEARBY,
            maxTargets: undefined,
            effects: [
              {
                kind: "heal",
                amount: {
                  scaling: { attributeId: "ritualist.spawning-power", atZero: 5, atTwelve: 41 },
                },
                perStatusOnTarget: [],
              },
              { kind: "remove-status", category: "condition", count: 1 },
            ],
          },
        ],
        skillId: "ritualist.spirits-gift",
      },
    ],
  }),
  // "...takes 15...30 damage when an enchantment or hex is cast on that
  // target" (#1403): 27, its rank-12 value. A renewal counts (GW1 wiki).
  "soul-barbs": define("soul-barbs", "Soul Barbs", "hex", {
    profession: "necromancer",
    triggers: [
      {
        on: "bearer-gains-hex-or-enchantment",
        effects: [{ kind: "damage", amount: { flat: 27 }, type: "typeless", armorPenetration: 0 }],
        target: "bearer",
        skillId: "necromancer.soul-barbs",
      },
    ],
  }),
  // "...the next time target foe blocks, that foe takes 30...120 damage"
  // (#1403): 102, its rank-12 value. Any block, by any status.
  "defile-defenses": define("defile-defenses", "Defile Defenses", "hex", {
    profession: "necromancer",
    triggers: [
      {
        on: "bearer-blocks",
        effects: [{ kind: "damage", amount: { flat: 102 }, type: "typeless", armorPenetration: 0 }],
        target: "bearer",
        skillId: "necromancer.defile-defenses",
      },
    ],
    endsWhenTriggered: true,
  }),
  // "...each time target foe is the target of an enchantment, the caster of
  // that enchantment takes 15...75 damage" (#1403): 63, its rank-12 value.
  "scourge-enchantment": define("scourge-enchantment", "Scourge Enchantment", "hex", {
    profession: "monk",
    triggers: [
      {
        on: "bearer-gains-enchantment",
        effects: [{ kind: "damage", amount: { flat: 63 }, type: "holy", armorPenetration: 0 }],
        target: "gained-source",
        skillId: "monk.scourge-enchantment",
      },
    ],
  }),
  // "...the next time you are the target of a hex, that hex fails and the
  // caster takes 10...46 damage" (#1403): 39, its rank-12 value.
  "hex-breaker": define("hex-breaker", "Hex Breaker", "stance", {
    profession: "mesmer",
    breaksNextHex: { damage: 39, skillId: "mesmer.hex-breaker" },
  }),

  // Paragon echoes (#1423): each renews, or fires, whenever a chant or a
  // shout ends on its bearer; no removal touches one. Rank-12 values, and
  // a finale's effects scale with its Paragon's attribute.
  "aggressive-refrain": define("aggressive-refrain", "Aggressive Refrain", "echo", {
    profession: "paragon",
    attackDurationMultiplier: 0.8,
    armorModifier: -20,
    renewsOnChantOrShoutEnd: true,
  }),
  "blazing-finale": define("blazing-finale", "Blazing Finale", "echo", {
    profession: "paragon",
    triggers: [
      {
        on: "bearer-chant-or-shout-ends",
        effects: [
          {
            kind: "splash",
            hits: "foes",
            radius: AREA_ADJACENT,
            maxTargets: undefined,
            effects: [{ kind: "apply-status", statusId: "burning", durationSeconds: 4 }],
          },
        ],
        target: "bearer",
        skillId: "paragon.blazing-finale",
      },
    ],
  }),
  "burning-refrain": define("burning-refrain", "Burning Refrain", "echo", {
    profession: "paragon",
    onAttackHit: {
      effects: [
        {
          kind: "if",
          condition: { kind: "target-more-health" },
          effects: [{ kind: "apply-status", statusId: "burning", durationSeconds: 3 }],
        },
      ],
      skillId: "paragon.burning-refrain",
    },
    renewsOnChantOrShoutEnd: true,
  }),
  "enduring-harmony": define("enduring-harmony", "Enduring Harmony", "echo", {
    profession: "paragon",
    chantShoutDurationMultiplier: 1.5,
  }),
  // A heal, not a gain, as GWW has it: Deep Wound cuts it.
  "finale-of-restoration": define("finale-of-restoration", "Finale of Restoration", "echo", {
    profession: "paragon",
    endsAfterTriggers: 5,
    triggers: [
      {
        on: "bearer-chant-or-shout-ends",
        effects: [
          {
            kind: "heal",
            amount: { scaling: { attributeId: "paragon.motivation", atZero: 15, atTwelve: 63 } },
            perStatusOnTarget: [],
          },
        ],
        target: "bearer",
        skillId: "paragon.finale-of-restoration",
      },
    ],
  }),
  "hasty-refrain": define("hasty-refrain", "Hasty Refrain", "echo", {
    profession: "paragon",
    moveSpeedMultiplier: 1.25,
    renewsOnChantOrShoutEnd: true,
  }),
  "mending-refrain": define("mending-refrain", "Mending Refrain", "echo", {
    profession: "paragon",
    healthPips: 3,
    renewsOnChantOrShoutEnd: true,
  }),
  "purifying-finale": define("purifying-finale", "Purifying Finale", "echo", {
    profession: "paragon",
    triggers: [
      {
        on: "bearer-chant-or-shout-ends",
        effects: [{ kind: "remove-status", category: "condition", count: 1 }],
        target: "bearer",
        skillId: "paragon.purifying-finale",
      },
    ],
  }),
  // Paragon echoes 2 (#1485), at their rank-12 values.
  // "...+10...40 armor against slashing damage" (PvP): 34.
  "bladeturn-refrain": define("bladeturn-refrain", "Bladeturn Refrain", "echo", {
    profession: "paragon",
    conditionalArmor: [{ amount: 34, conditions: [{ kind: "vs-type", type: "slashing" }] }],
    renewsOnChantOrShoutEnd: true,
  }),
  // "...whenever a shout or chant ends on target non-spirit ally, that
  // ally gains 1...2 Energy": 2.
  "energizing-finale": define("energizing-finale", "Energizing Finale", "echo", {
    profession: "paragon",
    triggers: [
      {
        on: "bearer-chant-or-shout-ends",
        effects: [{ kind: "energy-gain", amount: { flat: 2 }, toTarget: true }],
        target: "bearer",
        skillId: "paragon.energizing-finale",
      },
    ],
  }),
  // "...if you are under the effects of a chant or a shout, you attack 33%
  // faster and gain 33% more adrenaline, but you have -20 armor": the
  // armor always.
  "soldiers-fury": define("soldiers-fury", "Soldier's Fury", "echo", {
    profession: "paragon",
    armorModifier: -20,
    whileUnder: {
      categories: ["shout", "chant"],
      attackDurationMultiplier: 0.67,
      adrenalineGainFaster: 0.33,
    },
  }),
  // "For 8...20 seconds, target foe's legs are encased in ice, causing the
  // foe to move 66% slower" (#1367).
  "ice-prison": define("ice-prison", "Ice Prison", "hex", {
    profession: "elementalist",
    moveSpeedMultiplier: 0.34,
  }),
  // "...and move 66% slower for 3...8 seconds" (#1367).
  "frozen-burst": define("frozen-burst", "Frozen Burst", "hex", {
    profession: "elementalist",
    moveSpeedMultiplier: 0.34,
  }),
  // "If you are Overcast, you gain +1...4 Health regeneration for 5
  // seconds" (#1367): 3, its rank-12 value. Nothing GW1 removes: Ice Spear
  // is an enchantment by label only.
  "ice-spear": define("ice-spear", "Ice Spear", "skill-effect", {
    profession: "elementalist",
    healthPips: 3,
  }),
  // "While hexed, those foes have a 50% chance to miss with attacks" (#1367).
  "blurred-vision": define("blurred-vision", "Blurred Vision", "hex", {
    profession: "elementalist",
    attackMissChance: 0.5,
  }),
  // "...you gain +10...40 armor and move 33% faster" (#1367): +34, its
  // rank-12 value.
  "armor-of-mist": define("armor-of-mist", "Armor of Mist", "enchantment", {
    profession: "elementalist",
    armorModifier: 34,
    moveSpeedMultiplier: 1.33,
  }),
  // "...moves 66% slower, and is hexed with Shatterstone for 3 seconds.
  // When Shatterstone ends, that foe and all nearby foes are struck for
  // 25...100 cold damage" (#1367): 85, its rank-12 value, by its caster.
  // Any end, a removal included: GW1 says "ends". The splash leaves the
  // bearer out, so it is struck once.
  shatterstone: define("shatterstone", "Shatterstone", "hex", {
    profession: "elementalist",
    moveSpeedMultiplier: 0.34,
    triggers: [
      {
        on: "ends",
        effects: [
          { kind: "damage", amount: { flat: 85 }, type: "cold", armorPenetration: 0 },
          {
            kind: "splash",
            hits: "foes",
            radius: AREA_NEARBY,
            maxTargets: undefined,
            effects: [{ kind: "damage", amount: { flat: 85 }, type: "cold", armorPenetration: 0 }],
          },
        ],
        target: "bearer",
        skillId: "elementalist.shatterstone",
      },
    ],
  }),
  // "...and moves 90% slower for 1...5 seconds" (#1367).
  "mind-freeze": define("mind-freeze", "Mind Freeze", "hex", {
    profession: "elementalist",
    moveSpeedMultiplier: 0.1,
  }),

  // Ritualist item spells (#1434): a bonus while the ashes are held, and a
  // drop effect, their `ends` trigger, wherever the holder is when they
  // fall. Rank-12 values, by their Ritualist.
  // "...you gain 20 armor. When you drop his ashes, all party members are
  // healed for 20...95 Health": 80.
  "protective-was-kaolai": define("protective-was-kaolai", "Protective Was Kaolai", "item", {
    profession: "ritualist",
    armorModifier: 20,
    triggers: [
      {
        on: "ends",
        effects: [
          { kind: "heal", amount: { flat: 80 }, perStatusOnTarget: [] },
          {
            kind: "splash",
            hits: "party",
            radius: Number.POSITIVE_INFINITY,
            maxTargets: undefined,
            effects: [{ kind: "heal", amount: { flat: 80 }, perStatusOnTarget: [] }],
          },
        ],
        target: "bearer",
        skillId: "ritualist.protective-was-kaolai",
      },
    ],
  }),
  // "...gain +50...140 maximum Health. When you drop his ashes, you gain
  // 100...280 Health": 122 and 244. Health above the maximum left goes
  // with the bonus, before the drop heals.
  "generous-was-tsungrai": define("generous-was-tsungrai", "Generous Was Tsungrai", "item", {
    profession: "ritualist",
    maxHealthBonus: 122,
    triggers: [
      {
        on: "ends",
        effects: [{ kind: "heal", amount: { flat: 244 }, perStatusOnTarget: [] }],
        target: "bearer",
        skillId: "ritualist.generous-was-tsungrai",
      },
    ],
  }),
  // "...you cannot lose more than 20% of your max Health from a single
  // hit. When you drop her ashes, you steal 5...50 Health from all nearby
  // foes": 41.
  "defiant-was-xinrae": define("defiant-was-xinrae", "Defiant Was Xinrae", "item", {
    profession: "ritualist",
    maxDamageFractionPerHit: 0.2,
    triggers: [
      {
        on: "ends",
        effects: [
          {
            kind: "splash",
            hits: "foes",
            radius: AREA_NEARBY,
            maxTargets: undefined,
            effects: [{ kind: "life-steal", amount: { flat: 41 } }],
          },
        ],
        target: "bearer",
        skillId: "ritualist.defiant-was-xinrae",
      },
    ],
  }),
  // "When you drop his ashes, all nearby foes are Blinded for 3...8
  // seconds": 7. Nothing while held.
  "blind-was-mingson": define("blind-was-mingson", "Blind Was Mingson", "item", {
    profession: "ritualist",
    triggers: [
      {
        on: "ends",
        effects: [
          {
            kind: "splash",
            hits: "foes",
            radius: AREA_NEARBY,
            maxTargets: undefined,
            effects: [{ kind: "apply-status", statusId: "blind", durationSeconds: 7 }],
          },
        ],
        target: "bearer",
        skillId: "ritualist.blind-was-mingson",
      },
    ],
  }),
  // "When you drop his ashes, all foes in the area are struck for 15...75
  // damage and knocked down": 63, typeless. Nothing while held.
  "grasping-was-kuurong": define("grasping-was-kuurong", "Grasping Was Kuurong", "item", {
    profession: "ritualist",
    triggers: [
      {
        on: "ends",
        effects: [
          {
            kind: "splash",
            hits: "foes",
            radius: AREA_IN_THE_AREA,
            maxTargets: undefined,
            effects: [
              { kind: "damage", amount: { flat: 63 }, type: "typeless", armorPenetration: 0 },
              { kind: "knockdown", durationSeconds: KNOCKDOWN_SECONDS },
            ],
          },
        ],
        target: "bearer",
        skillId: "ritualist.grasping-was-kuurong",
      },
    ],
  }),
  // "...you gain +2 Energy regeneration. When you drop her ashes, you gain
  // +1...10 Energy": 8.
  "energetic-was-lee-sa": define("energetic-was-lee-sa", "Energetic Was Lee Sa", "item", {
    profession: "ritualist",
    energyPips: 2,
    triggers: [
      {
        on: "ends",
        effects: [{ kind: "energy-gain", amount: { flat: 8 } }],
        target: "bearer",
        skillId: "ritualist.energetic-was-lee-sa",
      },
    ],
  }),
  // Ritualist item spells 2 (#1464), rank-12 values as #1434's.
  // "...you gain +15 armor and +30 maximum Energy." Nothing on the drop.
  "mighty-was-vorizun": define("mighty-was-vorizun", "Mighty Was Vorizun", "item", {
    profession: "ritualist",
    armorModifier: 15,
    maxEnergyBonus: 30,
  }),
  // "...all Ritualist skills have 10% armor penetration. When you drop his
  // ashes, all nearby foes are struck for 15...85 lightning damage": 71,
  // without the spell's 25%, as the text names none.
  "cruel-was-daoshen": define("cruel-was-daoshen", "Cruel Was Daoshen", "item", {
    profession: "ritualist",
    skillArmorPenetration: { share: 0.1, profession: "ritualist" },
    triggers: [
      {
        on: "ends",
        effects: [
          {
            kind: "splash",
            hits: "foes",
            radius: AREA_NEARBY,
            maxTargets: undefined,
            effects: [
              { kind: "damage", amount: { flat: 71 }, type: "lightning", armorPenetration: 0 },
            ],
          },
        ],
        target: "bearer",
        skillId: "ritualist.cruel-was-daoshen",
      },
    ],
  }),
  // As Cruel Was Daoshen (PvP), but all foes in the area: 71.
  "destructive-was-glaive": define("destructive-was-glaive", "Destructive Was Glaive", "item", {
    profession: "ritualist",
    skillArmorPenetration: { share: 0.1, profession: "ritualist" },
    triggers: [
      {
        on: "ends",
        effects: [
          {
            kind: "splash",
            hits: "foes",
            radius: AREA_IN_THE_AREA,
            maxTargets: undefined,
            effects: [
              { kind: "damage", amount: { flat: 71 }, type: "lightning", armorPenetration: 0 },
            ],
          },
        ],
        target: "bearer",
        skillId: "ritualist.destructive-was-glaive",
      },
    ],
  }),
  // "...you have +10...25 armor and cannot be interrupted": 22.
  "tranquil-was-tanasen": define("tranquil-was-tanasen", "Tranquil Was Tanasen", "item", {
    profession: "ritualist",
    armorModifier: 22,
    uninterruptible: true,
  }),
  // "Whenever a foe strikes you in combat... you steal 10...45 Health from
  // that foe": 38.
  "vengeful-was-khanhei": define("vengeful-was-khanhei", "Vengeful Was Khanhei", "item", {
    profession: "ritualist",
    triggers: [
      {
        on: "bearer-hit-by-attack",
        target: "offender",
        effects: [{ kind: "life-steal", amount: { flat: 38 } }],
        skillId: "ritualist.vengeful-was-khanhei",
      },
    ],
  }),
  // "...conditions on you expire 10...50% faster. When you drop her ashes,
  // all allies within earshot lose 1...4 conditions": 42% and 3.
  "pure-was-li-ming": define("pure-was-li-ming", "Pure Was Li Ming", "item", {
    profession: "ritualist",
    conditionsExpireFaster: 0.42,
    triggers: [
      {
        on: "ends",
        effects: [
          { kind: "remove-status", category: "condition", count: 3 },
          {
            kind: "splash",
            hits: "allies",
            radius: AREA_EARSHOT,
            maxTargets: undefined,
            effects: [{ kind: "remove-status", category: "condition", count: 3 }],
          },
        ],
        target: "bearer",
        skillId: "ritualist.pure-was-li-ming",
      },
    ],
  }),
  // "You have +100 Health, +30 elemental armor, and your attacks deal earth
  // damage. Whenever you lose a Dervish enchantment you lose 2 conditions"
  // (#1437, PvP).
  "avatar-of-melandru": define("avatar-of-melandru", "Avatar of Melandru", "form", {
    profession: "dervish",
    maxHealthBonus: 100,
    conditionalArmor: [{ amount: 30, conditions: [{ kind: "vs-elemental" }] }],
    attackDamageType: "earth",
    triggers: [
      {
        on: "bearer-loses-enchantment",
        profession: "dervish",
        target: "bearer",
        effects: [{ kind: "remove-status", category: "condition", count: 2 }],
        skillId: "dervish.avatar-of-melandru",
      },
    ],
  }),
  // "Your attacks deal holy damage. Whenever you use a Dervish attack skill,
  // you lose 1 hex. Whenever you lose a Dervish enchantment, you are healed
  // for 5...50 Health" (#1437, PvP).
  "avatar-of-dwayna": define("avatar-of-dwayna", "Avatar of Dwayna", "form", {
    profession: "dervish",
    attackDamageType: "holy",
    triggers: [
      {
        on: "bearer-uses-skill",
        usedSkill: { type: "attack", profession: "dervish" },
        target: "bearer",
        effects: [{ kind: "remove-status", category: "hex", count: 1 }],
        skillId: "dervish.avatar-of-dwayna",
      },
      {
        on: "bearer-loses-enchantment",
        profession: "dervish",
        target: "bearer",
        effects: [
          {
            kind: "heal",
            amount: { scaling: { attributeId: "dervish.mysticism", atZero: 5, atTwelve: 41 } },
            perStatusOnTarget: [],
          },
        ],
        skillId: "dervish.avatar-of-dwayna",
      },
    ],
  }),
  // "You gain +20 armor against physical damage, you gain adrenaline 25%
  // faster, your attacks deal holy damage, and whenever you lose a Dervish
  // enchantment, nearby foes are set on fire for 1...3...3 second[s]"
  // (#1455): 3 s, its rank-12 value.
  "avatar-of-balthazar": define("avatar-of-balthazar", "Avatar of Balthazar", "form", {
    profession: "dervish",
    conditionalArmor: [{ amount: 20, conditions: [{ kind: "vs-physical" }] }],
    adrenalineGainFaster: 0.25,
    attackDamageType: "holy",
    triggers: [
      {
        on: "bearer-loses-enchantment",
        profession: "dervish",
        target: "bearer",
        effects: [
          {
            kind: "splash",
            hits: "foes",
            radius: AREA_NEARBY,
            maxTargets: undefined,
            effects: [{ kind: "apply-status", statusId: "burning", durationSeconds: 3 }],
          },
        ],
        skillId: "dervish.avatar-of-balthazar",
      },
    ],
  }),
  // "Your scythe attacks deal dark damage, and steal 0...10...12 Health.
  // You are immune to Disease, and inflict Disease on all adjacent foes
  // for 3 seconds whenever you lose a Dervish enchantment" (#1455): 10,
  // its rank-12 value.
  "avatar-of-grenth": define("avatar-of-grenth", "Avatar of Grenth", "form", {
    profession: "dervish",
    immuneTo: ["disease"],
    attackDamageType: "dark",
    attackDamageTypeWeapon: "scythe",
    onAttackHit: {
      effects: [
        {
          kind: "if",
          condition: { kind: "caster-wields", weapon: "scythe" },
          effects: [
            {
              kind: "life-steal",
              amount: { scaling: { attributeId: "dervish.mysticism", atZero: 0, atTwelve: 10 } },
            },
          ],
        },
      ],
      skillId: "dervish.avatar-of-grenth",
    },
    triggers: [
      {
        on: "bearer-loses-enchantment",
        profession: "dervish",
        target: "bearer",
        effects: [
          {
            kind: "splash",
            hits: "foes",
            radius: AREA_ADJACENT,
            maxTargets: undefined,
            effects: [{ kind: "apply-status", statusId: "disease", durationSeconds: 3 }],
          },
        ],
        skillId: "dervish.avatar-of-grenth",
      },
    ],
  }),
  // "Your Dervish enchantments recharge 50% faster and your attacks deal
  // chaos damage. Whenever you lose a Dervish enchantment, steal 1 Energy
  // from all nearby foes" (#1455).
  "avatar-of-lyssa": define("avatar-of-lyssa", "Avatar of Lyssa", "form", {
    profession: "dervish",
    enchantmentRechargeFaster: { share: 0.5, profession: "dervish" },
    attackDamageType: "chaos",
    triggers: [
      {
        on: "bearer-loses-enchantment",
        profession: "dervish",
        target: "bearer",
        effects: [
          {
            kind: "splash",
            hits: "foes",
            radius: AREA_NEARBY,
            maxTargets: undefined,
            effects: [{ kind: "energy-steal", amount: { flat: 1 } }],
          },
        ],
        skillId: "dervish.avatar-of-lyssa",
      },
    ],
  }),

  // Mesmer "the next spell fails" hexes (#1475), at their rank-12 values.
  // "...the next time target foe casts a spell that targets a foe, the
  // spell fails and you steal up to 5...14 Energy from that foe": 12.
  guilt: define("guilt", "Guilt", "hex", {
    profession: "mesmer",
    failsNextSpell: {
      on: "foe-targeted",
      effects: [{ kind: "energy-steal", amount: { flat: 12 } }],
      skillId: "mesmer.guilt",
    },
  }),
  // As Guilt, for "a spell that targets an ally": 12.
  shame: define("shame", "Shame", "hex", {
    profession: "mesmer",
    failsNextSpell: {
      on: "ally-targeted",
      effects: [{ kind: "energy-steal", amount: { flat: 12 } }],
      skillId: "mesmer.shame",
    },
  }),
  // "...the next spell that target foe casts on one of your allies fails
  // and deals 10...60 damage to that foe and 75% of that damage to all
  // nearby foes" (PvP): 50, and 38 nearby.
  mistrust: define("mistrust", "Mistrust", "hex", {
    profession: "mesmer",
    failsNextSpell: {
      on: "foe-targeted",
      effects: [
        { kind: "damage", amount: { flat: 50 }, type: "typeless", armorPenetration: 0 },
        {
          kind: "splash",
          hits: "foes",
          radius: AREA_NEARBY,
          maxTargets: undefined,
          effects: [
            { kind: "damage", amount: { flat: 38 }, type: "typeless", armorPenetration: 0 },
          ],
        },
      ],
      skillId: "mesmer.mistrust",
    },
  }),
  // "...take 5...20 damage each time they suffer or recover from a new
  // condition": 17.
  fragility: define("fragility", "Fragility", "hex", {
    profession: "mesmer",
    triggers: [
      {
        on: "bearer-gains-condition",
        effects: [{ kind: "damage", amount: { flat: 17 }, type: "typeless", armorPenetration: 0 }],
        target: "bearer",
        skillId: "mesmer.fragility",
      },
      {
        on: "bearer-loses-condition",
        effects: [{ kind: "damage", amount: { flat: 17 }, type: "typeless", armorPenetration: 0 }],
        target: "bearer",
        skillId: "mesmer.fragility",
      },
    ],
  }),
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
  /** Spells still to start before it ends (`nextSpells`); `undefined`: no such limit. */
  spellsLeft: number | undefined;
  /** Skills still to answer before it ends (`nextSkill`); `undefined`: no such limit. */
  skillsLeft: number | undefined;
  /** Times its triggers may still fire before it ends (`endsAfterTriggers`); `undefined`: no such limit. */
  triggersLeft: number | undefined;
  /** Who applied it — needed so a future "when this ends, heal the caster"
   *  effect knows whom to credit. */
  readonly sourceId: string;
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
   * Take `ids` off the bearer, each recorded as ended: `expired` when its
   * duration ran out (`advance`), and for every other end not (#944).
   */
  #end(ids: readonly StatusId[], expired = false, death = false): void {
    for (const id of ids) {
      const status = this.#statuses.get(id);
      if (status !== undefined) {
        this.#statuses.delete(id);
        this.#changes.push({ kind: "ended", id, sourceId: status.sourceId, expired });
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
   * Status `statusId` blocked an attack of this kind from `offenderId`
   * (#1329), recorded only if that status answers it, with its triggers:
   * another blocking status on the bearer does not. Every status that
   * answers any block (#1403) does, after it.
   */
  public recordBlock(statusId: StatusId, offenderId: string, kind: "melee" | "projectile"): void {
    const fired = [
      ...this.#answering(
        kind === "melee" ? "bearer-blocks-melee" : "bearer-blocks-projectile",
      ).filter((answering) => answering.statusId === statusId),
      ...this.#answering("bearer-blocks"),
    ];
    if (fired.length > 0) {
      this.#changes.push({ kind: "blocked", offenderId, fired });
    }
  }

  /**
   * The bearer lost health to damage or life steal from `offenderId`, a
   * foe (#1022), recorded only if a status on it answers that, with the
   * triggers that do. A status already waiting to answer one, undrained,
   * does not answer another: it fires once, at the first foe.
   */
  public recordDamageFromFoe(offenderId: string): void {
    const pending = new Set(
      this.#changes.flatMap((change) =>
        change.kind === "took-damage-from-foe" ? change.fired.map(({ statusId }) => statusId) : [],
      ),
    );
    const fired = this.#answering("bearer-takes-damage-from-foe").filter(
      ({ statusId }) => !pending.has(statusId),
    );
    if (fired.length > 0) {
      this.#changes.push({ kind: "took-damage-from-foe", offenderId, fired });
    }
  }

  /**
   * An attack by `offenderId`, a foe, hit the bearer (#1464), recorded only
   * if a status on it answers that, with the triggers that do. Every hit
   * counts: two foes in one tick are two.
   */
  public recordHitByAttack(offenderId: string): void {
    const fired = this.#answering("bearer-hit-by-attack");
    if (fired.length > 0) {
      this.#changes.push({ kind: "hit-by-attack", offenderId, fired });
    }
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
   */
  public apply(id: StatusId, appliedSeconds: number, sourceId: string): boolean {
    if (appliedSeconds <= 0 || this.isImmuneTo(id) || this.#breaksHex(id, sourceId)) {
      return false;
    }
    const wasActive = this.#statuses.has(id);
    const definition = getStatusDefinition(id);
    const durationSeconds =
      definition.category === "chant" || definition.category === "shout"
        ? appliedSeconds * this.#chantShoutDurationMultiplier()
        : appliedSeconds;
    if (EXCLUSIVE_CATEGORIES.has(definition.category)) {
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
      this.#statuses.set(id, existing);
      return false;
    }
    this.#statuses.set(id, {
      id,
      remainingSeconds: durationSeconds,
      durationSeconds,
      attacksLeft: definition.endsAfterAttacks,
      hitsLeft: definition.endsAfterHits?.count,
      spellsLeft: definition.nextSpells?.count,
      skillsLeft: definition.nextSkill?.count,
      triggersLeft: definition.endsAfterTriggers,
      sourceId,
      outbreak,
      maintained: null,
      projected: false,
    });
    this.#gainedHexOrEnchantment(id, sourceId);
    if (!wasActive) {
      this.#gained(id, durationSeconds);
      this.#endOnGaining(definition.category);
      this.#end(definition.immuneTo.filter((immune) => this.#statuses.has(immune)));
    }
    return !wasActive;
  }

  /** Whether a status on the bearer keeps `id` off it (#1455): Avatar of Grenth's Disease. */
  public isImmuneTo(id: StatusId): boolean {
    return this.active.some((status) => getStatusDefinition(status.id).immuneTo.includes(id));
  }

  /**
   * Catch a spreading status from a bearer of `outbreak` (#765). The
   * longer duration wins, as for `apply`, but a combatant already
   * carrying it keeps the outbreak it has.
   */
  public catch(id: StatusId, durationSeconds: number, sourceId: string, outbreak: Outbreak): void {
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
      spellsLeft: undefined,
      skillsLeft: undefined,
      triggersLeft: undefined,
      sourceId,
      outbreak,
      maintained: null,
      projected: false,
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
   */
  public maintain(id: StatusId, sourceId: string, seq: number): boolean {
    if (getStatusDefinition(id).category !== "enchantment") {
      throw new Error(`only an enchantment can be maintained, not ${id}`);
    }
    const wasActive = this.#statuses.delete(id);
    this.#statuses.set(id, {
      id,
      remainingSeconds: Number.POSITIVE_INFINITY,
      durationSeconds: Number.POSITIVE_INFINITY,
      attacksLeft: undefined,
      hitsLeft: undefined,
      spellsLeft: undefined,
      skillsLeft: undefined,
      triggersLeft: undefined,
      sourceId,
      outbreak: null,
      maintained: { seq, outOfRangeSeconds: 0 },
      projected: false,
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
  public project(id: StatusId, sourceId: string): boolean {
    if (this.#statuses.has(id)) {
      return false;
    }
    this.#statuses.set(id, {
      id,
      remainingSeconds: Number.POSITIVE_INFINITY,
      durationSeconds: Number.POSITIVE_INFINITY,
      attacksLeft: undefined,
      hitsLeft: undefined,
      spellsLeft: undefined,
      skillsLeft: undefined,
      triggersLeft: undefined,
      sourceId,
      outbreak: null,
      maintained: null,
      projected: true,
    });
    this.#endOnGaining(getStatusDefinition(id).category);
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
   * "remove a condition"/"strip an enchantment" skill needs. Returns the
   * ids actually removed, so a caller can report exactly what it stripped.
   *
   * The newest applied goes first, as in GW1 (#521), where covering an
   * important enchantment or condition with a cheaper one is a tactic.
   * With a `profession`, only that profession's statuses go (#845): "lose
   * 1 Dervish enchantment".
   */
  public removeByCategory(
    category: StatusCategory,
    count = Number.POSITIVE_INFINITY,
    profession?: ProfessionId,
  ): StatusId[] {
    const removed: StatusId[] = [];
    for (const status of [...this.#statuses.values()].reverse()) {
      if (removed.length >= count) {
        break;
      }
      const definition = getStatusDefinition(status.id);
      if (
        definition.category === category &&
        (profession === undefined || definition.profession === profession)
      ) {
        removed.push(status.id);
      }
    }
    this.#end(removed);
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
   * Touch's "transfer ... with their remaining durations".
   */
  public takeNewest(
    category: StatusCategory,
    count: number,
  ): { id: StatusId; remainingSeconds: number }[] {
    const taken = [...this.#statuses.values()]
      .reverse()
      .filter(({ id }) => getStatusDefinition(id).category === category)
      .slice(0, count)
      .map(({ id, remainingSeconds }) => ({ id, remainingSeconds }));
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
   * `nextSkillRule` answers its kind ends. Returns each, in `active`
   * order, with its rule.
   */
  public useNextSkillRules(
    skill: Skill,
  ): readonly { readonly statusId: StatusId; readonly rule: NextSkillRule }[] {
    const used = this.active.flatMap(({ id }) => {
      const rule = getStatusDefinition(id).nextSkillRule;
      return rule !== undefined && nextSkillAnswers(rule.which, skill)
        ? [{ statusId: id, rule }]
        : [];
    });
    this.#end(used.map(({ statusId }) => statusId));
    return used;
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

  /** How many are up of a category; with a `profession`, only that profession's (#1021). */
  public countByCategory(category: StatusCategory, profession?: ProfessionId): number {
    let count = 0;
    for (const status of this.#statuses.values()) {
      const definition = getStatusDefinition(status.id);
      if (
        definition.category === category &&
        (profession === undefined || definition.profession === profession)
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
  /** Every status's, multiplied, and floored at `HEALING_MULTIPLIER_FLOOR`. */
  readonly healingMultiplier: number;
  readonly weaponDamageMultiplier: number;
  /** Every status's, summed (#1064). */
  readonly physicalDamageTakenBonus: number;
  readonly attributeDelta: number;
  readonly castTimeMultiplier: number;
  readonly attackDurationMultiplier: number;
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
  /** The longest single status's (#1265); `undefined`: none. */
  readonly knockdownMinSeconds: number | undefined;
  /** Every status's, summed (#936). */
  readonly extraStrikesPerHit: number;
  /**
   * The share taken off a spell's recharge (#938): several combine as
   * 1 − Π(1 − f), never more than `MAX_RECHARGE_REDUCTION` (#975).
   */
  readonly spellRechargeFaster: number;
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
 * included.
 */
export function aggregateModifiers(statuses: readonly Pick<ActiveStatus, "id">[]): StatusModifiers {
  let healthPips = 0;
  let energyPips = 0;
  let armorModifier = 0;
  let armorWhileStill = 0;
  let healthPerSecondWhileMoving = 0;
  let healthPerSecond = 0;
  let healthPerSecondNearSpirit = 0;
  let armorReduction: ArmorReduction | undefined;
  let moveSpeedMultiplier = 1;
  let attackMissChance = 0;
  let maxHealthLoss: MaxHealthLoss | undefined;
  let maxHealthBonus = 0;
  let maxEnergyBonus = 0;
  const healingMultipliers: number[] = [];
  let weaponDamageMultiplier = 1;
  let physicalDamageTakenBonus = 0;
  let attributeDelta = 0;
  let castTimeMultiplier = 1;
  let attackFaster = 1;
  let attackSlower = 1;
  let damageTakenMultiplier = 1;
  let damageReduction = 0;
  let maxDamageFractionPerHit: number | undefined;
  let attackDamageCapFraction: number | undefined;
  let lifeStealReduction = 0;
  let knockdownMinSeconds: number | undefined;
  let extraStrikesPerHit = 0;
  let adrenalineGainFaster = 0;
  const enchantmentRechargeFaster: EnchantmentRechargeFaster[] = [];
  const skillArmorPenetration: SkillArmorPenetration[] = [];
  let uninterruptible = false;
  let conditionsExpireFaster = 0;
  let spellRechargeKept = 1;
  let bindingRitualRechargeKept = 1;
  let incomingHexCastTimeMultiplier = 1;
  let damageFromSpiritAttacks = 0;
  let criticalChanceBonus = 0;
  let energyPerCritical = 0;
  let healthPerCritical = 0;
  let ignoresCriticalDamage = false;
  const enchantments = statuses.filter(
    (status) => getStatusDefinition(status.id).category === "enchantment",
  ).length;
  /** Whether a status other than `self` is of one of `categories` (#1485). */
  const underAnother = (self: Pick<ActiveStatus, "id">, categories: readonly StatusCategory[]) =>
    statuses.some(
      (other) => other !== self && categories.includes(getStatusDefinition(other.id).category),
    );

  for (const status of statuses) {
    const def = getStatusDefinition(status.id);
    healthPips += def.healthPips;
    if (def.healthPipsPerEnchantment !== undefined) {
      const { pips, max } = def.healthPipsPerEnchantment;
      healthPips += pips * Math.min(enchantments, max);
    }
    energyPips += def.energyPips;
    armorModifier += def.armorModifier;
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
    moveSpeedMultiplier *= def.moveSpeedMultiplier;
    attackMissChance = Math.max(attackMissChance, def.attackMissChance);
    if (
      def.maxHealthLoss !== undefined &&
      (maxHealthLoss === undefined || def.maxHealthLoss.fraction > maxHealthLoss.fraction)
    ) {
      maxHealthLoss = def.maxHealthLoss;
    }
    maxHealthBonus += def.maxHealthBonus;
    maxEnergyBonus += def.maxEnergyBonus;
    healingMultipliers.push(def.healingMultiplier);
    weaponDamageMultiplier *= def.weaponDamageMultiplier;
    physicalDamageTakenBonus += def.physicalDamageTakenBonus;
    attributeDelta += def.attributeDelta;
    castTimeMultiplier *= def.castTimeMultiplier;
    attackFaster = Math.min(attackFaster, def.attackDurationMultiplier);
    attackSlower = Math.max(attackSlower, def.attackDurationMultiplier);
    damageTakenMultiplier *= def.damageTakenMultiplier;
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
    if (
      def.knockdownMinSeconds !== undefined &&
      (knockdownMinSeconds === undefined || def.knockdownMinSeconds > knockdownMinSeconds)
    ) {
      knockdownMinSeconds = def.knockdownMinSeconds;
    }
    extraStrikesPerHit += def.extraStrikesPerHit;
    adrenalineGainFaster += def.adrenalineGainFaster;
    if (def.whileUnder !== undefined && underAnother(status, def.whileUnder.categories)) {
      attackFaster = Math.min(attackFaster, def.whileUnder.attackDurationMultiplier);
      attackSlower = Math.max(attackSlower, def.whileUnder.attackDurationMultiplier);
      adrenalineGainFaster += def.whileUnder.adrenalineGainFaster;
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
    bindingRitualRechargeKept *= 1 - def.bindingRitualRechargeFaster;
    incomingHexCastTimeMultiplier *= def.incomingHexCastTimeMultiplier;
    damageFromSpiritAttacks += def.damageFromSpiritAttacks;
    criticalChanceBonus += def.criticalChanceBonus;
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
    healingMultiplier: combinedHealingMultiplier(healingMultipliers),
    weaponDamageMultiplier,
    physicalDamageTakenBonus,
    attributeDelta,
    castTimeMultiplier,
    attackDurationMultiplier: attackFaster * attackSlower,
    damageTakenMultiplier,
    damageReduction,
    maxDamageFractionPerHit,
    attackDamageCapFraction,
    lifeStealReduction,
    knockdownMinSeconds,
    extraStrikesPerHit,
    spellRechargeFaster: Math.min(MAX_RECHARGE_REDUCTION, 1 - spellRechargeKept),
    bindingRitualRechargeFaster: Math.min(MAX_RECHARGE_REDUCTION, 1 - bindingRitualRechargeKept),
    adrenalineGainFaster,
    enchantmentRechargeFaster,
    skillArmorPenetration,
    uninterruptible,
    conditionsExpireFaster,
    incomingHexCastTimeMultiplier,
    criticalChanceBonus,
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
