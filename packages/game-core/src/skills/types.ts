import type { SimulationRng } from "../rng.js";
import type { CombatRules } from "../ruleset.js";

import type { ResolvedEquipment } from "../equipment/resolve.js";
import type { SkillBar } from "../build.js";
import type { DamageType } from "../equipment/types.js";
import type { Behaviour } from "../match/behaviour.js";
import type { CreatureKind } from "../match/simulation.js";
import type { ProfessionId, SkillProfession } from "../professions.js";
import type { CastState, SlotSkill } from "./cast-state.js";
import type { TargetCandidate } from "./targeting.js";
import type { AttackState } from "./weapon-attack.js";
import type { StatusCategory, StatusId, StatusSet } from "./status.js";

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

/** A magnitude that is either flat or attribute-scaled. */
export type Magnitude = { readonly flat: number } | { readonly scaling: AttributeScaling };

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
  /** The caster's own companion, alive or dead, whatever is selected (#1046). */
  | "companion";

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
}

export interface HealEffect {
  readonly kind: "heal";
  readonly amount: Magnitude;
  /**
   * `caster`: the caster is healed, as Drain Enchantment's "you gain N
   * Health" (#521). Absent: the target.
   */
  readonly recipient?: "caster";
  /**
   * With categories, the amount is per status of those categories the
   * target bears as the heal lands, as Dwayna's Kiss's "10...30 Health
   * for each enchantment or hex on that ally" (#920). Empty: once.
   */
  readonly perStatusOnTarget: readonly StatusCategory[];
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
}

/** Leader's Comfort's heal per ally in earshot (#923). */
export interface PerAllyHeal {
  readonly amount: Magnitude;
  readonly radius: number;
  readonly max: number;
}

export interface EnergyGainEffect {
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
}

/**
 * The caster gains `strikes` strikes of adrenaline in every adrenaline
 * skill that is not recharging, each capped at its cost, as a hit's
 * strike (#977). `perTarget`: once for each target the skill hit, as
 * Zealous Sweep's "1 strike of adrenaline for each foe you hit".
 */
export interface AdrenalineGainEffect {
  readonly kind: "adrenaline-gain";
  readonly strikes: number;
  readonly perTarget?: true;
}

