import type { SkillBar } from "../build.js";
import { wieldsFor } from "../equipment/weapons.js";
import { distanceWithinRange, hasLineOfSight, type Segment } from "../geometry.js";
import type { CreatureKind } from "../match/simulation.js";
import {
  EXPERTISE_ATTRIBUTE,
  MYSTICISM_ATTRIBUTE,
  expertiseEnergyCost,
  mysticismEnergyCost,
} from "../primary-attributes.js";
import type { Vec2 } from "../vec2.js";

import { canAffordAdrenaline, spendAdrenaline } from "./adrenaline.js";
import { resolvedBar } from "./cast-state.js";
import { getSkill } from "./catalog.js";
import { addOvercast } from "./overcast.js";
import {
  getStatusDefinition,
  nextSkillAnswers,
  ownSkillBoost,
  preventsAttacks,
  preventsEnchantments,
  preventsResurrection,
  preventsShoutsAndChants,
  preventsSpells,
  untargetableByFoeSpells,
} from "./status.js";
import { rankOf, type RankHolder } from "./tick.js";
import { isSpell, type Combatant, type Skill, type TargetRule } from "./types.js";

/**
 * Skill activation validation (brief §32: the server validates skill
 * availability, resource cost, cooldown, range, line of sight, and target
 * legality — a client only ever *requests* a cast).
 *
 * Every rejection is a named reason rather than a bare `false`, so the
 * server can log exactly why a cast was refused and a future UI can tell
 * the player ("out of range" vs "not enough energy" are very different
 * things to a player mid-fight).
 */

export type ActivationRejection =
  | "caster-dead"
  | "caster-knocked-down"
  | "skill-not-on-bar"
  | "still-recharging"
  | "spent-until-morale-boost"
  | "already-casting"
  | "wrong-weapon"
  | "insufficient-energy"
  | "insufficient-adrenaline"
  | "no-target"
  | "invalid-target-dead"
  | "invalid-target-alive"
  | "invalid-target-self"
  | "invalid-target-ally"
  | "invalid-target-enemy"
  // A spirit skill on anything but a living spirit of your team (#1309).
  | "invalid-target-not-allied-spirit"
  | "invalid-target-not-enemy-spirit"
  | "invalid-target-not-own-minion"
  | "invalid-target-not-allied-minion"
  // A summoned-creature skill on anything but a living spirit or minion of
  // your team (#1827).
  | "invalid-target-not-allied-summoned-creature"
  // An echo on a spirit (#1423): GW1's "Cannot target spirits".
  | "invalid-target-spirit"
  | "out-of-range"
  | "no-line-of-sight"
  // A corpse skill with no fresh corpse in reach (#466): checked by the
  // simulation, which knows where the bodies are.
  | "no-corpse"
  // Spirit Transfer with no spirit within earshot to drain (#1947):
  // checked by the simulation, which knows where the spirits stand.
  | "no-spirit"
  // Comfort Animal with no pet to act on (#1046).
  | "no-companion"
  // A pet attack with a dead pet, or one beyond earshot of its owner (#1046).
  | "companion-dead"
  | "companion-too-far"
  // A skill that brings a companion, as Charm Animal (#1046): no match has
  // an animal to charm, so it is never cast.
  | "no-animal-to-charm"
  // An ordinary resurrection on a creature, as a dead pet (#1046): checked
  // by the simulation, which knows who is one.
  | "invalid-target-creature"
  // A spell while a hex bars them, as Shroud of Silence's (#1234).
  | "cannot-cast-spells"
  // An attack or an attack skill while a status bars them, as Obsidian
  // Flesh's (#1575).
  | "cannot-attack"
  // A resurrection skill while a status bars them, as Frozen Soil's (#1745).
  | "cannot-resurrect"
  // A shout or a chant while a status bars them, as Well of Silence's (#1732).
  | "cannot-shout-or-chant"
  | "invalid-target-untargetable"
  // An enchantment spell at a target that can hold none, as Well of the
  // Profane's (#1732), the caster itself included.
  | "invalid-target-unenchantable"
  // Arcane Thievery at a foe with no spell on its bar to take (#1928).
  | "no-spells"
  // An attack or attack skill while carrying a flag (#1225): checked by
  // the simulation, which knows who carries one.
  | "hands-full"
  // Space on a flag or the stand that does nothing (#1225).
  | "not-your-flag"
  | "flag-on-stand"
  | "no-flag-carried"
  // Space on a foe's relic at its spawn (#1374); a return with a relic
  // in hand is `"hands-full"`.
  | "not-your-relic";

