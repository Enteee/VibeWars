import type { SimulationRng } from "../rng.js";
import type { CombatRules } from "../ruleset.js";

import type { ResolvedEquipment } from "../equipment/resolve.js";
import type { SkillBar } from "../build.js";
import type { DamageType } from "../equipment/types.js";
import type { Behaviour } from "../match/behaviour.js";
import type { CreatureKind, CreatureLook } from "../match/simulation.js";
import type { ProfessionId, SkillProfession } from "../professions.js";
import type { CastState, SlotSkill } from "./cast-state.js";
import type { TargetCandidate } from "./targeting.js";
import type { AttackState } from "./weapon-attack.js";
import type {
  AttributeDelta,
  OwnSkillBoost,
  StatusCategory,
  StatusId,
  StatusSet,
} from "./status.js";
import type { HealthLossGuard } from "./loss-guard.js";

/**
 * The composable skill/effect system (brief §6).
 *
 * The central design rule: a skill is *data* — an identity plus a list of
 * effects — never a bespoke class with custom logic. Adding a skill means
 * adding a record; adding a new *mechanic* means adding one effect kind
 * plus its handler. This is what makes "hundreds of skills without a
 * switch statement the size of a building" (brief §41) achievable.
 */

export type ResourceKind = "energy" | "adrenaline";

export type SkillCost =
  | { readonly kind: "energy"; readonly amount: number }
  | {
      readonly kind: "adrenaline";
      readonly amount: number;
      /** GW1 "Lose all adrenaline" (#1097): using the skill empties every pool, and its blow earns none back. */
      readonly losesAll?: true;
    };

/**
 * How a skill's magnitude scales with an attribute rank.
 *
 * `atZero`/`atTwelve` mirror how the source corpus expresses scaling
 * ("1...16...20" = value at rank 0, 12, and 15). We interpolate linearly
 * between the rank-0 and rank-12 values, which is both the dominant shape
 * in the real data and trivially testable — rather than encoding a
 * bespoke curve per skill.
 */
export interface AttributeScaling {
  readonly attributeId: string;
  readonly atZero: number;
  readonly atTwelve: number;
}

/**
 * A line in a creature's whole level (#1899): a GW1 minion is level 21,
 * never 20.6, and its Health is 80 + 20·21, so Health steps with the
 * rank where the level does. `level` is rounded at the rank first.
 */
export interface LevelScaling {
  readonly level: AttributeScaling;
  readonly atLevelZero: number;
  readonly perLevel: number;
}

/** A magnitude that is flat, attribute-scaled, or a line in a whole level. */
export type Magnitude =
  | { readonly flat: number }
  | { readonly scaling: AttributeScaling }
  | { readonly byLevel: LevelScaling };

export type TargetRule =
  | "self"
  | "single-enemy"
  | "single-ally"
  /** An ally other than the caster (GW1's "Cannot target self"). */
  | "single-other-ally"
  /** Any single target including self; the caster chooses. */
  | "single-any"
  /** A dead ally other than the caster: a resurrection's (#812). */
  | "single-dead-ally"
  /** A living spirit on the caster's team, whoever made it (#1309): GW1's "allied spirit". */
  | "allied-spirit"
  /**
   * A living spirit another team's character made (#1965): Signet of
   * Binding's "target enemy-controlled spirit". Never a map's, which no
   * one controls.
   */
  | "enemy-spirit"
  /** A living minion the caster made (#1836): Putrid Flesh's "target minion". */
  | "own-minion"
  /** A living minion on the caster's team, whoever made it (#1836): Feast for the Dead's. */
  | "allied-minion"
  /**
   * A living spirit or minion on the caster's team, whoever made it
   * (#1827): GW1's "allied summoned creature". Never a pet, which is
   * charmed rather than summoned, nor a player.
   */
  | "allied-summoned-creature"
  /** As `"single-ally"`, yourself included, but never a spirit (#1423): GW1's "Cannot target spirits". */
  | "single-ally-not-spirit"
  /** The caster's own companion, alive or dead, whatever is selected (#1046). */
  | "companion"
  /** As `"companion"`, but only a living one (#1108): a call on a dead pet is refused. */
  | "living-companion";

/* -------------------------------------------------------------------------- */
/* Effects                                                                     */
/* -------------------------------------------------------------------------- */

export interface DamageEffect {
  readonly kind: "damage";
  readonly amount: Magnitude;
  /** GW1's type, which decides the typed armor that applies (#759). */
  readonly type: DamageType;
  /** The share of the target's armor it ignores, 0..1: Lightning Orb's 0.25 (#761). */
  readonly armorPenetration: number;
  /**
   * The amount is per point of energy the same target lost to an earlier
   * `energy-loss` of this skill, as Energy Burn's "9 damage for each
   * point of energy lost" (#793). None lost: no damage. Inside a
   * `splash`, the energy its centre lost, as Energy Surge's (#920).
   */
  readonly perEnergyLost?: true;
  /**
   * More damage, in the same packet, to each target for which
   * `condition` holds as it lands, as Mystic Twister's "if you are
   * enchanted, deals 10...50...60 more damage" (#977): one packet, so
   * mitigated, and capped, once.
   */
  readonly conditionalBonus?: ConditionalBonus;
  /**
   * More for each of a count, in the same packet (#1760), as Desecrate
   * Enchantments' "6...60 damage and 4...20 for each enchantment".
   */
  readonly per?: PerCount;
}

/** What a `per` counts, as its effect lands (#1760). */
export type CountRule =
  | {
      readonly kind: "statuses";
      /** Whose: the effect's target, or its caster (a trigger's bearer). */
      readonly on: "target" | "caster";
      readonly categories: readonly StatusCategory[];
    }
  /** Living foes of the caster within `radius` of the caster. */
  | { readonly kind: "foes-within"; readonly radius: number }
  /**
   * The skills of `attributeId` on the bar of the caster's living owner,
   * a pet's, that are recharging (#1957): Enraged Lunge's "for each of
   * your Beast Mastery skills that is recharging". No owner: 0.
   */
  | { readonly kind: "recharging-skills"; readonly of: "owner"; readonly attributeId: string };

/**
 * "+`amount` for each" (#1760): the effect's own amount plus `amount`
 * for each of what `count` counts, the total capped at `max` when set.
 * One packet, one heal or one gain, never one a count.
 */
export interface PerCount {
  readonly count: CountRule;
  readonly amount: Magnitude;
  readonly max: Magnitude | undefined;
}

export interface HealEffect {
  readonly kind: "heal";
  readonly amount: Magnitude;
  /**
   * `caster`: the caster is healed, as Drain Enchantment's "you gain N
   * Health" (#521). `companion`: the caster's living pet, Companionship's
   * (#1865); `owner`: the living owner of the caster, a pet, as Predatory
   * Bond's "successful attacks by your animal companion heal you". Neither
   * there: nobody. Absent: the target.
   */
  readonly recipient?: "caster" | "companion" | "owner";
  /** More for each of a count, in the same heal (#1760): Dwayna's Kiss's. */
  readonly per?: PerCount;
  /**
   * More for each living ally of the caster within `radius` of it, the
   * caster included, as Leader's Comfort's "+18 Health for each ally
   * within earshot (maximum 140 Health)" (#923): the whole heal, base and
   * per ally, is capped at `max` before healing modifiers.
   */
  readonly perAlly?: PerAllyHeal;
  /**
   * The amount is per status of this category an earlier `remove-status`
   * of this skill took off the heal's target, as Restore Condition's
   * "healed 10...58...70 Health for each condition removed" (#987). None
   * removed: no heal.
   */
  readonly perRemoved?: StatusCategory;
  /**
   * The amount is per spirit an earlier `destroy-allied-spirits` of this
   * skill destroyed (#1309), as Feast of Souls' "for each spirit destroyed
   * in this way". None destroyed: no heal.
   */
  readonly perDestroyedSpirit?: true;
  /**
   * The amount is per point of energy the target lost to an earlier
   * `energy-loss` of this skill, as Ether Feast's "You are healed 20...65
   * for each point of Energy lost" (#1627), `DamageEffect.perEnergyLost`'s
   * twin. None lost: no heal.
   */
  readonly perEnergyLost?: true;
  /**
   * The amount is per point of the base energy cost of the skill the
   * trigger answers, rounded half up (#1614): Aura of Restoration's
   * "healed for 200...400% of the Energy cost each time you cast a spell".
   * No energy cost, or no such skill: no heal.
   */
  readonly perUsedSkillEnergy?: true;
  /**
   * Only a recipient under this share of its effective maximum Health is
   * healed (#1951): Mist Form's "allies under 80% Health". Absent: any.
   */
  readonly onlyBelowHealthFraction?: number;
}

/** Leader's Comfort's heal per ally in earshot (#923). */
export interface PerAllyHeal {
  readonly amount: Magnitude;
  readonly radius: number;
  readonly max: number;
}

/**
 * Energy gained by the effect's caster or, with `toTarget`, by its target.
 * A count of what the caster did or controls only reads as its own gain:
 * the two do not mix.
 */
export type EnergyGainEffect = EnergyGainToCaster | EnergyGainToTarget;

export interface EnergyGainToCaster {
  readonly kind: "energy-gain";
  readonly amount: Magnitude;
  /**
   * Per point of energy the target lost to an earlier `energy-loss`, as
   * Energy Tap's "2 Energy for each point of Energy target foe lost"
   * (#793). None lost: no gain. Inside a `splash`, the energy its centre
   * lost (#920).
   */
  readonly perEnergyLost?: true;
  /**
   * Once for each target the skill hit, rather than once a use, as
   * Zealous Sweep's "for each foe you hit, you gain 3 Energy" (#977).
   */
  readonly perTarget?: true;
  /**
   * Once for each of the caster's living spirits and minions within
   * `radius` of it, at most `max` in all (#1316): Signet of Creation's
   * "4 Energy for every summoned creature you control within earshot
   * (maximum 3...12 Energy)". A pet is charmed, not summoned, and does
   * not count. None: no gain.
   */
  readonly perOwnCreatureWithin?: { readonly radius: number; readonly max: Magnitude };
  /**
   * The energy the gain never takes its recipient above (#1359): Warrior's
   * Endurance's "cannot raise your Energy above 10...25". A recipient
   * already above gains nothing and loses nothing. Absent: its maximum.
   */
  readonly upTo?: number;
  /**
   * Per point of the base energy cost of the skill the trigger answers,
   * rounded half up (#1614): Fire Attunement's "30% of the base Energy
   * cost of the skill". No energy cost, or no such skill: no gain.
   */
  readonly perUsedSkillEnergy?: true;
  /** More for each of a count, in the same gain (#1760): Channeling's. */
  readonly per?: PerCount;
  /**
   * `owner`: the living owner of the caster, a pet, gains it, as
   * Scavenger Strike's "you gain 3...15 Energy" (#1957). No owner: nobody.
   */
  readonly recipient?: "owner";
  /**
   * Per status of this category any earlier `remove-status` of this use
   * took off anyone, a splash's included (#1954): Hex Eater Signet's "1...4
   * Energy for each hex removed this way". None removed: no gain.
   */
  readonly perRemoved?: StatusCategory;
  readonly toTarget?: never;
}

