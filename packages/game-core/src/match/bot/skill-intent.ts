import type { DamageType } from "../../equipment/types.js";
import { isCompanionRule } from "../../skills/activation.js";
import {
  interruptLands,
  isStateCondition,
  sacrificedHealth,
  stateHolds,
} from "../../skills/effects.js";
import { skillRoles } from "../../skills/roles.js";
import { copiesSkill } from "../../skills/stand-in.js";
import { statAtTwelve } from "../../skills/scaling.js";
import {
  getStatusDefinition,
  type StatusCategory,
  type StatusDefinition,
  type StatusId,
} from "../../skills/status.js";
import type {
  Combatant,
  Skill,
  SkillEffect,
  StateCondition,
  Surroundings,
} from "../../skills/types.js";
import type { Vec2 } from "../../vec2.js";
import { nearestFreshCorpse, type CorpseCandidate } from "../corpses.js";

/**
 * Below this share of its Health a bot uses no well by its sacrifice
 * (#1730): 66% more off would leave it all but dead.
 */
export const WELL_SACRIFICE_FLOOR = 0.5;

/**
 * What a bot may use a skill for (#1189), in the order `play-build`
 * weighs them. Read off the team editor's roles (`skillRoles`), which
 * this never changes, plus what those leave out: damage, an attack
 * skill, raising the dead, a way out (#1930), a buff that only makes
 * attacks hit harder (#2000), a setup (#1975), minion care (#1986),
 * which is that alone, Energy for the user and a guard for its spells
 * against interrupts (#2132).
 */
export type BotUse =
  | "interrupt"
  | "healing"
  | "defence"
  | "escape"
  | "removal"
  | "resurrect"
  | "boost"
  | "offence"
  | "setup"
  | "minion-care"
  | "take-minion"
  | "energy"
  | "guard";

/**
 * Every use `skill` has; empty for none. A skill on the bot's own pet
 * (#1046) has none: companion commands are not a bot's yet.
 */
export function botUses(skill: Skill): readonly BotUse[] {
  if (isCompanionRule(skill.target)) {
    return [];
  }
  // Taking or freeing foe minions (#2092) is the take-minion rule's alone.
  if (takesMinions(skill)) {
    return ["take-minion"];
  }
  // Healing or bonding minions (#1986) is no heal or defence of a player's.
  if (minionCareOf(skill) !== undefined) {
    return ["minion-care"];
  }
  const roles = skillRoles(skill);
  const uses: BotUse[] = [];
  if (roles.includes("interrupt")) uses.push("interrupt");
  if (roles.includes("healing")) uses.push("healing");
  if (roles.includes("defence")) uses.push("defence");
  if (escapes(skill)) uses.push("escape");
  if (removedCategories(skill).length > 0) uses.push("removal");
  if (skill.target === "single-dead-ally") uses.push("resurrect");
  if (setupOf(skill) !== undefined) uses.push("setup");
  if (lowEnergyGain(skill) !== undefined || energyAtFoes(skill)) uses.push("energy");
  if (recallsInterrupted(skill)) uses.push("guard");
  // Taste of Death's life steal (#1915) is from its own minion: no foe's.
  if (
    skill.target !== "allied-minion" &&
    (roles.includes("hex") ||
      roles.includes("condition") ||
      roles.includes("knockdown") ||
      skill.attack !== undefined ||
      skill.effects.some(dealsDamage) ||
      // Strike as One (#1966): the pet and the Cripple are the offence.
      sendsPet(skill) ||
      // Inspired Enchantment and Arcane Thievery (#1928): what it takes off
      // a foe is the bot's to use; Mirror of Disenchantment's strip (#1954).
      (skill.target === "single-enemy" && copiesSkill(skill.id)) ||
      takenOffFoe(skill) !== undefined)
  ) {
    uses.push("offence");
  }
  // A shout that only acts on a state (#2096): "You Will Die!", "Retreat!".
  // The fight rule waits for its state.
  if (uses.length === 0 && stateGates(skill) !== undefined) uses.push("offence");
  if (uses.length === 0 && boosts(skill)) uses.push("boost");
  return uses;
}

/**
 * What `skill` does for minions (#1986), or `undefined` for any other:
 * Blood of the Master heals every allied one, Verata's Sacrifice takes its
 * own ones' conditions, Dark Bond sends a share of a hit to one, Jagged
 * Bones stands a horror up where one dies.
 */