export type ActivationCheck =
  { readonly ok: true } | { readonly ok: false; readonly reason: ActivationRejection };

const OK: ActivationCheck = { ok: true };

/** Whether `skill` disables a spell of its target's at random (#1928): Arcane Thievery. */
function takesASpell(skill: Skill): boolean {
  return skill.effects.some(
    (effect) => effect.kind === "disable-skill" && effect.which === "random-spell",
  );
}

function reject(reason: ActivationRejection): ActivationCheck {
  return { ok: false, reason };
}

export interface ActivationRequest {
  readonly skill: Skill;
  readonly caster: Combatant;
  readonly casterPosition: Vec2;
  readonly target: Combatant | undefined;
  readonly targetPosition: Vec2 | undefined;
  /** What kind of creature the target is (#1309); `undefined` for a player or a dummy. */
  readonly targetCreatureKind: CreatureKind | undefined;
  /** Who made the target, when it is a creature (#1836): `undefined` for anyone else. */
  readonly targetCreatureOwnerId: string | undefined;
  /**
   * The key the slot used waits under (#469): a copy's, or the skill's
   * own id, which it is when left out.
   */
  readonly key?: string;
  /** Wait keys currently recharging for this caster, with seconds remaining. */
  readonly rechargeRemaining: ReadonlyMap<string, number>;
  /** Skill ids spent until a morale boost (#474): `CastState.spent`. */
  readonly spent: ReadonlySet<string>;
  /** True if the caster is mid-cast on something else. */
  readonly isCasting: boolean;
  /**
   * The caster's bar by slot, as keys (`resolvedBar`, #469): a skill whose
   * key is not on it can never be cast.
   */
  readonly skillBar: SkillBar;
  readonly losBlockers: readonly Segment[];
}

/**
 * Why `rule` refuses `target` for `caster`, by who each is, or `undefined`
 * when it allows it (#599). Liveness and range are not its business: the
 * activation check and the skill bar's range mark both ask this, so they
 * cannot disagree about who a skill may be cast on.
 */
export function targetRuleAllows(
  rule: TargetRule,
  caster: Pick<Combatant, "id" | "team">,
  target: Pick<Combatant, "id" | "team"> & {
    readonly creatureKind: CreatureKind | undefined;
    readonly creatureOwnerId: string | undefined;
  },
): ActivationRejection | undefined {
  const isSelf = target.id === caster.id;
  const isAlly = !isSelf && target.team === caster.team;
  const isEnemy = target.team !== caster.team;

  switch (rule) {
    case "self":
    case "single-any":
      return undefined;
    case "single-enemy":
      return isEnemy ? undefined : isSelf ? "invalid-target-self" : "invalid-target-ally";
    case "single-ally":
      // "Ally" includes yourself: self-healing is a normal, intended play.
      return isAlly || isSelf ? undefined : "invalid-target-enemy";
    case "single-ally-not-spirit":
      // A pet or a minion is allowed, as in GW1.
      return !isAlly && !isSelf
        ? "invalid-target-enemy"
        : target.creatureKind === "spirit"
          ? "invalid-target-spirit"
          : undefined;
    case "single-other-ally":
    case "single-dead-ally":
    case "companion":
    case "living-companion":
      return isAlly ? undefined : isSelf ? "invalid-target-self" : "invalid-target-enemy";
    case "allied-spirit":
      // A foe's spirit, a pet, a minion or yourself: a spirit skill
      // spends a spirit of your side, whoever summoned it.
      return isAlly && target.creatureKind === "spirit"
        ? undefined
        : "invalid-target-not-allied-spirit";
    case "enemy-spirit":
      // A map's spirit answers to nobody (#1965): nobody's to take.
      return isEnemy && target.creatureKind === "spirit" && target.creatureOwnerId !== undefined
        ? undefined
        : "invalid-target-not-enemy-spirit";
    case "own-minion":
      return target.creatureKind === "minion" && target.creatureOwnerId === caster.id
        ? undefined
        : "invalid-target-not-own-minion";
    case "allied-minion":
      return target.team === caster.team && target.creatureKind === "minion"
        ? undefined
        : "invalid-target-not-allied-minion";
    case "allied-summoned-creature":
      // A pet is charmed, not summoned; a player is no creature.
      return isAlly && isSummonedCreature(target.creatureKind)
        ? undefined
        : "invalid-target-not-allied-summoned-creature";
  }
}