export interface EnergyGainToTarget extends Omit<
  EnergyGainToCaster,
  "perEnergyLost" | "perOwnCreatureWithin" | "perRemoved" | "recipient" | "toTarget"
> {
  /**
   * The effect's target gains it, not its caster (#1485): in a status
   * trigger aimed at the bearer, the bearer. Energizing Finale's "that
   * ally gains 1...2 Energy".
   */
  readonly toTarget: true;
  readonly perEnergyLost?: never;
  readonly perOwnCreatureWithin?: never;
  readonly perRemoved?: never;
  readonly recipient?: never;
}

/**
 * The caster gains `strikes` strikes of adrenaline in every adrenaline
 * skill that is not recharging, each capped at its cost, as a hit's
 * strike (#977). `perTarget`: once for each target the skill hit, as
 * Zealous Sweep's "1 strike of adrenaline for each foe you hit".
 * `recipient: "owner"`: the caster's living owner, a pet's, gains them
 * instead, as Ferocious Strike's (#1957); no owner, nobody.
 */
export interface AdrenalineGainEffect {
  readonly kind: "adrenaline-gain";
  readonly strikes: number;
  readonly perTarget?: true;
  readonly recipient?: "owner";
}

/** The effect's target loses up to `amount` energy (never below 0). */
export interface EnergyLossEffect {
  readonly kind: "energy-loss";
  readonly amount: Magnitude;
}

/**
 * The target loses up to `amount` energy and the caster gains exactly
 * what it lost (#1455), GW1's energy stealing: Avatar of Lyssa's. A foe
 * with none gives nothing.
 */
export interface EnergyStealEffect {
  readonly kind: "energy-steal";
  readonly amount: Magnitude;
}

/**
 * Steal up to `amount` health from the target (#935), GW1's life
 * stealing: not damage, so no armor, no adrenaline and nothing that
 * reacts to damage sees it. The caster gains what the target lost.
 */
export interface LifeStealEffect {
  readonly kind: "life-steal";
  readonly amount: Magnitude;
}

/**
 * The caster gains up to `amount` Health from the corpse its skill
 * exploited (#466), as Soul Feast's "steal 50...234...280 Health": life
 * stealing's gain without a living target. Not a heal: no healing
 * modifier, capped at effective maximum health.
 */
export interface StealFromCorpseEffect {
  readonly kind: "steal-from-corpse";
  readonly amount: Magnitude;
}

/** Health sacrificed by the *caster*, as a percentage of their maximum. */
export interface SacrificeHealthEffect {
  readonly kind: "sacrifice-health";
  readonly percentOfMax: number;
}

/**
 * The *caster* loses `amount` health for each status of this profession
 * an earlier `remove-status` of this use took off the target (#944), as
 * Rend Enchantments' "for each Monk enchantment removed, you lose
 * 55...31...25 Health". Not damage: never mitigated, and it can kill, as
 * a sacrifice. `perRemovedOfProfession` `undefined`: `amount` once,
 * flat (#1550), as Wanderlust's spirit's "loses 70...50 Health".
 */
export type LoseHealthEffect = LoseHealthByCaster | LoseHealthByTarget;

export interface LoseHealthByCaster {
  readonly kind: "lose-health";
  readonly amount: Magnitude;
  readonly perRemovedOfProfession: ProfessionId | undefined;
  readonly recipient?: never;
}

/**
 * The effect's target loses `amount` health, not the caster (#1648), as
 * Enfeebling Touch's "target foe loses 5...53...65 Health". Not damage:
 * no armor, no damage modifiers and nothing that answers damage; only
 * invulnerability stops it, and it can kill.
 */
export interface LoseHealthByTarget {
  readonly kind: "lose-health";
  readonly amount: Magnitude;
  readonly recipient: "target";
  readonly perRemovedOfProfession?: never;
}

/**
 * The effect's target loses all of its Health above `keep` (#1951), as
 * Shadow Form's end: "lose all but 5...50 Health". Health loss, not
 * damage, as `LoseHealthByTarget`'s. At or below `keep`, or dead: nothing.
 */
export interface LoseHealthToEffect {
  readonly kind: "lose-health-to";
  readonly keep: Magnitude;
}

/**
 * Move up to `count` conditions, newest first, each with the time it had
 * left, `from` the caster onto the target (#944), as Plague Touch's, or
 * from the target onto the caster (#1511), as Draw Conditions'. Each
 * lands as any condition the giver put on: the longer duration wins,
 * with `durationMultiplier` times the time it had left (#1540): Plague
 * Signet's "with 100...200% of their remaining durations", Plague Touch's 1.
 * `healPerCondition`: the caster is healed that much per condition moved.
 * A `count` of `Infinity` moves them all; a giver who is the taker, as
 * Martyr's caster among its party (#1954), keeps its own as they are.
 */
export interface TransferConditionsEffect {
  readonly kind: "transfer-conditions";
  readonly from: "caster" | "target";
  readonly count: number;
  readonly durationMultiplier: number;
  readonly healPerCondition?: Magnitude;
}

/**
 * Copy every condition on the target, with the time it has left, onto
 * each foe of the caster within `radius` of the target (#1501), as
 * Epidemic's. The target keeps its own and gets no copy. Each copy lands
 * as a condition the caster put on: the longer duration wins.
 */
export interface SpreadConditionsEffect {
  readonly kind: "spread-conditions";
  readonly radius: number;
  /**
   * Each copy lands with this many percent more time than the target's
   * has left, at most `maxSeconds` (#1954): Extend Conditions' "durations
   * ... increased by 5...100% (maximum 30 seconds)". Absent: the same time.
   */
  readonly extendPercent?: Magnitude;
  readonly maxSeconds?: number;
}

/**
 * The caster gives the target some of its own health (#936), as Infuse
 * Health's "lose half your current health; target other ally is healed
 * for 100...129% of the amount you lost". The loss is
 * `floor(fractionOfCurrent × health)`, a sacrifice, not damage, so it can
 * never kill; the heal is `healPercent` of it, through the heal path.
 */
export interface GiveHealthEffect {
  readonly kind: "give-health";
  readonly fractionOfCurrent: number;
  readonly healPercent: Magnitude;
}

/**
 * Apply a condition/hex/enchantment to the effect's target, or to the
 * caster whatever it targeted (`on: "caster"`, #1930), as Shadow Walk's
 * stance while it Shadow Steps to a foe.
 */
export interface ApplyStatusEffect {
  readonly kind: "apply-status";
  readonly statusId: StatusId;
  readonly durationSeconds: number;
  readonly on?: "caster";
}

/**
 * Maintain an enchantment on the target (#837): it lasts until something
 * ends it, and costs its caster an energy pip while it does. `on` is who
 * wears it: the target, or the caster whatever it targeted (#1826), as
 * Aura of Displacement's caster does while it Shadow Steps to a foe.
 */
export interface MaintainStatusEffect {
  readonly kind: "maintain-status";
  readonly statusId: StatusId;
  readonly on: "target" | "caster";
}

/** Remove up to `count` statuses of a category from the target. */
export interface RemoveStatusEffect {
  readonly kind: "remove-status";
  readonly category: StatusCategory;
  /**
   * How many, newest first; `"all"` as Restore Condition's "remove all
   * conditions"; a `Magnitude` as Divert Hexes' "remove up to 1...3 hexes"
   * (#1954). Ignored when `perRemoved` is set.
   */
  readonly count: number | "all" | Magnitude;
  /**
   * Only statuses of this profession (`StatusDefinition.profession`), as
   * "lose 1 Dervish enchantment" (#845). Absent: any.
   */
  readonly profession?: ProfessionId;
  /**
   * Only this status, which must be of `category` (#1549): "Charge!"'s
   * "lose the Crippled condition". Absent: any of the category.
   */
  readonly statusId?: StatusId;
  /**
   * `caster`: from the caster, once per use however many targets, as
   * `heal`'s `recipient` (#845). Absent: the target.
   */
  readonly from?: "caster";
  /**
   * The count is per living spirit, any team's, within this radius of the
   * target (#1064), as Mend Body and Soul's "loses one condition for each
   * Spirit within earshot". Absent: `count` as it is.
   */
  readonly perSpiritNear?: number;
  /**
   * The count is the number of statuses of `category` an earlier
   * `remove-status` of this use took off the same bearer, capped at
   * `max`, as Contemplation of Purity's "for each one lost, ... lose one
   * hex (maximum 1...7...8)" (#1205). Absent: `count` as it is.
   */
  readonly perRemoved?: { readonly category: StatusCategory; readonly max: Magnitude };
  /**
   * Only the status the newest earlier `status-removed` of `category` in
   * this use took off, whoever bore it (#1954): Mirror of Disenchantment's
   * "also lose that same enchantment". None removed: nothing.
   */
  readonly sameAsRemoved?: true;
}

/**
 * This use's recharge is `fraction` shorter, as Signet of Pious Light's
 * "recharges 75% faster" (#845). Acts on the caster, once.
 */
export interface RechargeFasterEffect {
  readonly kind: "recharge-faster";
  readonly fraction: number;
}

/**
 * This skill recharges at once (#1914), as Needling Shot's "if it hits a
 * foe below 50% Health, it recharges instantly", inside an `if`. Unlike
 * `recharge-faster` it lands with a shot, its recharge already running,
 * and ends it there. Acts on the caster, once.
 */
export interface RechargeResetEffect {
  readonly kind: "recharge-reset";
}

/**
 * Interrupt the target's in-progress cast (brief §14). Only lands if the
 * target is actually casting — a mistimed interrupt is wasted, which is
 * the entire skill-expression point of the mechanic.
 */