export type MinionCare = "heal-all" | "take-conditions" | "bond" | "replace-on-death";

export function minionCareOf(skill: Skill): MinionCare | undefined {
  for (const effect of skill.effects) {
    if (effect.kind === "splash" && effect.hits === "allied-minions") {
      return "heal-all";
    }
    if (
      effect.kind === "splash" &&
      effect.hits === "own-minions" &&
      effect.effects.some((inner) => inner.kind === "transfer-conditions")
    ) {
      return "take-conditions";
    }
    if (effect.kind === "apply-status") {
      const status = getStatusDefinition(effect.statusId);
      if (status.redirectsDamageToMinion > 0) {
        return "bond";
      }
      if (status.replacedOnDeathBy !== undefined) {
        return "replace-on-death";
      }
    }
  }
  return undefined;
}

/**
 * Whether `skill` takes foe minions or frees them (#2092): Verata's Gaze,
 * Verata's Aura, and Malign Intervention's masterless horror.
 */
export function takesMinions(skill: Skill): boolean {
  return skill.effects.some(
    (effect) =>
      effect.kind === "gaze-minion" ||
      (effect.kind === "splash" && effect.effects.some(({ kind }) => kind === "take-control")) ||
      (effect.kind === "apply-status" &&
        getStatusDefinition(effect.statusId).replacedOnDeathBy?.masterless === true),
  );
}

/** Whether `skill` sends its user's pet to its target (#1966), as Strike as One. */
export function sendsPet(skill: Skill): boolean {
  return skill.effects.some(({ kind }) => kind === "companion-steps-to-target");
}

/**
 * The status `skill` puts on its user that only changes that user's own
 * traps (#1966), as Trapper's Focus and Trapper's Speed; `undefined`
 * for any other skill.
 */
export function ownTrapBoost(skill: Skill): StatusId | undefined {
  if (skill.target !== "self") {
    return undefined;
  }
  for (const effect of skill.effects) {
    if (effect.kind !== "apply-status") {
      continue;
    }
    const modifiers = getStatusDefinition(effect.statusId).ownSkillModifiers;
    if (modifiers.length > 0 && modifiers.every(({ filter }) => filter.type === "trap")) {
      return effect.statusId;
    }
  }
  return undefined;
}

/** Whether `skill` puts on its user what fails foes' touch skills (#1966), "Can't Touch This!". */
export function wardsTouch(skill: Skill): boolean {
  return (
    skill.target === "self" &&
    skill.effects.some(
      (effect) =>
        effect.kind === "apply-status" &&
        getStatusDefinition(effect.statusId).failsFoeTouchSkills !== undefined,
    )
  );
}

/**
 * A buff for the side's attacks and nothing else (#2000): Order of Pain's,
 * Order of the Vampire's (#1979), "For Great Justice!"'s. Cast on the
 * caster alone, its party, or an area round it that takes it in, with a
 * status that acts on its bearer's attacks. A glyph, an attunement or a
 * run is none: what it does is no blow's.
 */
function boosts(skill: Skill): boolean {
  const area = skill.area;
  const ours =
    area === undefined ||
    area.origin === "party" ||
    (area.origin === "caster" && area.includesCaster && area.affects !== "enemies");
  return (
    skill.target === "self" &&
    ours &&
    skill.effects.some(
      (effect) =>
        effect.kind === "apply-status" && actsOnAttacks(getStatusDefinition(effect.statusId)),
    )
  );
}

/**
 * Whether `status` makes its bearer's attacks worth more (#2000): more on
 * a hit, more adrenaline, faster, more often critical or through more
 * armor, a rider on its next attack skill, or a trigger on its attacking.
 */
function actsOnAttacks(status: StatusDefinition): boolean {
  return (
    status.onAttackHit !== undefined ||
    status.extraStrikesPerHit > 0 ||
    status.attackDamageDelta > 0 ||
    statAtTwelve(status.attackDurationMultiplier) < 1 ||
    status.criticalChanceBonus > 0 ||
    status.attackArmorPenetration > 0 ||
    status.nextAttackSkill !== undefined ||
    status.triggers.some(({ on }) => on === "bearer-attacks" || on === "bearer-hits")
  );
}

/**
 * Whether `skill`'s boost does `member` any good (#2000). A rider on its
 * hits whose every effect waits on a state of the attacker's, as Order of
 * the Vampire's "not under another Necromancer enchantment", counts only
 * while that state holds for `member`; one on the foe hit may hold.
 */