/**
 * Why `rule` refuses `target` for being alive or dead, or `undefined` when
 * it allows it. Every rule wants the living but a resurrection's, which
 * wants the dead (#812). Shared, as `targetRuleAllows` is, by the
 * activation check and the skill bar's range mark.
 */
export function targetLivenessAllows(
  rule: TargetRule,
  target: Pick<Combatant, "dead">,
): ActivationRejection | undefined {
  if (rule === "single-dead-ally") {
    return target.dead ? undefined : "invalid-target-alive";
  }
  // The pet, alive or dead (#1046): its heal skips the dead, its
  // resurrection the living.
  if (rule === "companion") {
    return undefined;
  }
  return target.dead ? "invalid-target-dead" : undefined;
}

/** Whether `rule` acts on the caster's own companion, whatever is selected (#1046, #1108). */
export function isCompanionRule(rule: TargetRule): boolean {
  return rule === "companion" || rule === "living-companion";
}

/**
 * Whether a body of `kind` is a summoned creature (#1827): a spirit or a
 * minion. A pet is charmed, a map's creatures are placed, a player is none.
 */
export function isSummonedCreature(kind: CreatureKind | undefined): boolean {
  return kind === "spirit" || kind === "minion";
}

/**
 * Whether `rule` lands on the caster when no ally is selected (#1423): a
 * heal or an echo with a foe or nothing targeted goes on yourself.
 */
export function isAllyOrSelfRule(rule: TargetRule): boolean {
  return rule === "single-ally" || rule === "single-ally-not-spirit";
}

/** Validate a target against a skill's targeting rule. */
function checkTarget(request: ActivationRequest): ActivationCheck {
  const { skill, caster, target } = request;

  if (skill.target === "self") {
    // A self-targeted skill ignores whatever the client had selected.
    return OK;
  }

  if (target === undefined) {
    return reject(isCompanionRule(skill.target) ? "no-companion" : "no-target");
  }
  const byWho = targetRuleAllows(skill.target, caster, {
    id: target.id,
    team: target.team,
    creatureKind: request.targetCreatureKind,
    creatureOwnerId: request.targetCreatureOwnerId,
  });
  const byLife = targetLivenessAllows(skill.target, target);
  // A resurrection on yourself or a foe is refused for who, not for being
  // alive; any other skill on a corpse is refused for the corpse.
  const refused = skill.target === "single-dead-ally" ? (byWho ?? byLife) : (byLife ?? byWho);
  return refused === undefined ? OK : reject(refused);
}