export interface InterruptEffect {
  readonly kind: "interrupt";
  /**
   * None: an action, a skill being used or a plain swing under way
   * (#1709), as GW1 interrupts "all attacks". `skill`: a skill being
   * used, never a plain swing, as Cry of Frustration's "if target foe is
   * using a skill". `spell`: only a spell (`isSpell`) is interrupted, as
   * Concussion Shot's "while target foe is casting a spell" (#1008); a
   * chant is not one. `spell-or-chant`: a spell or a chant, as Power
   * Spike's "If target foe is casting a Spell or Chant" (#521). Anything
   * else is left alone, as if the target were not casting.
   */
  readonly only?: "skill" | "spell" | "spell-or-chant";
}

/**
 * Knock the target down (#468): for `durationSeconds` it cannot move,
 * attack or use skills, and whatever it was doing ends. Not an
 * interrupt, and not a status: `Combatant.knockdownRemaining`.
 */
export interface KnockdownEffect {
  readonly kind: "knockdown";
  readonly durationSeconds: number;
}

/**
 * Shadow Step (#988): the caster moves to the effect's target, as Death's
 * Charge's "Shadow Step to target foe" (`"target"`), or away from what it
 * has selected (#1326), as Heart of Shadow's "Shadow Step to a nearby
 * location directly away from your target" (`"away-from-selection"`), or
 * trades places with it (#1930), as Swap's "you and target summoned
 * creature Shadow Step to each other's locations" (`"swap"`). The effect
 * layer only reports it (`shadow-stepped`, `shadow-stepped-away`,
 * `shadow-swapped`); the simulation places the bodies.
 */
export interface ShadowStepEffect {
  readonly kind: "shadow-step";
  readonly to: "target" | "away-from-selection" | "swap";
}

/**
 * Bring a dead target back to life (#812, #474), as Restore Life's
 * "returned to life with 20...56...65% health and 42...80...90% energy".
 * A living target is left alone, and so is everything below: no health
 * lost, no teleport.
 */
export interface ResurrectEffect {
  readonly kind: "resurrect";
  readonly health: ResurrectHealth;
  /** A share of the target's maximum energy. */
  readonly energyPercent: Magnitude;
  /**
   * Both percentages are per party member within this radius of the
   * caster: the caster and its living team-mates, creatures aside, each
   * share capped at 100 (Signet of Return's "for each party member within
   * earshot"). `undefined`: once.
   */
  readonly perPartyMemberWithin: number | undefined;
  /**
   * Where it stands up: where it lies, or beside the caster (Rebirth's
   * "teleported to your current location").
   */
  readonly at: "corpse" | "caster";
}

/**
 * Bring back every dead allied companion within `radius` of the caster
 * (#1108), anyone's, in participant order, with `healthPercent` of its
 * maximum and no energy: Revive Animal. Acts on the caster, once; with
 * none there it does nothing, paid for.
 */
export interface ResurrectCompanionsEffect {
  readonly kind: "resurrect-companions";
  /** Centre to centre, world units. Walls do not block it. */
  readonly radius: number;
  readonly healthPercent: Magnitude;
}

/** How much health a resurrection returns (#474). */
export type ResurrectHealth =
  /** A share of the target's maximum: Restore Life's 56%. */
  | { readonly kind: "percent"; readonly percent: Magnitude }
  /**
   * The caster first loses `casterLosesFractionOfCurrent` of its current
   * health, floored, as Infuse Health's loss (never kills, not damage);
   * the target gets the caster's health after it, at most its own
   * maximum: Flesh of My Flesh's "lose half your Health ... with your
   * current Health".
   */
  | { readonly kind: "caster-current"; readonly casterLosesFractionOfCurrent: number };

/**
 * The caster's energy drops to 0 (#474): Rebirth's "consumes all your
 * remaining energy". Acts on the caster, once.
 */
export interface DrainOwnEnergyEffect {
  readonly kind: "drain-own-energy";
}

/**
 * The target suffers `amount` overcast (#1580), through `addOvercast`:
 * Exhausting Assault's "target foe suffers 10 Overcast". Its energy
 * ceiling drops; any energy above the new ceiling is lost.
 */
export interface OvercastEffect {
  readonly kind: "overcast";
  readonly amount: Magnitude;
}

/**
 * The caster gains a status, with itself as source (#1367): Ice Spear's
 * "you gain +1...4 Health regeneration for 5 seconds". Acts on the caster,
 * once however many targets the skill reached, as GW1's "you gain" does.
 */
export interface CasterGainsStatusEffect {
  readonly kind: "caster-gains-status";
  readonly statusId: StatusId;
  readonly durationSeconds: number;
}

/**
 * The caster's living pet gains a status, with the caster as source
 * (#1865): Run as One's "you and your pet run 25% faster". Once however
 * many targets; no pet, or a dead one: nothing, and nothing refused.
 */
export interface CompanionGainsStatusEffect {
  readonly kind: "companion-gains-status";
  readonly statusId: StatusId;
  readonly durationSeconds: number;
}

/**
 * The caster's living pet moves beside the effect's target at once and
 * attacks it (#1966): Strike as One's "your animal companion instantly
 * moves to your target". Once however many targets; no pet, a dead one
 * or a dead target: nothing. A pet at heel moves and does not attack.
 */
export interface CompanionStepsToTargetEffect {
  readonly kind: "companion-steps-to-target";
}

/**
 * Apply `effects` to every foe of the caster within `radius` of the
 * effect's target, the target itself excluded (#885), as Death Blossom's
 * "all adjacent foes take 20...40 damage". Not a blow: no block, no crit
 * and no chain mark on a foe it reaches. `foe-creatures` reaches only the
 * foes' summoned creatures, never a player nor a pet (#1309, #1528):
 * Consume Soul's "all hostile summoned creatures in earshot of that foe".
 * `allies` reaches the
 * caster's side instead, the caster included (#1316): Spirit's Gift's "all
 * allies near that creature"; `non-spirit-allies` leaves out its spirits
 * (#1951), Mist Form's "non-spirit allies". `party` reaches the caster's side's players,
 * never a creature (#1434): Protective Was Kaolai's "all party members",
 * at a radius of `Infinity`, as `PartyArea` reaches them. `own-spirits`
 * reaches the caster's own living spirits (#1777), and is the one measured
 * from the caster, not the target: GW1's "your spirits within earshot" is
 * earshot of you, even when the skill strikes a foe (Spirit Boon Strike).
 * `around: "caster"` centres it on the caster instead, whatever it
 * targeted (#1826): Return's "all adjacent foes", cast on an ally.
 */
export interface SplashEffect {
  readonly kind: "splash";
  readonly hits:
    | "foes"
    | "foe-creatures"
    | "allies"
    | "non-spirit-allies"
    | "party"
    | "own-spirits"
    | "own-minions";
  readonly radius: number;
  readonly around?: "caster";
  /**
   * At most this many, the nearest to the centre first, a tie by id
   * (#1316): Explosive Growth's "up to 5 foes", or by attribute, as Hex
   * Eater Signet's "up to 2...5 adjacent allies" (#1954). `undefined`:
   * all of them.
   */
  readonly maxTargets: number | Magnitude | undefined;
  /**
   * Only those bearing a status of this category, picked before
   * `maxTargets` (#1954): Hex Eater Signet's allies "each lose one hex"
   * spend no slot on one with none. Absent: anyone.
   */
  readonly onlyBearing?: StatusCategory;
  readonly effects: readonly UnconditionalEffect[];
}

/**
 * The skill's target is put beside the caster (#1777): Draw Spirit's
 * "teleport target allied spirit to your location". A spirit never walks,
 * so it stays there; it keeps its owner and its timer.
 */
export interface PullToCasterEffect {
  readonly kind: "pull-to-caster";
}

/**
 * The skill's target, a living allied spirit, is destroyed (#1309):
 * Rupture Soul's "target allied spirit is destroyed". It leaves as an
 * expired spirit does: no corpse, no killer and no morale. Acts once, on
 * the primary target, after the effects listed before it.
 */
export interface DestroyTargetSpiritEffect {
  readonly kind: "destroy-target-spirit";
}

/**
 * The living spirit nearest the caster within earshot, any team's, loses
 * `health` Health, or what it has; the target is healed `healPerPoint` for
 * each point it lost (#1947): Spirit Transfer's. The spirit can die of it.
 * Acts once, on the primary target. None in earshot: the simulation
 * refuses the cast before it starts.
 */
export interface DrainNearestSpiritEffect {
  readonly kind: "drain-nearest-spirit";
  readonly health: Magnitude;
  readonly healPerPoint: number;
}

/**
 * The skill's target, a living allied minion, is destroyed (#1836), as
 * `destroy-target-spirit` a spirit: Putrid Flesh's and Feast for the
 * Dead's "it is destroyed". No killer and no morale, but what its death
 * leaves, a corpse or its replacement, it still leaves.
 */
export interface DestroyTargetMinionEffect {
  readonly kind: "destroy-target-minion";
}

/**
 * A minion's blow gives its owner the Health it took (#1836): Vampiric
 * Horror's "you gain the same amount of Health". Not a heal, so nothing
 * that changes heals changes it, and not a steal. A dead or gone owner
 * gains nothing.
 */
export interface OwnerGainsDamageDealtEffect {
  readonly kind: "owner-gains-damage-dealt";
}

/**
 * Every living allied spirit within `radius` of the caster is destroyed,
 * as `destroy-target-spirit` (#1309): Feast of Souls' "destroy all nearby
 * allies' spirits". A heal after it with `perDestroyedSpirit` counts them.
 * Acts on the caster, once.
 */
export interface DestroyAlliedSpiritsEffect {
  readonly kind: "destroy-allied-spirits";
  readonly radius: number;
}

/**
 * Every other skill of the caster of this type recharges at once (#885),
 * as Moebius Strike's "all your other attack skills are recharged". Acts
 * on the caster, once. `all` (#1762), from a status's trigger, recharges
 * every skill on the bar, the status's own included: Assassin's Promise.
 * A dead caster recharges nothing.
 */
export interface RechargeOthersEffect {
  readonly kind: "recharge-others";
  readonly which: "attack" | "all";
}