export function boostsMember(skill: Skill, member: Combatant): boolean {
  return skill.effects.some((effect) => {
    if (effect.kind !== "apply-status") {
      return false;
    }
    const status = getStatusDefinition(effect.statusId);
    const rider = status.onAttackHit;
    if (rider === undefined || actsOnAttacks({ ...status, onAttackHit: undefined })) {
      return actsOnAttacks(status);
    }
    return rider.effects.some(
      (hit) =>
        hit.kind !== "if" ||
        !isStateCondition(hit.condition) ||
        !hit.condition.kind.startsWith("caster-") ||
        stateHolds(hit.condition, member, member, new Map()),
    );
  });
}

/**
 * The share of its max Health `skill` costs `caster` (#2000): Order of
 * Pain's 17%, more under Awaken the Blood.
 */
export function sacrificedFraction(skill: Skill, caster: Combatant): number {
  return skill.effects.reduce(
    (sum, effect) =>
      effect.kind === "sacrifice-health"
        ? sum + sacrificedHealth(caster, effect.percentOfMax) / caster.maxHealth
        : sum,
    0,
  );
}

/**
 * A way out (#1930): a Shadow Step to a creature of the caster's side, or
 * a swap with one, as Spirit Walk's and Swap's.
 */
function escapes(skill: Skill): boolean {
  return (
    (skill.target === "allied-spirit" || skill.target === "allied-summoned-creature") &&
    skill.effects.some((effect) => effect.kind === "shadow-step")
  );
}

/**
 * A spirit for a spirit (#1947): one of the caster's side destroyed and a
 * new one in its place, as Gaze of Fury's.
 */
export function renewsSpirit(skill: Skill): boolean {
  return (
    skill.target === "allied-spirit" &&
    skill.effects.some((effect) => effect.kind === "destroy-target-spirit") &&
    skill.effects.some((effect) => effect.kind === "summon")
  );
}

/**
 * What a Paragon rider (#1955) waits for, read off the status it puts
 * on: `last-stand`, a party's one negated death, as Angelic Bond's;
 * `enchanted-speed`, speed for the enchanted, as Godspeed's;
 * `speed-per-ally`, speed that lasts longer for each ally, as "Lead the
 * Way!"'s; `brace`, an ally's next knockdown stopped, as "Brace
 * Yourself!"'s. `undefined`: none of these.
 */
export type Rider = "last-stand" | "enchanted-speed" | "speed-per-ally" | "brace";

export function riderOf(skill: Skill): Rider | undefined {
  for (const effect of skill.effects) {
    if (effect.kind !== "apply-status") {
      continue;
    }
    const status = getStatusDefinition(effect.statusId);
    if (status.negatesFatalDamage && skill.area !== undefined && skill.area.origin !== "party") {
      return "last-stand";
    }
    if (status.moveSpeedWhileEnchanted > 1) {
      return "enchanted-speed";
    }
    if (status.moveSpeedMultiplier > 1 && effect.per?.count.kind === "allies-within") {
      return "speed-per-ally";
    }
    if (status.preventsKnockdown && skill.target === "single-other-ally") {
      return "brace";
    }
  }
  return undefined;
}

/**
 * A hex that copies its bearer's stances onto its caster (#1965), as
 * Mirrored Stance: worth a foe only while that foe has a stance to use.
 */
export function mirrorsStance(skill: Skill): boolean {
  return skill.effects.some(
    (effect) =>
      effect.kind === "apply-status" &&
      getStatusDefinition(effect.statusId).triggers.some(({ effects }) =>
        effects.some(({ kind }) => kind === "mirror-stance"),
      ),
  );
}

/**
 * The only role `skill` has is `interrupt`: Distracting Blow's, Power
 * Drain's. Held for a foe's cast or swing, never spent on anything else.
 */
export function onlyInterrupts(skill: Skill): boolean {
  const roles = skillRoles(skill);
  return roles.length === 1 && roles[0] === "interrupt";
}

/**
 * Whether `skill`, used by `caster` on `target` now, does anything, when
 * its every effect is an `if` on a state (#2096): "You Will Die!"'s foe
 * below 90%, "You're All Alone!"'s foe alone, "Retreat!"'s dead ally.
 * `undefined` for any other skill, which is not spent for nothing.
 */
export function stateGateHolds(
  skill: Skill,
  caster: Combatant,
  target: Combatant,
  surroundings: Surroundings,
): boolean | undefined {
  return stateGates(skill)?.some((gate) => stateHolds(gate, caster, target, surroundings));
}