/** The effect's target loses up to `amount` energy (never below 0). */
export interface EnergyLossEffect {
  readonly kind: "energy-loss";
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
 * a sacrifice.
 */
export interface LoseHealthEffect {
  readonly kind: "lose-health";
  readonly amount: Magnitude;
  readonly perRemovedOfProfession: ProfessionId;
}

/**
 * Move up to `count` of the caster's conditions, newest first, onto the
 * target, each with the time it had left on the caster (#944), as Plague
 * Touch's. Each lands as any condition the caster put on: the longer
 * duration wins.
 */
export interface TransferConditionsEffect {
  readonly kind: "transfer-conditions";
  readonly count: number;
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

/** Apply a condition/hex/enchantment to the effect's target. */
export interface ApplyStatusEffect {
  readonly kind: "apply-status";
  readonly statusId: StatusId;
  readonly durationSeconds: number;
}

/**
 * Maintain an enchantment on the target (#837): it lasts until something
 * ends it, and costs its caster an energy pip while it does.
 */
export interface MaintainStatusEffect {
  readonly kind: "maintain-status";
  readonly statusId: StatusId;
}

/** Remove up to `count` statuses of a category from the target. */
export interface RemoveStatusEffect {
  readonly kind: "remove-status";
  readonly category: StatusCategory;
  readonly count: number;
  /**
   * Only statuses of this profession (`StatusDefinition.profession`), as
   * "lose 1 Dervish enchantment" (#845). Absent: any.
   */
  readonly profession?: ProfessionId;
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
 * Interrupt the target's in-progress cast (brief §14). Only lands if the
 * target is actually casting — a mistimed interrupt is wasted, which is
 * the entire skill-expression point of the mechanic.
 */
export interface InterruptEffect {
  readonly kind: "interrupt";
  /**
   * `spell`: only a spell (`isSpell`) is interrupted, as Concussion
   * Shot's "while target foe is casting a spell" (#1008); a chant is
   * not one. `spell-or-chant`: a spell or a chant, as Power Spike's
   * "If target foe is casting a Spell or Chant" (#521). Anything else
   * is left alone, as if the target were not casting.
   */
  readonly only?: "spell" | "spell-or-chant";
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
 * Charge's "Shadow Step to target foe". The effect layer only reports it
 * (`shadow-stepped`); the simulation places the body.
 */
export interface ShadowStepEffect {
  readonly kind: "shadow-step";
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
 * Apply `effects` to every foe of the caster within `radius` of the
 * effect's target, the target itself excluded (#885), as Death Blossom's
 * "all adjacent foes take 20...40 damage". Not a blow: no block, no crit
 * and no chain mark on a foe it reaches.
 */
export interface SplashEffect {
  readonly kind: "splash";
  readonly radius: number;
  readonly effects: readonly UnconditionalEffect[];
}

/**
 * Every other skill of the caster of this type recharges at once (#885),
 * as Moebius Strike's "all your other attack skills are recharged". Acts
 * on the caster, once.
 */
export interface RechargeOthersEffect {
  readonly kind: "recharge-others";
  readonly which: "attack";
}

/**
 * Disable the skill this resolution interrupted on the target (#914): it
 * cannot be used for `seconds`, running alongside its recharge, as
 * Distracting Shot's "that skill is disabled for an additional 20
 * seconds". With `interrupted-and-attribute`, every skill on the
 * target's bar of the same attribute too, as Power Block's; a skill with
 * no attribute disables only itself. Nothing interrupted: nothing. With
 * `all`, every skill on the target's bar, nothing interrupted needed
 * (#474): Rebirth's "all of target's skills are disabled".
 */
export interface DisableSkillEffect {
  readonly kind: "disable-skill";
  readonly which: "interrupted" | "interrupted-and-attribute" | "all";
  readonly seconds: Magnitude;
}

/**
 * The skill its target just used takes `seconds` longer to recharge
 * (#949), as Diversion's "the next time target foe uses a skill, that
 * skill takes an additional 47 seconds to recharge". Recharge, not a
 * disable: what ends a recharge ends it. No skill just used: nothing.
 */
export interface LengthenRechargeEffect {
  readonly kind: "lengthen-recharge";
  readonly seconds: Magnitude;
}

/**
 * What a `summon` makes (#1052, ADR-0035): a body that is not a player,
 * with health, armor and a team, and no skill bar, attributes or energy.
 */
export interface CreatureTemplate {
  readonly kind: CreatureKind;
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
}

/**
 * A creature's melee or ranged blow (#467 child 3), as a weapon's numbers.
 * `damageMin`–`damageMax` is what it deals with its summoner at rank 12 in
 * `attributeId`, against armor 60. The summoner's rank, read once at
 * summoning, scales every blow as weapon mastery scales a player's
 * (`weaponAttributeMultiplier`): ×1 at 12, ×0.35 at 0.
 */
export interface CreatureAttack {
  readonly attributeId: string;
  readonly damageMin: number;
  readonly damageMax: number;
  readonly damageType: DamageType;
  readonly attackIntervalSeconds: number;
  readonly range: number;
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
 * Summon `count` creatures at the caster, on the caster's team, owned by
 * it (#1052). Acts on the caster, once. A match holds at most
 * `MAX_CREATURES`: past it, as many as fit, possibly none.
 */
export interface SummonEffect {
  readonly kind: "summon";
  readonly creature: CreatureTemplate;
  readonly count: number;
}

/**
 * A trap's rule (#1105): the first step a living foe's centre is within
 * `triggerRadius` of it, `effects` land on whoever `area` takes around
 * the trap, from its owner, and the trap is gone.
 */
export interface TrapRule {
  /** A foe's centre this close springs it. */
  readonly triggerRadius: number;
  /** Who the spring hits; `origin: "caster"` means the trap's position. */
  readonly area: AreaRule;
  readonly effects: readonly SkillEffect[];
}

/**
 * What a ground effect does while it lasts: a ward projects an aura
 * (#1087), a trap waits for a foe to spring it (#1105).
 */
export type GroundAct =
  | { readonly kind: "aura"; readonly aura: Aura }
  | { readonly kind: "trap"; readonly trap: TrapRule };

/**
 * Leave a ground effect where the caster stands as the skill lands
 * (#1087): a circle that is not a body, doing `act` for
 * `durationSeconds`. Acts on the caster, once. A match holds at most
 * `MAX_GROUND_EFFECTS`: past it, the oldest ends early.
 */
export interface CreateGroundEffect {
  readonly kind: "create-ground-effect";
  readonly anchor: "caster";
  readonly durationSeconds: Magnitude;
  readonly act: GroundAct;
}

/** How long "knocks down" lasts when a skill names no duration (GW1). */
export const KNOCKDOWN_SECONDS = 2;

/** What an earlier effect of the same skill did to the same target (#521). */
export type EventCondition =
  /** An `interrupt` earlier in the list cancelled an action. */
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
  /** The effect's target has at least one status of this category. */
  | { readonly kind: "target-has"; readonly category: StatusCategory }
  /** The effect's target is activating a spell (`isSpell`); a chant is not one. */
  | { readonly kind: "target-casting"; readonly spell: true }
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
   * No living ally of the effect's target, the target itself excluded,
   * stands within `radius` of it (#885): Horns of the Ox's "not adjacent
   * to any allies".
   */
  | { readonly kind: "target-alone"; readonly radius: number }
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
   * The caster's main hand is a weapon of this class (#939): Vow of
   * Strength's and Sand Shards' "with your scythe".
   */
  | { readonly kind: "caster-wields"; readonly weapon: AttackWeaponClass }
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
   * No living spirit, any team's, stands within `radius` of the caster
   * (#1064): Spirit Light's sacrifice, which it skips near one.
   */
  | { readonly kind: "caster-no-spirit-within"; readonly radius: number };

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
  | LifeStealEffect
  | StealFromCorpseEffect
  | SacrificeHealthEffect
  | LoseHealthEffect
  | TransferConditionsEffect
  | GiveHealthEffect
  | ApplyStatusEffect
  | MaintainStatusEffect
  | RemoveStatusEffect
  | InterruptEffect
  | KnockdownEffect
  | ShadowStepEffect
  | ResurrectEffect
  | DrainOwnEnergyEffect
  | RechargeFasterEffect
  | SplashEffect
  | RechargeOthersEffect
  | DisableSkillEffect
  | LengthenRechargeEffect
  | SummonEffect
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
  | "weapon-spell"
  | "nature-ritual"
  | "binding-ritual"
  | "ward"
  | "trap"
  | "skill";

/**
 * Whether a skill of this type is a spell, as GW1's rules that "affect
 * spells" mean it: enchantments, hexes, weapon spells and wards (#1087) are spells,
 * signets, shouts, chants, stances and glyphs are not (#524, #526, #527,
 * #758). Every such rule asks this, never the type directly.
 */
export function isSpell(type: SkillType): boolean {
  return (
    type === "spell" ||
    type === "enchantment" ||
    type === "hex" ||
    type === "weapon-spell" ||
    type === "ward"
  );
}

/**
 * Whether a skill of this type is interrupted by any attack that lands
 * on its user while it is being used (#1105, GW1's "easily
 * interrupted"): a trap is.
 */
export function isEasilyInterrupted(type: SkillType): boolean {
  return type === "trap";
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
   * How many blows it strikes each victim (#885): 2 for a dual attack,
   * each rolling its own blind, block, crit and damage, with the skill's
   * effects on each that hits. A ranged attack skill flies once: 1.
   */
  readonly strikes: 1 | 2;
  /** Whether no block stops it (Wild Throw's "This attack cannot be blocked"). */
  readonly unblockable: boolean;
  /**
   * What a blocked blow does to its target instead of the skill's
   * `effects` (#534): Swift Chop's damage and Deep Wound. Usually none.
   */
  readonly onBlocked: readonly SkillEffect[];
  /** Its place in a dagger chain (#831); `undefined`: not a chain attack. */
  readonly chain: ChainStep | undefined;
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

export interface Skill {
  readonly id: string;
  readonly name: string;
  readonly type: SkillType;
  /**
   * A GW1 elite skill (#459): drawn with a gold frame, and at most one
   * per bar (`validatePlayerBuild`).
   */
  readonly elite: boolean;
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
  /** Maximum distance to target, in world units. */
  readonly range: number;
  /** What must be selected, and whether the cast is legal. */
  readonly target: TargetRule;
  /** Who else is caught once it lands. `undefined`: only the target. */
  readonly area: AreaRule | undefined;
  /** Set exactly when `type === "attack"` (ADR-0029). */
  readonly attack: AttackSkillRule | undefined;
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
}

/** How a flying spell flies (#535). */
export interface SkillProjectile {
  /**
   * World units per second. GW1 publishes no spell speeds, so these are
   * this project's tuning.
   */
  readonly speed: number;
}

/**
 * An area a skill also hits (ADR-0018). Orthogonal to `target`: Fireball
 * is still a legal-single-enemy spell, with a splash.
 */
export interface AreaRule {
  readonly radius: number;
  /** Centred on the caster, or on the target it was cast at. */
  readonly origin: "caster" | "target";
  readonly affects: "enemies" | "allies" | "all";
  /** At most this many hit, the primary target included. */
  readonly maxTargets: number | undefined;
  /** Whether the caster can be caught in its own area. */
  readonly includesCaster: boolean;
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
  readonly team: number;
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
   * Weapon, armor and rune effects of the weapon set in hand, already
   * resolved (ADR-0012, ADR-0036).
   *
   * Every set was resolved once before this combatant was built, and a
   * weapon swap only points this at another of them: the simulation's
   * swap is its one writer, and nothing is ever resolved again, which is
   * what guarantees a rune cannot be applied twice.
   */
  equipment: ResolvedEquipment;
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
}

/** Everyone in the match by id, where they stand (#885). */
export type Surroundings = ReadonlyMap<string, TargetCandidate>;