/**
 * Disable the skill this resolution interrupted on the target (#914): it
 * cannot be used for `seconds`, running alongside its recharge, as
 * Distracting Shot's "that skill is disabled for an additional 20
 * seconds". With `interrupted-and-attribute`, every skill on the
 * target's bar of the same attribute too, as Power Block's; a skill with
 * no attribute disables only itself. Nothing interrupted: nothing. With
 * `all`, every skill on the target's bar, nothing interrupted needed
 * (#474): Rebirth's "all of target's skills are disabled". With `elite`,
 * the elite skill on the target's bar (#1473), Signet of Humility's; no
 * elite: nothing. With `random-spell`, one spell on the target's bar,
 * picked with the match's rng (#1928), Arcane Thievery's; no spell: nothing.
 */
export interface DisableSkillEffect {
  readonly kind: "disable-skill";
  readonly which: "interrupted" | "interrupted-and-attribute" | "all" | "elite" | "random-spell";
  readonly seconds: Magnitude;
}

/**
 * The slot of the skill resolving holds, for `seconds`, a copy of the
 * skill that put on what an earlier `remove-status` took off (#1928), as
 * Inspired Enchantment's "this skill is replaced by the enchantment you
 * removed"; then the original is back, and starts its recharge, as
 * Echo's (#469). Nothing removed, or removed but put on by no skill, by
 * another copier or by a skill not in the game: no copy.
 */
export interface CopyRemovedEffect {
  readonly kind: "copy-removed";
  readonly seconds: number;
}

/**
 * The slot of the skill resolving holds a copy of the spell an earlier
 * `disable-skill` `random-spell` disabled on the target (#1928), for as
 * long as it disabled it: Arcane Thievery's. Nothing disabled: no copy.
 */
export interface CopyDisabledEffect {
  readonly kind: "copy-disabled";
}

/**
 * The slot of the skill resolving holds a copy of the first elite from
 * the left on the target's bar that is not a form, for `seconds` (#1965):
 * Arcane Mimicry's. None: no copy.
 */
export interface CopyEliteEffect {
  readonly kind: "copy-elite";
  readonly seconds: number;
}

/**
 * A skill takes `seconds` longer to recharge. Recharge, not a disable:
 * what ends a recharge ends it.
 *
 * `target-last-skill`: the skill its target just used (#949), as
 * Diversion's "the next time target foe uses a skill, that skill takes an
 * additional 47 seconds to recharge". No skill just used: nothing.
 *
 * `this-skill`: the skill resolving, this use only (#1519), as Word of
 * Censure's "takes 20 additional seconds to recharge". Acts on the caster,
 * once; whoever starts that recharge adds it (`resolveSkillEffects`).
 */
export interface LengthenRechargeEffect {
  readonly kind: "lengthen-recharge";
  readonly of: "target-last-skill" | "this-skill";
  readonly seconds: Magnitude;
}

/**
 * Disable the caster's own bar skills of one kind for `seconds` (#1234),
 * running alongside their recharges as `disable-skill`'s do, as Shroud of
 * Silence's "all of your spells are disabled for 15 seconds". `spells`:
 * every spell (`isSpell`) on the bar. `attribute` (#1511): every skill
 * of `attributeId` on the bar but the one used, as Light of Deliverance
 * (PvP)'s "all your Smiting Prayers are disabled". `other-professions`
 * (#1473): every skill on the bar not of `profession`, the using skill's
 * own, a common skill included, but those of `exceptTypes`: Unnatural
 * Signet's "all your non-Mesmer skills except signets". `all` (#1570):
 * every skill on the bar, the one used included, as Blackout's "all of
 * your skills are disabled for 5 seconds". `attacks` (#1914): every
 * attack skill on the bar but the one used, as Focused Shot's "your other
 * attack skills are disabled". `types` (#1930): every skill on the
 * bar of one of `types`, the one used included, as Shadow Walk's "your
 * enchantments and stances are disabled"; a status it keeps up runs on.
 * None on it: nothing. `seconds` scales
 * with the caster's rank, as Focused Shot's 8...5...4.
 */
export type DisableOwnSkillsEffect =
  | {
      readonly kind: "disable-own-skills";
      readonly which: "spells";
      readonly seconds: Magnitude;
    }
  | {
      readonly kind: "disable-own-skills";
      readonly which: "all";
      readonly seconds: Magnitude;
    }
  | {
      readonly kind: "disable-own-skills";
      readonly which: "attacks";
      readonly seconds: Magnitude;
    }
  | {
      readonly kind: "disable-own-skills";
      readonly which: "attribute";
      readonly attributeId: string;
      readonly seconds: Magnitude;
    }
  | {
      readonly kind: "disable-own-skills";
      readonly which: "other-professions";
      readonly profession: ProfessionId;
      readonly exceptTypes: readonly SkillType[];
      readonly seconds: Magnitude;
    }
  | {
      readonly kind: "disable-own-skills";
      readonly which: "types";
      readonly types: readonly SkillType[];
      readonly seconds: Magnitude;
    };

/**
 * Leave the caster's chain mark of `role` on the target (#1234), as a
 * chain attack's hit does (`chain.ts`), from a skill that is no attack:
 * Iron Palm's "counts as a lead attack", Mantis Touch's "counts as an
 * off-hand attack" (#1580).
 */
export interface ChainMarkEffect {
  readonly kind: "chain-mark";
  readonly role: "lead" | "off-hand";
}

/**
 * What a `summon` makes (#1052, ADR-0035): a body that is not a player,
 * with health, armor and a team, and no skill bar, attributes or energy.
 */
export interface CreatureTemplate {
  readonly kind: CreatureKind;
  /** How it is drawn (#1162): the glyph on its plate. */
  readonly look: CreatureLook;
  /** Shown in the target frame and the name label, as "Bone Minion". */
  readonly name: string;
  /** Scaled by the summoning skill's caster, as any other magnitude. */
  readonly maxHealth: Magnitude;
  /** Scaled by the summoner, as `maxHealth` (#467 child 3). */
  readonly armor: Magnitude;
  /** Its blows; `undefined`: it never swings (a spirit). */
  readonly attack: CreatureAttack | undefined;
  /** Seconds it lasts; omitted: until it is killed. */
  readonly durationSeconds?: Magnitude;
  /** What it does each tick. */
  readonly behaviour: Behaviour;
  /** `undefined`: it projects nothing (every minion). Only a spirit has one. */
  readonly aura: Aura | undefined;
  /**
   * What its death leaves (#1046). `"vanish"`: it is gone at the end of
   * the step, as a spirit or minion is. `"lie"`: it stays a dead
   * participant where it fell, until something brings it back.
   */
  readonly onDeath: "vanish" | "lie";
  /**
   * Seconds its owner's whole bar is disabled when it dies, scaled by
   * the owner (GW1's pet, #1046); `undefined`: nothing happens to the owner.
   */
  readonly ownerDisableOnDeath: Magnitude | undefined;
  /** What its death does round it (#1550); `undefined`: nothing. */
  readonly deathBurst: DeathBurst | undefined;
  /** What another's death in its range does (#1886), a spirit's; `undefined`: nothing. */
  readonly onDeathInRange: DeathInRange | undefined;
  /**
   * Who stands up where it fell, its owner's, when it dies or is destroyed
   * (#1836): Shambling Horror's Jagged Horror. Not when its owner is dead
   * or gone; `undefined`: nobody.
   */
  readonly replacedBy: { readonly creature: CreatureTemplate; readonly count: number } | undefined;
  /**
   * The exploitable corpses its death leaves (#1836), read on its owner
   * at summoning, rounded: Flesh Golem's "1...4". It lies until the last
   * is exploited. `undefined`: none, as any creature (ADR-0035).
   */
  readonly leavesCorpses: Magnitude | undefined;
  /** A new one from the same skill and owner kills the old one first (#1836): Flesh Golem. */
  readonly onePerOwner: boolean;
}

/**
 * A spirit's last act (#1550), as Destruction's "when this spirit dies,
 * foes in the area take 1...10 damage for each second this spirit was
 * alive" or Life's heal: killed, destroyed or at the end of its lifespan,
 * every living non-spirit of `affects` within `radius` of it takes, or
 * is healed, `perSecondAlive` × its whole seconds alive, at most `max`.
 * Damage is typeless, from its owner. `"apply-status"`, Lacerate's
 * (#1956): every one of them strictly below `belowHealthFraction` of its
 * maximum gets `statusId` for `durationSeconds`, from its owner.
 */
export type DeathBurst =
  | {
      readonly effect: "damage" | "heal";
      /** Scaled by its owner, read once at summoning (#1603). */
      readonly perSecondAlive: Magnitude;
      /** `undefined`: no cap. */
      readonly max: number | undefined;
      readonly affects: "allies" | "foes" | "all";
      readonly radius: number;
    }
  | {
      readonly effect: "apply-status";
      readonly statusId: StatusId;
      /** Scaled by its owner, read once at summoning. */
      readonly durationSeconds: Magnitude;
      readonly belowHealthFraction: number;
      readonly affects: "allies" | "foes" | "all";
      readonly radius: number;
    };

/**
 * What a spirit does when a non-spirit body dies within its
 * `RANGE_NATURE_RITUAL` (#1886), whatever its team, cause or killer.
 * `"damage-same-type"`, Edge of Extinction's: every living body of the
 * dead one's type (its `CreatureKind`, or `"character"`) in the
 * spirit's range, below `belowHealthFraction` of its maximum, takes
 * `damage`, typeless, from the spirit; scaled by its owner, read once at
 * summoning. `"spread-conditions"`, Pestilence's: each condition on the
 * dead one, with the time it had left and its own source, lands on every
 * living non-spirit within `radius` of the corpse that already has one.
 */
export type DeathInRange =
  | {
      readonly kind: "damage-same-type";
      readonly damage: Magnitude;
      readonly belowHealthFraction: number;
    }
  | { readonly kind: "spread-conditions"; readonly radius: number };

/**
 * A creature's melee or ranged blow (#467 child 3), as a weapon's numbers.
 * `damageMin`–`damageMax` is what it deals with its summoner at rank 12 in
 * `attributeId`, against armor 60. The summoner's rank, read once at
 * summoning, scales every blow as `scaling` says.
 */
export interface CreatureAttack {
  readonly attributeId: string;
  readonly damageMin: number;
  readonly damageMax: number;
  readonly scaling: CreatureDamageScaling;
  readonly damageType: DamageType;
  readonly attackIntervalSeconds: number;
  readonly range: number;
  /** World units per second, a shot's; `undefined`: a melee blow. */
  readonly projectileSpeed: number | undefined;
  /** What each blow that hits does besides its damage (#1239); a missed or blocked one, nothing. */
  readonly onHit: readonly OnHitEffect[];
}