/** The states `skill` acts on, when its every effect is an `if` on one; else `undefined`. */
function stateGates(skill: Skill): readonly StateCondition[] | undefined {
  if (skill.attack !== undefined || skill.effects.length === 0) {
    return undefined;
  }
  const gates: StateCondition[] = [];
  for (const effect of skill.effects) {
    if (effect.kind !== "if" || !isStateCondition(effect.condition)) {
      return undefined;
    }
    gates.push(effect.condition);
  }
  return gates;
}

/**
 * The radius of the aura `skill`'s status makes its caster project to the
 * allies beside it and not to itself (#2096): Protector's Defense's.
 * `undefined` for any other skill.
 */
export function projectsToOthers(skill: Skill): number | undefined {
  for (const effect of skill.effects) {
    if (effect.kind === "apply-status") {
      const aura = getStatusDefinition(effect.statusId).projectsAura;
      if (aura?.excludesSource === true) {
        return aura.radius;
      }
    }
  }
  return undefined;
}

/** Whether `combatant` bears a status that ends when it moves (#2096): Protector's Defense. */
export function holdsGround(combatant: Combatant): boolean {
  return combatant.statuses.active.some(({ id }) => getStatusDefinition(id).endsWhenBearerMoves);
}

/**
 * What `skill`, used by `caster` on `foe` now, would interrupt (#1713):
 * its cast, its plain swing, or nothing, as the `interrupt` effect would
 * find it (`interruptLands`). Signet of Disruption's two land if either
 * does. One in an `if` counts only where the condition holds now, as
 * Lightning Javelin's "attacking foes": one that waits on an earlier
 * effect counts as unmet, and one read off the bodies around is read
 * with none. A splash's interrupt is the foes around's, not `foe`'s.
 */
export function interruptAimed(
  skill: Skill,
  caster: Combatant,
  foe: Combatant,
): "cast" | "swing" | null {
  // A guard would stop it (#1964): Mantra of Concentration's, Resolve's.
  if (foe.statuses.active.some(({ id }) => getStatusDefinition(id).interruptGuard !== undefined)) {
    return null;
  }
  const aimed = (effects: readonly SkillEffect[]): "cast" | "swing" | null => {
    for (const effect of effects) {
      const lands =
        effect.kind === "interrupt"
          ? interruptLands(effect.only, foe)
          : effect.kind === "if" &&
              isStateCondition(effect.condition) &&
              stateHolds(effect.condition, caster, foe, new Map())
            ? aimed(effect.effects)
            : null;
      if (lands !== null) {
        return lands;
      }
    }
    return null;
  };
  return aimed(skill.effects);
}

/**
 * The categories `skill` takes off an ally: a `remove-status` of hexes
 * or conditions, or conditions passed on to a foe (Plague Touch, #944).
 */
export function removedCategories(skill: Skill): readonly StatusCategory[] {
  const found = new Set<StatusCategory>();
  for (const effect of skill.effects.flatMap(flatten)) {
    if (
      effect.kind === "remove-status" &&
      (effect.category === "hex" || effect.category === "condition")
    ) {
      found.add(effect.category);
    } else if (effect.kind === "transfer-conditions") {
      found.add("condition");
    }
  }
  return [...found];
}

/**
 * The category a foe must bear for `skill` to be worth casting at it:
 * what a copier takes off it to stand in for (#1928), Inspired
 * Enchantment's enchantments, or what a skill that does nothing else
 * strips (#1954), Mirror of Disenchantment's. `undefined` for any other.
 */
export function takenOffFoe(skill: Skill): StatusCategory | undefined {
  if (skill.target !== "single-enemy") {
    return undefined;
  }
  const removal = skill.effects.find((effect) => effect.kind === "remove-status");
  if (removal?.kind !== "remove-status") {
    return undefined;
  }
  const strips = removal.category === "enchantment" && skillRoles(skill).length === 0;
  return copiesSkill(skill.id) || strips ? removal.category : undefined;
}