export function canActivate(request: ActivationRequest): ActivationCheck {
  const { skill, caster } = request;
  const key = request.key ?? skill.id;

  if (caster.dead) {
    return reject("caster-dead");
  }
  // A shout or a stance goes off while knocked down (#1725, GW1).
  if (caster.knockdownRemaining > 0 && !usableMidAction(skill)) {
    return reject("caster-knocked-down");
  }
  if (!request.skillBar.includes(key)) {
    return reject("skill-not-on-bar");
  }
  if (skill.companion !== undefined) {
    return reject("no-animal-to-charm");
  }
  // A pet attack has no activation: it is used mid-cast, mid-aftercast
  // and mid-swing (#1046). So are a shout and a stance (#1725).
  if (request.isCasting && skill.type !== "pet-attack" && !usableMidAction(skill)) {
    return reject("already-casting");
  }
  if ((request.rechargeRemaining.get(key) ?? 0) > 0) {
    return reject("still-recharging");
  }
  // After the recharge, so a disabled spent skill still says "recharging".
  if (request.spent.has(key)) {
    return reject("spent-until-morale-boost");
  }
  if (isSpell(skill.type) && preventsSpells(caster.statuses.active)) {
    return reject("cannot-cast-spells");
  }
  if (skill.type === "attack" && preventsAttacks(caster.statuses.active)) {
    return reject("cannot-attack");
  }
  if (isResurrectionSkill(skill) && preventsResurrection(caster.statuses.active)) {
    return reject("cannot-resurrect");
  }
  if (
    (skill.type === "shout" || skill.type === "chant") &&
    preventsShoutsAndChants(caster.statuses.active)
  ) {
    return reject("cannot-shout-or-chant");
  }
  // An attack skill is a blow of its weapon (ADR-0029): checked before the
  // cost, so the player is told what is wrong rather than what it costs.
  if (
    skill.attack !== undefined &&
    !wieldsFor(caster.equipment.mainHand.weapon.id, skill.attack.weapon)
  ) {
    return reject("wrong-weapon");
  }

  // A signet under Primal Echoes costs Energy too (#1886).
  if (caster.energy < energyCostOf(skill, caster, request.target)) {
    return reject("insufficient-energy");
  }
  if (skill.cost?.kind === "adrenaline" && !canAffordAdrenaline(caster, skill, key)) {
    return reject("insufficient-adrenaline");
  }

  const targetCheck = checkTarget(request);
  if (!targetCheck.ok) {
    return targetCheck;
  }
  // Spell Breaker's bearer (#1511): refused before a walk toward it starts.
  if (
    isSpell(skill.type) &&
    request.target !== undefined &&
    request.target.team !== caster.team &&
    untargetableByFoeSpells(request.target.statuses.active)
  ) {
    return reject("invalid-target-untargetable");
  }
  // Well of the Profane's bearer (#1732): an enchantment at it, or a
  // self-enchantment by it, is refused before anything is paid. An area
  // enchantment skips it where it lands.
  const enchanted =
    skill.target === "self" ? (skill.area === undefined ? caster : undefined) : request.target;
  if (
    skill.type === "enchantment" &&
    enchanted !== undefined &&
    preventsEnchantments(enchanted.statuses.active)
  ) {
    return reject("invalid-target-unenchantable");
  }
  if (
    request.target !== undefined &&
    takesASpell(skill) &&
    !resolvedBar(request.target.skillBar, request.target.cast).some((slot) => {
      const held = slot === null ? undefined : getSkill(slot.skillId);
      return held !== undefined && isSpell(held.type);
    })
  ) {
    return reject("no-spells");
  }
  // A pet attack needs its pet alive and within earshot of its owner,
  // seen or not, and never walks its owner in (#1046).
  if (skill.type === "pet-attack") {
    if (request.target?.dead === true) {
      return reject("companion-dead");
    }
    return request.targetPosition === undefined ||
      distanceWithinRange(request.casterPosition, request.targetPosition, skill.range)
      ? OK
      : reject("companion-too-far");
  }

  // Range and line of sight only apply when there is a distinct target to
  // measure against; a self-cast is always in range of itself.
  if (skill.target !== "self" && request.targetPosition !== undefined) {
    if (!distanceWithinRange(request.casterPosition, request.targetPosition, skill.range)) {
      return reject("out-of-range");
    }
    if (!hasLineOfSight(request.casterPosition, request.targetPosition, request.losBlockers)) {
      return reject("no-line-of-sight");
    }
  }

  return OK;
}

/**
 * Whether `skill` is a resurrection skill (#1745): one cast on a dead
 * ally, as the pet-target rule reads it (#1046). Frozen Soil refuses it.
 */
export function isResurrectionSkill(skill: Skill): boolean {
  return skill.target === "single-dead-ally";
}

/**
 * The energy `skill` costs `caster` right now (#637): its base, raised
 * by Quickening Zephyr's multiplier and rounded half up (#1745), then
 * Expertise (#528) or Mysticism (#874), less what a status takes off
 * the caster's skills of its kind, never below its floor (#1761, #1886),
 * plus what a status adds to them (#1886), less what an
 * active glyph takes off a spell (#526) and what a chant takes off the
 * next skill of its kind (#1505), never below 0. The base is a status's
 * when one names it (#1886). The one number the check, the spend and the
 * skill bar use, so they cannot disagree. 0 for a skill with no energy
 * cost. Last, what the chosen `target` takes off an enchantment cast on
 * it (#1975), Air of Enchantment's, never below 1; the skill bar names
 * none, and an area or party enchantment has none.
 */