/**
 * How a creature's summoner's rank scales its blows, one way each.
 * `level`: through its GW1 level (`creatureDamageMultiplier`, #1131), ×1
 * at 12 and ×0 at a level of 0, a minion's. `weapon-mastery`: as weapon
 * mastery scales a player's (`weaponAttributeMultiplier`), a pet's.
 * `rank`: linear in the rank, `atZero` at 0 and `damageMax` at 12, as
 * GW1 states a spirit's "attacks deal 5...30 damage" (#1239).
 */
export type CreatureDamageScaling =
  | { readonly kind: "level"; readonly level: CreatureLevel }
  | { readonly kind: "weapon-mastery" }
  | { readonly kind: "rank"; readonly atZero: number };

/**
 * What a blow lands on whoever it hits (#1239): Shadowsong's blindness,
 * Dissonance's interrupt; Bloodsong's life steal, Anguish's damage on a
 * hexed foe and Wanderlust's knockdown, paid in the spirit's own Health
 * (#1550). The attacker is the caster: it steals, and it pays.
 */
export type OnHitEffect = UnconditionalOnHitEffect | ConditionalOnHitEffect;

/** Every on-hit effect but `if`: what an on-hit `if` may hold. */
export type UnconditionalOnHitEffect =
  | ApplyStatusEffect
  | InterruptEffect
  | RemoveStatusEffect
  | DamageEffect
  | LifeStealEffect
  | KnockdownEffect
  | LoseHealthEffect
  | OwnerGainsDamageDealtEffect;

/** An `if` (#1550) holding only on-hit effects. */
export interface ConditionalOnHitEffect {
  readonly kind: "if";
  readonly condition: EffectCondition;
  readonly effects: readonly UnconditionalOnHitEffect[];
}

/**
 * A minion's GW1 level with its summoner at rank 0 and 12 in the
 * attack's attribute, linear in the rank between and past (#1131).
 */
export interface CreatureLevel {
  readonly atZero: number;
  readonly atTwelve: number;
}

/** What a spirit projects while it lives (#1064), or a ground effect while it lasts (#1087). */
export interface Aura {
  /** Worn by every body it affects, for as long as it is in range. */
  readonly statusId: StatusId;
  /**
   * Relative to the source's team. `all`: a nature ritual's, both teams.
   * `allies`: a binding ritual's or a ward's. `foes`: the other teams'.
   */
  readonly affects: "all" | "allies" | "foes";
  /** Centre to centre, world units. Walls do not block it. */
  readonly radius: number;
}

/**
 * The caster takes control of its target, a spirit (#1965): Signet of
 * Binding's. It is the caster's from then on, on its team, and leaves
 * with it, keeping what it has left. Acts on each target; the simulation
 * moves it, as it makes a `summon`'s. A dead caster takes nothing.
 */
export interface TakeControlEffect {
  readonly kind: "take-control";
}

/**
 * Summon `count` creatures at the caster, on the caster's team, owned by
 * it (#1052). Acts on the caster, once. A match holds at most
 * `MAX_CREATURES`: past it, as many as fit, possibly none.
 */
export interface SummonEffect {
  readonly kind: "summon";
  readonly creature: CreatureTemplate;
  readonly count: number;
  /**
   * One more for each corpse the skill exploited (#1915), as Aura of the
   * Lich's "plus one per corpse exploited". Absent: `count` alone.
   */
  readonly perExploitedCorpse?: true;
  /**
   * Where the primary target stands (#1947), as Gaze of Fury's spirit
   * takes the destroyed one's place. Absent: at the corpse, or the caster.
   */
  readonly at?: "target";
}

/**
 * Effects that land again and again from a ground effect (#1113): `count`
 * times, `everySeconds` apart, the first the step it is placed, each on
 * whoever `area` takes around it, from its owner.
 */
export interface PulseRule {
  /** At least 1. */
  readonly count: number;
  /** More than 0. */
  readonly everySeconds: number;
  /**
   * The age at which its first pulse lands (#1270): Spirit Rift's "after 3
   * seconds". 0: the step it is placed.
   */
  readonly delaySeconds: number;
  /** Who a pulse hits; `origin: "caster"` means the effect's position. */
  readonly area: RadiusArea;
  readonly effects: readonly SkillEffect[];
}

/**
 * A trap's rule (#1105): the first step a living foe's centre is within
 * `triggerRadius` of it, it springs into `spring`'s pulses from its owner
 * and is gone. One pulse is a single hit; more leave a pulse effect where
 * the trap lay (#1113).
 */
export interface TrapRule {
  /** A foe's centre this close springs it. */
  readonly triggerRadius: number;
  /** Whether it springs by itself as its time runs out, as Flame Trap's "automatically triggers". */
  readonly springsAtEnd: boolean;
  readonly spring: PulseRule;
}

/**
 * What a ground effect does while it lasts: a ward projects an aura
 * (#1087), a trap waits for a foe to spring it (#1105), a pulse lands its
 * effects every interval (#1113).
 */
export type GroundAct =
  | { readonly kind: "aura"; readonly aura: Aura }
  | { readonly kind: "trap"; readonly trap: TrapRule }
  | { readonly kind: "pulse"; readonly pulse: PulseRule };

/**
 * Leave a ground effect as the skill lands (#1087): a circle that is not
 * a body, doing `act` for `durationSeconds`. `caster`: where the caster
 * stands (a ward, a trap). `corpse`: where the corpse the skill exploited
 * lies (a well, #1104), so only a skill with a `corpse` rule has one.
 * `target`: where the cast's target stands (a symbol, #1113). A pulse
 * lasts its `count × everySeconds`. Acts on the caster, once. A match
 * holds at most `MAX_GROUND_EFFECTS`: past it, the oldest ends early.
 */
export interface CreateGroundEffect {
  readonly kind: "create-ground-effect";
  readonly anchor: "caster" | "corpse" | "target";
  readonly durationSeconds: Magnitude;
  readonly act: GroundAct;
}

/** How long "knocks down" lasts when a skill names no duration (GW1). */
export const KNOCKDOWN_SECONDS = 2;

/** What an earlier effect of the same skill did to the same target (#521). */
export type EventCondition =
  /**
   * An `interrupt` earlier in the list cancelled a skill, never a plain
   * swing (#1709): Psychic Instability's "if that action is a skill".
   */
  | { readonly kind: "interrupted" }
  /**
   * An `interrupt` earlier in the list cancelled a spell (`isSpell`; a
   * chant is not one), as Leech Signet's "if that action was a spell" (#920).
   */
  | { readonly kind: "interrupted-spell" }
  /**
   * A `remove-status` earlier in the list removed at least one status of
   * this category; with `from: "caster"`, from the caster (#845), which
   * holds for every target of that use.
   */
  | { readonly kind: "removed"; readonly category: StatusCategory; readonly from?: "caster" }
  /**
   * A `resurrect` earlier in the list brought this target back (#474), so
   * Rebirth's disable stays off a living ally whom another res reached first.
   */
  | { readonly kind: "resurrected" };

/**
 * How the target or the caster stands (#794), read once, before any
 * effect of the skill lands, so a heal cannot lift its own target out of
 * its bonus.
 */
