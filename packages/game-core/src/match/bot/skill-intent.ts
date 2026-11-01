import type { DamageType } from "../../equipment/types.js";
import { isCompanionRule } from "../../skills/activation.js";
import { interruptLands, isStateCondition, stateHolds } from "../../skills/effects.js";
import { skillRoles } from "../../skills/roles.js";
import { copiesSkill } from "../../skills/stand-in.js";
import { getStatusDefinition, type StatusCategory, type StatusId } from "../../skills/status.js";
import type { Combatant, Skill, SkillEffect } from "../../skills/types.js";
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
 * skill, raising the dead, and a way out (#1930).
 */
export type BotUse =
  "interrupt" | "healing" | "defence" | "escape" | "removal" | "resurrect" | "offence";

/**
 * Every use `skill` has; empty for none. A skill on the bot's own pet
 * (#1046) has none: companion commands are not a bot's yet.
 */
export function botUses(skill: Skill): readonly BotUse[] {
  if (isCompanionRule(skill.target)) {
    return [];
  }
  const roles = skillRoles(skill);
  const uses: BotUse[] = [];
  if (roles.includes("interrupt")) uses.push("interrupt");
  if (roles.includes("healing")) uses.push("healing");
  if (roles.includes("defence")) uses.push("defence");
  if (escapes(skill)) uses.push("escape");
  if (removedCategories(skill).length > 0) uses.push("removal");
  if (skill.target === "single-dead-ally") uses.push("resurrect");
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
  return uses;
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

/** Whether `skill` guards its user from an interrupt (#1964): Mantra of Concentration. */
export function guardsInterrupt(skill: Skill): boolean {
  return ownStatuses(skill).some((id) => getStatusDefinition(id).interruptGuard !== undefined);
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