export function energyCostOf(
  skill: Skill,
  caster: RankHolder,
  target?: Pick<Combatant, "statuses">,
): number {
  const own = ownSkillBoost(caster.statuses.active, skill);
  const base = own.energyBase ?? (skill.cost?.kind === "energy" ? skill.cost.amount : undefined);
  if (base === undefined) {
    return 0;
  }
  const expertise = rankOf(caster, EXPERTISE_ATTRIBUTE);
  // Only one primary holds a rank, so at most one of these cuts.
  const attributed = mysticismEnergyCost(
    rankOf(caster, MYSTICISM_ATTRIBUTE),
    skill,
    expertiseEnergyCost(expertise, skill, raisedBaseCost(base, caster)),
  );
  const { energyDiscount: discount, energyFloor: floor } = own;
  const cost =
    (discount === 0 || attributed < floor ? attributed : Math.max(floor, attributed - discount)) +
    own.energySurcharge;
  const reduction = caster.statuses.active.reduce((sum, { id }) => {
    const { nextSpells, nextSkillRule } = getStatusDefinition(id);
    const glyph = isSpell(skill.type) ? (nextSpells?.costReduction ?? 0) : 0;
    const chant =
      nextSkillRule !== undefined && nextSkillAnswers(nextSkillRule.which, skill)
        ? nextSkillRule.energyDiscount
        : 0;
    return sum + glyph + chant;
  }, 0);
  const paid = Math.max(0, cost - reduction);
  const less =
    skill.type === "enchantment" && skill.area === undefined && target !== undefined
      ? target.statuses.active.reduce(
          (sum, { id }) => sum + getStatusDefinition(id).enchantmentsOnBearerCostLess,
          0,
        )
      : 0;
  return less === 0 || paid <= 1 ? paid : Math.max(1, paid - less);
}

/** `base` times every `energyCostMultiplier` the caster bears, rounded half up (#1745). */
function raisedBaseCost(base: number, caster: RankHolder): number {
  const multiplier = caster.statuses.active.reduce(
    (product, { id }) => product * getStatusDefinition(id).energyCostMultiplier,
    1,
  );
  return multiplier === 1 ? base : Math.floor(base * multiplier + 0.5);
}

/**
 * Deduct a skill's cost from the caster. Call only after `canActivate`
 * returned ok — this deliberately does not re-check affordability, so a
 * caller that skips validation produces an obviously-wrong negative
 * resource rather than a silently-free cast. `key` is the pool an
 * adrenaline skill empties: a copy's own (#469). `target`: the one chosen,
 * whose statuses may cut an enchantment's cost (#1975).
 */
export function payCost(
  skill: Skill,
  caster: Combatant,
  key: string = skill.id,
  target?: Pick<Combatant, "statuses">,
): void {
  caster.energy -= energyCostOf(skill, caster, target);
  if (skill.cost?.kind === "adrenaline") {
    spendAdrenaline(caster, skill, key);
  }
  // After the energy, so a spell that lowers the ceiling below its own
  // cost still goes off; at activation start, so an interrupted or
  // cancelled cast stays overcast (#461). Read before the glyph is spent:
  // Glyph of Energy's spells cause none (#1941).
  const noOvercast =
    isSpell(skill.type) &&
    caster.statuses.active.some(
      ({ id }) => getStatusDefinition(id).nextSpells?.noOvercast === true,
    );
  if (!noOvercast) {
    addOvercast(caster, skill.overcast);
  }
}

/**
 * Whether `skill` goes off in the middle of another action (#1725, GW1):
 * a shout or a stance, used during an activation, an aftercast or a
 * knockdown, at once and outside the skill queue.
 */
export function usableMidAction(skill: Skill): boolean {
  return skill.type === "shout" || skill.type === "stance";
}

/**
 * Whether `skill` is followed by GW1's aftercast when it goes off (#317):
 * one with an activation time, unless it is an attack skill, whose timing
 * is the weapon's. Instant skills, like GW1's shouts and stances, have none.
 */
export function hasAftercast(skill: Skill): boolean {
  return skill.type !== "attack" && skill.activationSeconds > 0;
}