export type StateCondition =
  /** The effect's target is below this fraction of its maximum health (0.5 = 50%). */
  | { readonly kind: "target-health-below"; readonly fraction: number }
  /** The effect's target is above this fraction of its maximum health (#1315); equal is not above. */
  | { readonly kind: "target-health-above"; readonly fraction: number }
  /**
   * The caster is below this fraction of its maximum health (#1757):
   * Desperate Strike's "if you have less than 74% Health". Equal is not
   * below.
   */
  | { readonly kind: "caster-health-below"; readonly fraction: number }
  /**
   * The caster has less Health than its living pet, or the pet less than
   * the caster (#1865), absolute Health: Companionship's. Equal is
   * neither; no living pet: false.
   */
  | { readonly kind: "caster-health-below-companion" }
  | { readonly kind: "companion-health-below-caster" }
  /**
   * The effect's target bears the caster's chain mark of this role
   * (#1757), read and left as it is: Impale's "must follow a dual
   * attack".
   */
  | { readonly kind: "target-chain-mark"; readonly role: ChainRole }
  /**
   * The effect's target has at least one status of this category; with a
   * `profession` or an `attribute`, one carrying it (#1765): Icy Prism's
   * "if target foe is suffering from a Water Magic hex". Whose skill
   * applied it does not matter. `not` asks for none.
   */
  | {
      readonly kind: "target-has";
      readonly category: StatusCategory;
      readonly profession?: ProfessionId;
      readonly attribute?: string;
    }
  /**
   * The effect's target has at least one status of any of these categories
   * (#1234): Iron Palm's "suffering from a hex or condition".
   */
  | { readonly kind: "target-has-any"; readonly categories: readonly StatusCategory[] }
  /**
   * The effect's target is activating a spell (`isSpell`); a chant is not
   * one, unless `orChant` (#1931), as Power Leech's "if target foe is
   * casting a Spell or Chant".
   */
  | { readonly kind: "target-casting"; readonly spell: true; readonly orChant?: true }
  /**
   * The effect's target is activating any skill, an attack skill included
   * (#1473): Overload's "if target foe is using a skill". A plain weapon
   * swing is no skill.
   */
  | { readonly kind: "target-using-skill" }
  /**
   * The effect's target has no hex of this profession's but the status
   * whose trigger is resolving (#1473): Visions of Regret's "if not under
   * the effects of another Mesmer hex". Outside a trigger: no such hex.
   */
  | { readonly kind: "target-lacks-other-hex"; readonly profession: ProfessionId }
  /**
   * The caster has at least one status of this category; with a
   * `profession`, one of that profession's (#1021): Eremite's Attack's
   * "if a Dervish enchantment is removed", read before it is.
   */
  | {
      readonly kind: "caster-has";
      readonly category: StatusCategory;
      readonly profession?: ProfessionId;
    }
  /**
   * The caster has no status of this category (#1354), the negation of
   * `caster-has`: Pure Strike's "if you are not using a stance". With
   * `profession`, none of that profession's (#1551): Wearying Strike's
   * "if a Dervish enchantment is not removed".
   */
  | {
      readonly kind: "caster-lacks";
      readonly category: StatusCategory;
      readonly profession?: ProfessionId;
    }
  /**
   * No living ally of the effect's target, the target itself excluded,
   * stands within `radius` of it (#885): Horns of the Ox's "not adjacent
   * to any allies".
   */
  | { readonly kind: "target-alone"; readonly radius: number }
  /**
   * A living ally of the caster's, the caster itself excluded, stands
   * within `radius` of the effect's target (#1742): Crossfire's "if that
   * foe is near any of your allies". Allies as `target-alone` counts them,
   * pets and spirits included.
   */
  | { readonly kind: "target-near-caster-ally"; readonly radius: number }
  /** The effect's target did not walk in the previous tick (#921, `Combatant.moving`). */
  | { readonly kind: "target-not-moving" }
  /**
   * The effect's target is knocked down (#985, `Combatant.knockdownRemaining`):
   * Aftershock's "knocked down foes are struck for ... additional".
   */
  | { readonly kind: "target-knocked-down" }
  /**
   * The effect's target walked in the previous tick (#997,
   * `Combatant.moving`): Water Trident's "a moving foe".
   */
  | { readonly kind: "target-moving" }
  /**
   * The effect's target has this status (#997): Stoning's "suffering from
   * Weakness", Searing Flames' "already on fire".
   */
  | { readonly kind: "target-has-status"; readonly statusId: StatusId }
  /**
   * The effect's target does not have this status (#997): Searing Flames'
   * "foes not already on fire".
   */
  | { readonly kind: "target-lacks-status"; readonly statusId: StatusId }
  /**
   * The caster has more energy than the effect's target (#918): Mind
   * Shock's "if you have more energy than target foe". Equal is not more.
   */
  | { readonly kind: "caster-more-energy" }
  /**
   * The caster is overcast, above 0, as the effect resolves (#1366):
   * Flare's "if you are Overcast". A spell's own overcast is paid as its
   * activation starts, so one with overcast counts its own.
   */
  | { readonly kind: "caster-overcast" }
  /**
   * The caster's main hand is a weapon of this class (#939): Vow of
   * Strength's and Sand Shards' "with your scythe".
   */
  | { readonly kind: "caster-wields"; readonly weapon: AttackWeaponClass }
  /**
   * The caster holds a shield in the set in hand (#1592): Shield Bash's
   * "while wielding a shield". A focus is no shield.
   */
  | { readonly kind: "caster-holds-shield" }
  /**
   * The effect's target has less health than the caster, absolute, not a
   * share (#939): Victorious Sweep's "if target foe has less Health than
   * you". Equal is not less.
   */
  | { readonly kind: "target-less-health" }
  /**
   * The effect's target has more health than the caster, absolute (#988):
   * Death's Charge's "if that foe has more Health than you". Equal is not
   * more.
   */
  | { readonly kind: "target-more-health" }
  /**
   * The effect's target is alive and attacking (#988): an auto-attack
   * swinging, not walking to its foe, or an attack skill being activated,
   * as Shadow Refuge's "if you are attacking".
   */
  | { readonly kind: "target-attacking" }
  /**
   * The exact negation of `target-attacking` (#1654), as `target-not-moving`
   * is of `target-moving`: Warmonger's Weapon's "if that foe is not attacking".
   */
  | { readonly kind: "target-not-attacking" }
  /**
   * One of `conditions` holds, each read as it would be alone (#1539):
   * Melandru's Shot's "if target foe is moving or knocked down". An
   * empty list never holds.
   */
  | { readonly kind: "any-of"; readonly conditions: readonly StateCondition[] }
  /**
   * `condition` does not hold, read at the same moment it would be (#1670):
   * Test of Faith's "if target foe is not enchanted". New negations use
   * this rather than a kind of their own.
   */
  | { readonly kind: "not"; readonly condition: StateCondition }
  /**
   * The effect's target is a summoned creature (#1528): a minion or a
   * spirit, never a pet or a map NPC (`isSummoned`). Banish's "double
   * damage if target foe is a summoned creature".
   */
  | { readonly kind: "target-is-summoned" }
  /**
   * The effect's target is activating a spell (`isSpell`) or is attacking
   * (#1511), either once: Signet of Rejuvenation's "casting a spell or
   * attacking". An attack held while a spell is cast counts once.
   */
  | { readonly kind: "target-casting-or-attacking" }
  /**
   * No living spirit, any team's, stands within `radius` of the caster
   * (#1064): Spirit Light's sacrifice, which it skips near one.
   */
  | { readonly kind: "caster-no-spirit-within"; readonly radius: number }
  /**
   * A living spirit, any team's, stands within `radius` of the caster
   * (#1270): Spirit Burn's and Essence Strike's "if any spirits are within
   * earshot". The twin of `caster-no-spirit-within`.
   */
  | { readonly kind: "caster-spirit-within"; readonly radius: number }
  /**
   * A living spirit, any team's, or a fresh corpse lies within `radius` of
   * the caster (#1270): Lamentation's "within earshot of a spirit or
   * corpse". The corpse is not exploited.
   */
  | { readonly kind: "caster-spirit-or-corpse-within"; readonly radius: number };

export type EffectCondition = EventCondition | StateCondition;

/**
 * Effects that land only if a condition holds for the same target: an
 * earlier effect of the skill did something to it (#521), as Power
 * Spike's damage if it interrupted a spell, or it or the caster stands
 * a certain way (#794), as Word of Healing's more if the ally is below
 * half health. Evaluated per target.
 */
export interface ConditionalEffect {
  readonly kind: "if";
  readonly condition: EffectCondition;
  /** Applied only when the condition holds. No nesting. */
  readonly effects: readonly UnconditionalEffect[];
}

/** Every effect but `if`: what an `if` may hold. */
export type UnconditionalEffect =
  | DamageEffect
  | HealEffect
  | EnergyGainEffect
  | AdrenalineGainEffect
  | EnergyLossEffect
  | EnergyStealEffect
  | LifeStealEffect
  | StealFromCorpseEffect
  | SacrificeHealthEffect
  | LoseHealthEffect
  | LoseHealthToEffect
  | TransferConditionsEffect
  | SpreadConditionsEffect
  | GiveHealthEffect
  | ApplyStatusEffect
  | MaintainStatusEffect
  | RemoveStatusEffect
  | InterruptEffect
  | KnockdownEffect
  | ShadowStepEffect
  | ResurrectEffect
  | ResurrectCompanionsEffect
  | DrainOwnEnergyEffect
  | OvercastEffect
  | CasterGainsStatusEffect
  | CompanionGainsStatusEffect
  | CompanionStepsToTargetEffect
  | RechargeFasterEffect
  | RechargeResetEffect
  | SplashEffect
  | PullToCasterEffect
  | DestroyTargetSpiritEffect
  | DrainNearestSpiritEffect
  | DestroyTargetMinionEffect
  | OwnerGainsDamageDealtEffect
  | DestroyAlliedSpiritsEffect
  | RechargeOthersEffect
  | DisableSkillEffect
  | CopyRemovedEffect
  | CopyDisabledEffect
  | CopyEliteEffect
  | LengthenRechargeEffect
  | DisableOwnSkillsEffect
  | ChainMarkEffect
  | SummonEffect
  | TakeControlEffect
  | CreateGroundEffect;

export type SkillEffect = UnconditionalEffect | ConditionalEffect;

/* -------------------------------------------------------------------------- */
/* Skills                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * What kind of skill this is, as GW1 names it. Shown to the player as a
 * badge, so a skill's nature reads by shape rather than by colour (#75).
 * An attack skill is also a blow of its weapon (ADR-0029).
 */
export type SkillType =
  | "attack"
  | "spell"
  | "enchantment"
  | "hex"
  | "signet"
  | "shout"
  | "stance"
  | "preparation"
  | "glyph"
  | "chant"
  /**
   * A Paragon's echo (#1423): a single-ally buff that renews or fires
   * whenever a chant or shout ends on its bearer. Not a spell.
   */
  | "echo"
  | "weapon-spell"
  | "nature-ritual"
  | "binding-ritual"
  | "ward"
  | "well"
  /**
   * A Ritualist's item spell (#1434): ashes held for a bonus, a drop
   * effect when they fall. A spell, and a bundle in the hands.
   */
  | "item-spell"
  | "trap"
  | "pet-attack"
  /** A GW1 form (#1437): a status of its own on the caster, never an enchantment. */
  | "form"
  | "skill";

/**
 * Whether a skill of this type is a spell, as GW1's rules that "affect
 * spells" mean it: enchantments, hexes, weapon spells, wards (#1087), wells
 * (#1104) and item spells (#1434) are spells,
 * signets, shouts, chants, stances and glyphs are not (#524, #526, #527,
 * #758). Every such rule asks this, never the type directly.
 */
export function isSpell(type: SkillType): boolean {
  return (
    type === "spell" ||
    type === "enchantment" ||
    type === "hex" ||
    type === "weapon-spell" ||
    type === "ward" ||
    type === "well" ||
    type === "item-spell"
  );
}

/**
 * Whether `combatant` loses no health and gains no hex or condition now
 * (#1208, a shrine raise's 5 s). Every site that takes health asks this.
 */
export function isInvulnerable(combatant: Combatant): boolean {
  return combatant.invulnerableRemaining > 0;
}

/**
 * Whether a skill is interrupted by any attack that lands on its user
 * while it is being used (#1105, GW1's "easily interrupted"): a trap is,
 * and a skill that says so (#1629), as Precision Shot.
 */
export function isEasilyInterrupted(skill: Skill): boolean {
  return skill.type === "trap" || skill.easilyInterrupted === true;
}

/**
 * The weapon an attack skill needs (ADR-0029). `melee` is any of the six
 * melee weapons, not fists; `bow` is any of the five bows.
 */
export type AttackWeaponClass =
  "axe" | "sword" | "hammer" | "daggers" | "scythe" | "spear" | "bow" | "melee";

/** Bonus damage an attack skill adds only while `condition` holds (#794). */
export interface ConditionalBonus {
  readonly condition: StateCondition;
  readonly amount: Magnitude;
}

/** A thrown attack's faster flight (#1486). */
export interface FlightSpeed {
  readonly multiplier: number;
  /** Read at release, the attacker as caster; `undefined`: always. */
  readonly when: StateCondition | undefined;
}

/**
 * An attack skill's blows on each victim: 1, 2, or two but one while a
 * state holds (#1914), read at release with the attacker as the caster:
 * Forked Arrow's "if you are enchanted or hexed, only one arrow".
 */
export type Strikes = 1 | 2 | { readonly count: 2; readonly oneWhile: StateCondition };