/**
 * A setup (#1975): a status that is worth putting on only at a moment
 * the bot can see, no role of its own. Air of Enchantment's cheaper
 * enchantments on an ally, before one; Order of Apostasy's strip on the
 * party's hits, while they hit enchanted foes; Dark Apostasy's strip on
 * a critical hit, at an enchanted foe. Way of the Empty Palm's free chain
 * attacks, Deadly Paradox's faster profession skills and Unseen Fury's
 * blows a Blinded foe cannot block (#2134). The Elementalist's self-buffs
 * (#1984): a conjure's rider for the element it wields, Ether Prodigy's
 * Energy for Health, Ether Renewal's gains per enchantment on the next
 * spell, Elemental Attunement's ranks.
 */
export type Setup =
  | "cheaper-enchantments"
  | "party-strips"
  | "critical-strips"
  | "weapon-element"
  | "energy-for-health"
  | "spell-gains"
  | "elemental-ranks"
  | "free-chain"
  | "profession-haste"
  | "blind-unblock";

/** The setup `skill` is and the status it puts on, or `undefined` for any other (#1975, #1984). */
export function setupOf(skill: Skill): { setup: Setup; statusId: StatusId } | undefined {
  const applied = skill.effects.find((effect) => effect.kind === "apply-status");
  if (applied?.kind !== "apply-status") {
    return undefined;
  }
  const status = getStatusDefinition(applied.statusId);
  const setup: Setup | undefined =
    status.enchantmentsOnBearerCostLess > 0
      ? "cheaper-enchantments"
      : status.onAttackHit?.sourceLosesPerRemoved !== undefined
        ? "party-strips"
        : status.onCriticalHit !== undefined
          ? "critical-strips"
          : status.onAttackHit?.weaponDamage !== undefined
            ? "weapon-element"
            : status.energyPips > 0 &&
                status.triggers.some(
                  ({ on, effects }) =>
                    on === "ends" && effects.some(({ kind }) => kind === "lose-health"),
                )
              ? "energy-for-health"
              : status.triggers.some(
                    ({ on, effects }) =>
                      on === "bearer-casts-spell" &&
                      effects.some(
                        (effect) =>
                          effect.kind === "energy-gain" && effect.per?.count.kind === "statuses",
                      ),
                  )
                ? "spell-gains"
                : status.category === "enchantment" &&
                    status.attributeDeltas.some(
                      ({ scope, amount }) => scope === "elemental" && amount > 0,
                    )
                  ? "elemental-ranks"
                  : status.ownSkillModifiers.some(({ filter }) => filter.chainRoles !== undefined)
                    ? "free-chain"
                    : status.ownSkillModifiers.some(
                          ({ filter, rechargeFaster }) =>
                            filter.profession !== undefined &&
                            filter.type === undefined &&
                            rechargeFaster > 0,
                        )
                      ? "profession-haste"
                      : status.unblockableByBlinded
                        ? "blind-unblock"
                        : undefined;
  return setup === undefined ? undefined : { setup, statusId: applied.statusId };
}

/**
 * Whether `skill`, used now by a bot at `position` with `healthFraction`
 * of its Health, would be a well's sacrifice it should not make (#1730):
 * no fresh corpse in reach, and too little Health. On a corpse it may.
 */
export function sacrificesTooMuch(
  skill: Skill,
  position: Vec2,
  healthFraction: number,
  bodies: Iterable<CorpseCandidate>,
): boolean {
  const rule = skill.corpse;
  return (
    rule?.elseSacrificePercent !== undefined &&
    healthFraction < WELL_SACRIFICE_FLOOR &&
    nearestFreshCorpse(position, rule.radius, bodies) === undefined
  );
}

/**
 * Whether the removal comes off the caster rather than the target:
 * Plague Touch's, cast on a foe, or a `remove-status` `from` the caster.
 * Draw Conditions' comes off the ally it is cast on (#1511).
 */
export function removesFromCaster(skill: Skill): boolean {
  return skill.effects
    .flatMap(flatten)
    .some(
      (effect) =>
        (effect.kind === "transfer-conditions" && effect.from === "caster") ||
        (effect.kind === "remove-status" && effect.from === "caster"),
    );
}

/**
 * The statuses `skill` puts on its user, a stance's or an enchantment's:
 * a self-targeted skill's `apply-status`.
 */
export function ownStatuses(skill: Skill): readonly StatusId[] {
  return skill.target === "self"
    ? skill.effects.flatMap((effect) => (effect.kind === "apply-status" ? [effect.statusId] : []))
    : [];
}

/**
 * Whether `skill` guards its user from an interrupt (#1964): Mantra of
 * Concentration, or takes the sting out of one (#2132): Persistence of
 * Memory.
 */