/** What makes an attack skill a blow of its weapon (ADR-0029). */
export interface AttackSkillRule {
  readonly weapon: AttackWeaponClass;
  /**
   * What the weapon's roll is multiplied by: 1 for a blow of the weapon,
   * 0 for one that deals no damage but still hits (Distracting Blow).
   */
  readonly weaponDamage: number;
  /** Added to the weapon's roll before armor; `undefined`: no bonus. */
  readonly bonusDamage: Magnitude | undefined;
  /**
   * While this holds for the caster as the skill hits, its cleave takes
   * every living foe adjacent to its target, not the weapon's
   * `cleaveTargets` (#1021): Eremite's Attack's "strike all adjacent
   * foes". Read once, with the primary as the target. A weapon that does
   * not cleave does not start to. Absent: the weapon's cap.
   */
  readonly cleavesAllWhen?: StateCondition;
  /**
   * The blow's damage type instead of the weapon's (#923): Spear of
   * Lightning's whole blow is lightning, weapon and bonus alike.
   * `undefined`: the weapon's.
   */
  readonly damageType: DamageType | undefined;
  /**
   * GW1 base armor penetration (#923), as Spear of Lightning's "25% armor
   * penetration". Base penetration does not stack: the blow takes the
   * larger of this and Strength's. 0: none of its own.
   */
  readonly armorPenetration: number;
  /**
   * More bonus while a state holds (#794), read as each blow lands on its
   * victim, and added to that blow: Mystic Sweep's "If you are enchanted,
   * +10 damage". One damage number, not a second hit. `undefined`: none.
   */
  readonly conditionalBonus: ConditionalBonus | undefined;
  /**
   * More bonus for each of a count, read as the skill's blow is made
   * (#1957), capped at its `max`: Enraged Lunge's "+3...23 damage for
   * each of your Beast Mastery skills that is recharging". Absent: none.
   */
  readonly bonusPer?: PerCount;
  /**
   * When a blow of it is a critical hit whatever the roll (#1315):
   * `"always"`, Critical Strike's "results in a critical hit"; a
   * condition, read as each blow lands on its victim as
   * `conditionalBonus` is, Malicious Strike's "hits a foe suffering from
   * a condition". A blocked or missed blow is none. `undefined`: only the
   * roll.
   */
  readonly criticalWhen: StateCondition | "always" | undefined;
  /**
   * How many blows it strikes each victim (#885): 2 for a dual attack,
   * each rolling its own blind, block, crit and damage, with the skill's
   * effects on each that hits. A ranged attack skill flies once: 1.
   */
  readonly strikes: Strikes;
  /**
   * Whether no block stops it (Wild Throw's "This attack cannot be
   * blocked"), or while which state holds (#1354), read per blow as its
   * block is rolled, with the attacker as the caster: Pure Strike's "if
   * you are not using a stance, Pure Strike cannot be blocked".
   */
  readonly unblockable: boolean | StateCondition;
  /**
   * What a blocked blow does to its target instead of the skill's
   * `effects` (#534): Swift Chop's damage and Deep Wound. Usually none.
   */
  readonly onBlocked: readonly SkillEffect[];
  /**
   * GW1's "all your preparations are removed" (#1629): Barrage's and
   * Volley's. Its user's preparations end as it is released, before its
   * blows or shots, so none rides them. Absent: they stay.
   */
  readonly removesPreparations?: true;
  /**
   * How much faster than its weapon's shot it flies (#1486): Mighty
   * Throw's "three times faster". Read at release; a melee blow ignores
   * it. `undefined`: the weapon's speed.
   */
  readonly flightSpeed: FlightSpeed | undefined;
  /**
   * What a blow of it that is a critical hit, rolled or forced, does to
   * its victim after `effects` (#1486): Vicious Attack's "if you land a
   * critical hit with this attack". A blocked blow is no critical.
   */
  readonly onCritical: readonly SkillEffect[];
  /**
   * What a blow of it that fails to hit does, its intended victim the
   * target (#1486): a blind miss, a block (after `onBlocked`), a dodge
   * or an obstruction. Spear of Redemption's "if it fails to hit, you
   * lose one condition". A melee chain attack out of sequence fails too,
   * once for the use (#1757): Repeating Strike's "if it misses". A victim
   * that died in flight is neither.
   */
  readonly onFailedToHit: readonly SkillEffect[];
  /** Its place in a dagger chain (#831); `undefined`: not a chain attack. */
  readonly chain: ChainStep | undefined;
}

/**
 * A pet attack's blow (#1046): its owner pays, and its pet's next blow
 * is it, of the pet's own weapon, the owner's unused.
 */
export type PetAttackRule = Omit<AttackSkillRule, "weapon">;

/** How long a pet attack waits for its pet's next blow (#1046). */
export const PET_ATTACK_SECONDS = 10;

/**
 * What makes `skill` a blow (#1046): an attack skill's rule, or a pet
 * attack's, its weapon the pet's own. `undefined` for any other skill.
 */
export function blowRuleOf(skill: Skill): PetAttackRule | undefined {
  return skill.attack ?? skill.petAttack;
}

/** GW1's dagger chain: a lead attack, then an off-hand, then a dual (#831). */
export type ChainRole = "lead" | "off-hand" | "dual";

/** Where a chain attack stands in its chain (#831). */
export interface ChainStep {
  readonly role: ChainRole;
  /**
   * The mark of yours its target must bear for it to hit, as Fox Fangs'
   * "Must follow a lead attack"; `undefined`: it may open a chain.
   */
  readonly follows: ChainRole | undefined;
  /**
   * A state that must hold for it to hit, read per victim with
   * `stateHolds` before its first blow (#1041): Falling Spider's "Must
   * strike a knocked-down foe". Unmet, it misses out of sequence, as an
   * unmet `follows` does. Absent: no requirement but `follows`.
   */
  readonly requires?: StateCondition;
}

/** A chain mark one attacker left on one target (#831). */
export interface ChainMark {
  readonly role: ChainRole;
  remainingSeconds: number;
}

/** A skill's faster or slower activation while its caster holds, or lacks, a status (#1916). */
export interface ActivationWhile {
  readonly condition: Extract<StateCondition, { kind: "caster-has" | "caster-lacks" }>;
  readonly multiplier: number;
}

export interface Skill {
  readonly id: string;
  readonly name: string;
  readonly type: SkillType;
  /**
   * GW1's own skill id, the PvE (base) record's, as template codes use it
   * (#458): a PvP split takes the base id. `undefined` only for a skill
   * this game made up (Vital Transfer).
   */
  readonly gwId: number | undefined;
  /**
   * A GW1 elite skill (#459): drawn with a gold frame, and at most one
   * per bar (`validatePlayerBuild`).
   */
  readonly elite: boolean;
  /**
   * A GW1 flash enchantment (#1421): instant, it keeps the caster's swing
   * and stride, and disables the caster's other flash skills for
   * `FLASH_LOCKOUT_SECONDS`. Always a 0 s enchantment on the caster.
   */
  readonly flash: boolean;
  /**
   * GW1's "This skill is disabled for N seconds" (#1437): used, it is
   * disabled this long, beyond the recharge it shows. A longer recharge
   * left is kept. `undefined`: only its recharge.
   */
  readonly disabledAfterUseSeconds: number | undefined;
  /**
   * The profession this skill belongs to, and therefore who may equip it:
   * a character whose primary or secondary it is (brief §6's skill shape).
   *
   * Stated explicitly rather than inferred from the effect list: a skill
   * whose effects are not attribute-scaled (a pure interrupt, say) still
   * belongs to a profession, and inferring it would wrongly make such
   * skills equippable by everyone — a real bug this field replaced.
   * `"common"` may be equipped by everyone (#474): Resurrection Signet.
   */
  readonly profession: SkillProfession;
  /**
   * The attribute of `profession` it is linked to; `undefined` for GW1's
   * "No Attribute" skills, whose numbers are written for rank 0 (#445).
   */
  readonly attributeId: string | undefined;
  readonly cost: SkillCost | undefined;
  /**
   * Maximum energy it takes away when activation starts, on top of its
   * cost (#461): GW1's overcast, once called exhaustion. `0` for none.
   */
  readonly overcast: number;
  /** Cast time in seconds. `0` is instant. */
  readonly activationSeconds: number;
  readonly rechargeSeconds: number;
  /**
   * GW1's "only recharges when you gain a morale boost" (#474): used, it is
   * spent rather than recharging, until `CastState.refreshSpent`.
   * `rechargeSeconds` is 0. Absent: it recharges by time, as every other skill.
   */
  readonly rechargesOnMoraleBoost?: true;
  /**
   * A map NPC's own action, as King of the Hill's Claim Resource
   * (#1377): never listed for a player, and refused on a player's bar.
   * Absent: a player's skill.
   */
  readonly npcOnly?: true;
  /**
   * GW1's "this action is easily interrupted" (#1629): any attack that
   * lands on its user while it is being used interrupts it, as a trap's.
   * Absent: only what interrupts any skill does.
   */
  readonly easilyInterrupted?: true;
  /**
   * A touch skill (#1966): its corpus text has its user touch the target,
   * "target touched foe". What "Can't Touch This!" fails. Absent: not one.
   */
  readonly touch?: true;
  /**
   * GW1's "Health gain from Divine Favor is doubled for this spell"
   * (#1754): Healing Touch's. Absent: the normal bonus.
   */
  readonly divineFavorDoubled?: true;
  /**
   * Its activation times `multiplier` while `condition` holds for its
   * caster as the activation starts (#1916): Natural Healing's "activates
   * 50% faster if you are not enchanted". Absent: no such change.
   */
  readonly activationWhile?: ActivationWhile;
  /** Maximum distance to target, in world units. */
  readonly range: number;
  /** What must be selected, and whether the cast is legal. */
  readonly target: TargetRule;
  /** Who else is caught once it lands. `undefined`: only the target. */
  readonly area: AreaRule | undefined;
  /** Set exactly when `type === "attack"` (ADR-0029). */
  readonly attack: AttackSkillRule | undefined;
  /** Set exactly when `type === "pet-attack"` (#1046); `attack` is then `undefined`. */
  readonly petAttack: PetAttackRule | undefined;
  /**
   * A status the caster bears while activating it, gone the moment the
   * cast ends however it ends (#524): Healing Signet's armor loss.
   */
  readonly whileActivating: StatusId | undefined;
  /**
   * A spell that flies (#535): at cast completion it leaves the caster as
   * a led shot, and its effects and area land with it, or not at all if
   * it is dodged. `undefined`: it lands at once.
   */
  readonly projectile: SkillProjectile | undefined;
  /** `undefined`: it needs no corpse. */
  readonly corpse: CorpseRule | undefined;
  /**
   * The creature this skill brings while it is on its owner's bar (#1046),
   * as Charm Animal's "travels with you whenever you have Charm Animal
   * equipped"; `undefined`: none. Such a skill is never cast in a match.
   */
  readonly companion: CreatureTemplate | undefined;
  readonly effects: readonly SkillEffect[];
}

/** A skill that exploits a corpse (#466): Soul Feast, later wells and minions. */
export interface CorpseRule {
  /** The nearest fresh corpse within this of the caster, world units. */
  readonly radius: number;
  /**
   * `target`: nearest the cast's target instead, within `radius` of it
   * (#1583): Putrid Explosion's "the corpse nearest your target". Absent:
   * nearest the caster.
   */
  readonly near?: "target";
  /**
   * Every fresh corpse within `radius` of the caster, not the nearest
   * (#1915): Aura of the Lich's "exploit all fresh corpses in earshot".
   * It needs none: with none, the skill still goes off.
   */
  readonly all?: true;
  /**
   * A well's "or sacrifice 66% health" (#1730): with no fresh corpse in
   * reach as it resolves, the caster sacrifices this % of its max Health
   * and the skill goes off where it stands. `undefined`: no corpse, no
   * use.
   */
  readonly elseSacrificePercent: number | undefined;
}

/** How a flying spell flies (#535). */
export interface SkillProjectile {
  /**
   * World units per second. GW1 publishes no spell speeds, so these are
   * this project's tuning.
   */
  readonly speed: number;
  /**
   * How many it fires at the one target (#1914), each its own flight and
   * dodge, its effects landing with each: Dancing Daggers' "three
   * daggers". Absent: one.
   */
  readonly shots?: number;
  /**
   * One shot at each target the area finds as it leaves, the primary
   * first, each landing the effects on its own victim and splashing no
   * one (#1914): Lava Arrows' "an arrow at up to 3 foes near the target".
   * Absent: one shot at the primary target, the area landing round it.
   */
  readonly spread?: true;
}

/**
 * An area a skill also hits (ADR-0018). Orthogonal to `target`: Fireball
 * is still a legal-single-enemy spell, with a splash.
 */
export type AreaRule = RadiusArea | PartyArea;

/** Everyone on a side within `radius` of the caster or the target (ADR-0018). */
export interface RadiusArea {
  readonly radius: number;
  /** Centred on the caster, or on the target it was cast at. */
  readonly origin: "caster" | "target";
  readonly affects: "enemies" | "allies" | "all";
  /** At most this many hit, the primary target included. */
  readonly maxTargets: number | undefined;
  /** Whether the caster can be caught in its own area. */
  readonly includesCaster: boolean;
}

/**
 * The caster and every living combatant on its team, at any distance and
 * through walls (#1013): Heal Party's "entire party". GW1's party is the
 * team here.
 */
export interface PartyArea {
  readonly origin: "party";
}

/* -------------------------------------------------------------------------- */
/* Simulation-facing combatant view                                            */
/* -------------------------------------------------------------------------- */

/**
 * What the skill engine needs to know about a combatant. Deliberately a
 * narrow interface rather than the full match entity: the engine does not
 * know about wire messages, peers, or rendering.
 */
export interface Combatant {
  readonly id: string;
  health: number;
  /** After morale (#843): the simulation sets it when morale moves. */
  maxHealth: number;
  energy: number;
  /** After morale (#843), as `maxHealth`. */
  maxEnergy: number;
  /**
   * Morale in percent (#843, GW1), in [`MORALE_FLOOR`, `MORALE_CEILING`]:
   * the death penalty below 0, a boost above. Kept across a respawn.
   */
  morale: number;
  /**
   * Maximum energy lost to overcast (#461), recovering over time; the
   * ceiling energy fills to is `maxEnergy − overcast`, and may be below 0.
   */
  overcast: number;
  /** Energy regeneration before statuses, in pips (`ENERGY_PER_PIP`). */
  readonly baseEnergyPips: number;
  /**
   * Units per adrenaline skill on the bar (#463), keyed like
   * `cast.rechargeRemaining`. Exactly the bar's adrenaline skills are keys,
   * set at 0 when the combatant is made, and a copy's while it stands (#469).
   */
  readonly adrenaline: Map<string, number>;
  /**
   * When this combatant was last in combat for its adrenaline (#828), in
   * seconds of match time: a blow or attack skill started, damage taken
   * from a foe, or adrenaline gained. Set when made and on a respawn;
   * `adrenalineLossSeconds` after it, every pool empties.
   */
  lastCombatAt: number;
  /** The bar it was made with (#914): what Power Block reads to disable a whole attribute. */
  readonly skillBar: SkillBar;
  /** Attribute ranks by attribute id; absent means rank 0. */
  readonly attributeRanks: ReadonlyMap<string, number>;
  /**
   * While a spell that borrows an attribute resolves (#1929), Signet of
   * Illusions': its own attribute `from` reads the rank in `to`. Set and
   * cleared around that resolution by `withRankLoan`; `null`
   * otherwise.
   */
  borrowedAttribute: { readonly from: string; readonly to: string } | null;
  /**
   * While a skill resolves (#1941), the attribute deltas of the statuses
   * its start spent, Glyph of Elemental Power's last spell's +2: set and
   * cleared around it by `withRankLoan`; empty otherwise.
   */
  heldAttributeDeltas: readonly AttributeDelta[];
  /** A spirit someone takes control of changes sides (#1965). */
  team: number;
  /** Set once health reaches 0; a dead combatant is skipped by the simulation. */
  dead: boolean;
  /** Active conditions, hexes and enchantments. */
  readonly statuses: StatusSet;
  /** In-progress cast and per-skill recharge; also the interrupt target. */
  readonly cast: CastState;
  /**
   * The weapon auto-attack in progress, if any (ADR-0026). Lives next to
   * `cast` because a cast pauses it and resets its swing.
   */
  attack: AttackState | undefined;
  /**
   * Seconds left lying down from a knockdown (#468); `0` standing. A
   * state of its own rather than a status, so nothing that removes
   * statuses can stand anyone up.
   */
  knockdownRemaining: number;
  /**
   * Seconds left invulnerable after a shrine raised it (#1208); `0` not.
   * Still a target, still healed, enchanted, knocked down and
   * interrupted: only health loss, hexes and conditions are refused
   * (`isInvulnerable`).
   */
  invulnerableRemaining: number;
  /**
   * Match times Soul Reaping last triggered (#530), at most the 3 that can
   * still count against the next. Kept across a respawn.
   */
  soulReapingTriggers: readonly number[];
  /**
   * The `seq` its next maintained enchantment gets (#837): one more than
   * its last, so its newest and its oldest can be told apart.
   */
  nextMaintainSeq: number;
  /**
   * Chain marks this combatant placed, by target id (#831): what its next
   * off-hand attack on each may follow.
   */
  readonly chainMarks: Map<string, ChainMark>;
  /**
   * It walked during the previous tick (#921): its position changed from
   * that tick's start to its end. Written for everyone at the end of each
   * tick, so it reads the same whoever resolves first, one tick late.
   * Knocked down, in aftercast, dead or walking into a wall: not moving.
   * A respawn or a reset clears it.
   */
  moving: boolean;
  /**
   * Its living minions, spirits (#1188) and pets (#1206), counted by the
   * simulation at the start of each tick: what Minion Master's, Shaman's
   * and Beastmaster's insignias read.
   */
  readonly controlled: Record<"minion" | "spirit" | "pet", number>;
  /**
   * Weapon, armor and rune effects of the weapon set in hand, already
   * resolved (ADR-0012, ADR-0036).
   *
   * Every set was resolved once before this combatant was built, and a
   * weapon swap only points this at another of them: the simulation's
   * swap is its one writer, and nothing is ever resolved again, which is
   * what guarantees a rune cannot be applied twice.
   */
  equipment: ResolvedEquipment;
  /**
   * A Guild Lord's Bodyguard cut and per-second cap on the Health it
   * loses (#1223); `undefined` for anyone else. The simulation sets it.
   */
  lossGuard: HealthLossGuard | undefined;
}

export interface SkillContext {
  readonly caster: Combatant;
  readonly target: Combatant | undefined;
  readonly rng: SimulationRng;
  /**
   * Combat numbers, threaded rather than imported.
   *
   * `game-core` must not pick a ruleset on the caller's behalf — the
   * whole point of the abstraction (brief §11) is that a balance
   * experiment is a different object, not a different build.
   */
  readonly rules: CombatRules;
  /**
   * Everyone in the match by id, where they stand (#885): what a splash
   * and "target is alone" read. Not a target list: who an area hits is
   * `resolveTargets`'.
   */
  readonly surroundings: Surroundings;
  /**
   * The skill the target just used, and the key it waits under (#469),
   * when a status's trigger answers that use (#949): what
   * `lengthen-recharge` lengthens. Absent elsewhere.
   */
  readonly usedSkill?: SlotSkill | undefined;
  /**
   * The skill landing (#1511), when one does rather than a status's
   * trigger: what `disable-own-skills` `attribute` spares. Absent elsewhere.
   */
  readonly skillId?: string | undefined;
  /**
   * The status whose trigger these effects are (#1473): what
   * `target-lacks-other-hex` does not count. Absent outside a trigger.
   */
  readonly firingStatusId?: StatusId | undefined;
  /**
   * The profession of the skill, or of the status whose trigger fires
   * (#1464), whose effects these are: which `skillArmorPenetration` its
   * damage takes. Absent for what is no skill's.
   */
  readonly profession?: SkillProfession | undefined;
  /**
   * What the caster's statuses do to the skill landing (#1761):
   * `SkillResolution.own`. Absent for a trigger, which is no use.
   */
  readonly own?: OwnSkillBoost | undefined;
  /**
   * Whose attribute ranks scale the statuses these effects put on (#1976),
   * when not the caster's: Mirrored Stance's copy takes the foe's (#1965).
   */
  readonly ranksFrom?: Combatant | undefined;
}

/**
 * One body in `Surroundings`: a target candidate, and whether its corpse
 * was exploited (#1270), so a condition can ask for a fresh corpse.
 */
export interface SurroundingBody extends TargetCandidate {
  readonly corpseExploited: boolean;
}

/** Everyone in the match by id, where they stand (#885). */
export type Surroundings = ReadonlyMap<string, SurroundingBody>;