export function guardsInterrupt(skill: Skill): boolean {
  return (
    recallsInterrupted(skill) ||
    ownStatuses(skill).some((id) => getStatusDefinition(id).interruptGuard !== undefined)
  );
}

/**
 * Whether `skill` puts on its user what recharges a skill of its that is
 * interrupted (#2132): Persistence of Memory.
 */
export function recallsInterrupted(skill: Skill): boolean {
  return ownStatuses(skill).some((id) =>
    getStatusDefinition(id).triggers.some(
      ({ on, effects }) =>
        on === "bearer-interrupted" &&
        effects.some((effect) => effect.kind === "recharge-reset" && effect.of === "used-skill"),
    ),
  );
}

/**
 * The Energy below which `skill` gains its user Energy (#2132), Ether
 * Signet's "if you have less than 9 Energy", or `undefined` for any other.
 */
export function lowEnergyGain(
  skill: Skill,
): Extract<StateCondition, { kind: "caster-energy-below" }> | undefined {
  if (skill.target !== "self") {
    return undefined;
  }
  for (const effect of skill.effects) {
    if (
      effect.kind === "if" &&
      effect.condition.kind === "caster-energy-below" &&
      effect.effects.some((inner) => inner.kind === "energy-gain")
    ) {
      return effect.condition;
    }
  }
  return undefined;
}

/**
 * Whether `skill` puts on its user Energy regeneration that its spells
 * at foes keep up (#2132): Lyssa's Aura.
 */
export function energyAtFoes(skill: Skill): boolean {
  return ownStatuses(skill).some((id) => {
    const status = getStatusDefinition(id);
    return status.renewsOnBearerSpellAtFoe && status.energyPips > 0;
  });
}

/**
 * Whether `skill` Blinds its own user (#2132): Signet of Midnight's price,
 * worth paying only against a foe that attacks in melee.
 */
export function blindsUser(skill: Skill): boolean {
  return skill.effects.some(
    (effect) => effect.kind === "caster-gains-status" && effect.statusId === "blind",
  );
}

/**
 * The damage type `skill` cuts for its user, if it cuts one (#1964):
 * Mantra of Flame's fire.
 */
export function wardedDamageType(skill: Skill): DamageType | undefined {
  for (const id of ownStatuses(skill)) {
    const byType = getStatusDefinition(id).damageTypeTakenMultiplier;
    if (byType !== undefined) {
      return byType.type;
    }
  }
  return undefined;
}

/**
 * The type most of `bar`'s damage is (#1964), by how many of its skills
 * deal it; `undefined` with no damage or a tie. A weapon's blows are not
 * counted: a bot reads the skills it sees.
 */
export function mainDamageType(bar: readonly Skill[]): DamageType | undefined {
  const counts = new Map<DamageType, number>();
  for (const skill of bar) {
    const types = new Set(
      skill.effects
        .flatMap(flatten)
        .flatMap((effect) => (effect.kind === "damage" ? [effect.type] : [])),
    );
    for (const type of types) {
      counts.set(type, (counts.get(type) ?? 0) + 1);
    }
  }
  let main: DamageType | undefined;
  let most = 0;
  for (const [type, count] of counts) {
    if (count > most) {
      main = type;
      most = count;
    } else if (count === most) {
      main = undefined;
    }
  }
  return main;
}

/** An `if`'s and a splash's effects, as well as the effect itself. */
function flatten(effect: SkillEffect): readonly SkillEffect[] {
  return effect.kind === "if" || effect.kind === "splash" ? [effect, ...effect.effects] : [effect];
}

function dealsDamage(effect: SkillEffect): boolean {
  switch (effect.kind) {
    case "damage":
    case "life-steal":
      return true;
    // A spirit that shoots (#1239): Pain's, one that works on foes
    // (#1265): Earthbind's, or one whose death hurts them (#1550):
    // Destruction's. A minion needs a corpse first.
    case "summon":
      return (
        effect.creature.kind === "spirit" &&
        (effect.creature.attack !== undefined ||
          effect.creature.aura?.affects === "foes" ||
          effect.creature.deathBurst?.affects === "foes")
      );
    case "if":
    case "splash":
      return effect.effects.some(dealsDamage);
    case "create-ground-effect": {
      const { act } = effect;
      return act.kind === "trap"
        ? act.trap.spring.effects.some(dealsDamage)
        : act.kind === "pulse" && act.pulse.effects.some(dealsDamage);
    }
    default:
      return false;
  }
}
