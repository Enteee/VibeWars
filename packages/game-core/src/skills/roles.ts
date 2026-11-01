import { isCompanionRule } from "./activation.js";
import { statAtTwelve } from "./scaling.js";
import { getStatusDefinition } from "./status.js";
import type { StatusDefinition } from "./status.js";
import type { Skill, SkillEffect } from "./types.js";

/**
 * What a skill does for a team, as the team editor counts it (#575).
 * A skill may have several roles: Broad Head Arrow interrupts and
 * applies a condition.
 */
export type SkillRole =
  "interrupt" | "healing" | "removal" | "knockdown" | "hex" | "condition" | "defence";

/** Every role, in the order the team editor shows its counters. */
export const SKILL_ROLES: readonly SkillRole[] = [
  "interrupt",
  "healing",
  "removal",
  "knockdown",
  "hex",
  "condition",
  "defence",
];

/** The roles one effect gives its skill. */
function effectRoles(effect: SkillEffect): readonly SkillRole[] {
  switch (effect.kind) {
    case "interrupt":
      return ["interrupt"];
    case "heal":
    case "give-health":
    case "steal-from-corpse":
    case "drain-nearest-spirit":
      return ["healing"];
    case "remove-status":
      // Stripping a foe's enchantment helps no ally: not removal.
      return effect.category === "condition" || effect.category === "hex" ? ["removal"] : [];
    case "knockdown":
      return ["knockdown"];
    case "maintain-status":
    case "apply-status":
    case "companion-gains-status":
      return statusRoles(getStatusDefinition(effect.statusId));
    case "companion-steps-to-target":
      return [];
    // Wearying Spear's own Weakness (#1486) is its price, not a role.
    case "caster-gains-status": {
      const definition = getStatusDefinition(effect.statusId);
      return definition.category === "hex" || definition.category === "condition"
        ? []
        : statusRoles(definition);
    }
    case "if":
    case "splash":
      return effect.effects.flatMap(effectRoles);
    // Plague Touch (#944): conditions on a foe, and off yourself. Draw
    // Conditions (#1511): off an ally; what it heals is the caster.
    case "transfer-conditions":
      return effect.from === "caster" ? ["condition", "removal"] : ["removal"];
    // Epidemic (#1501): the target's conditions on the foes around it.
    case "spread-conditions":
      return ["condition"];
    case "damage":
    case "energy-gain":
    case "adrenaline-gain":
    case "energy-loss":
    case "energy-steal":
    case "life-steal":
    case "sacrifice-health":
    case "lose-health":
    case "lose-health-to":
    case "shadow-step":
    case "resurrect":
    case "resurrect-companions":
    case "drain-own-energy":
    case "recharge-faster":
    case "recharge-reset":
    case "recharge-others":
    case "pull-to-caster":
    case "destroy-target-spirit":
    case "destroy-target-minion":
    case "owner-gains-damage-dealt":
    case "destroy-allied-spirits":
    case "disable-skill":
    case "copy-removed":
    case "copy-disabled":
    case "copy-elite":
    case "take-control":
    case "lengthen-recharge":
    case "disable-own-skills":
    case "chain-mark":
    case "overcast":
      return [];
    // A spirit does what it projects (#1064): Recuperation heals.
    case "summon":
      return effect.creature.aura === undefined
        ? []
        : statusRoles(getStatusDefinition(effect.creature.aura.statusId));
    // So does a ward (#1087): Ward Against Melee defends. A trap does
    // what its spring does (#1105): Barbed Trap cripples and bleeds. A
    // pulse does what each pulse does (#1113): Symbol of Wrath damages.
    case "create-ground-effect":
      switch (effect.act.kind) {
        case "aura":
          return statusRoles(getStatusDefinition(effect.act.aura.statusId));
        case "trap":
          return effect.act.trap.spring.effects.flatMap(effectRoles);
        case "pulse":
          return effect.act.pulse.effects.flatMap(effectRoles);
      }
  }
}

/**
 * What applying a status does for a team: hexes and conditions are
 * their own roles, any other status that raises armor, blocks or cuts
 * the damage its bearer takes (Dark Escape, #919), caps it (Protective
 * Spirit, #936; Shelter, #1265), cuts its life stolen (Union, #1265), reverses it (Reversal of Fortune, #987) or slows the
 * hexes cast on it (Holy Veil, #944), or fails a foe's spells and attacks
 * at it or cuts a hexed foe's damage (Shadow Form, Mist Form, #1951) or one
 * type's (Mantra of Flame, #1964), or guards its casts from interrupts
 * (Mantra of Resolve, #1964) is defence, and one that interrupts
 * a spell (Dazed) is an interrupt.
 * What it does on each attack hit counts too: Apply Poison poisons,
 * and so does what it adds to the next attack skill: Anthem of Flame burns.
 * So does what an ally's status does to its bearer when it ends (#944):
 * Patient Spirit heals, Holy Veil removes a hex, or when it uses a skill
 * (#999): Song of Restoration heals, or when it attacks or casts a spell
 * (#1039): Vigorous Spirit heals, or what its bearer does to the foe that
 * hurt it (#1022): Weapon of Remedy removes conditions, or what it does each
 * time its bearer creates a creature (#1316): Spirit's Gift heals. One
 * that heals every second (Spirit Light Weapon, #975) is healing, and so
 * is one that regenerates (Healing Breeze, Mending, #1013).
 */
function statusRoles(status: StatusDefinition): readonly SkillRole[] {
  const roles: SkillRole[] = [];
  if (status.category === "hex" || status.category === "condition") {
    roles.push(status.category);
  } else if (
    statAtTwelve(status.armorModifier) > 0 ||
    (status.whileUnder !== undefined && status.whileUnder.armorModifier > 0) ||
    status.armorWhileStill > 0 ||
    status.block !== undefined ||
    statAtTwelve(status.damageTakenMultiplier) < 1 ||
    status.maxDamageFractionPerHit !== undefined ||
    status.attackDamageCapFraction !== undefined ||
    status.lifeStealReduction > 0 ||
    status.reversesNextDamage !== undefined ||
    status.negatesFatalDamage ||
    status.breaksNextHex !== undefined ||
    status.reflectsAttackDamage !== undefined ||
    status.incomingHexCastTimeMultiplier > 1 ||
    status.redirectsConditionsToMinion ||
    status.redirectsDamageToMinion > 0 ||
    status.foeSpellsFail ||
    status.failsFoeTouchSkills !== undefined ||
    status.attacksAgainstMiss ||
    status.damageReductionFromHexedSource !== undefined ||
    status.interruptGuard !== undefined ||
    (status.damageTypeTakenMultiplier?.multiplier ?? 1) < 1
  ) {
    roles.push("defence");
  }
  if (status.interruptsSpells) roles.push("interrupt");
  if (
    status.healthPerSecond > 0 ||
    statAtTwelve(status.healthPips) > 0 ||
    (status.whileUnder !== undefined && status.whileUnder.healthPips > 0) ||
    status.healthPipsPerEnchantment !== undefined
  ) {
    roles.push("healing");
  }
  const forBearer =
    status.category === "hex" || status.category === "condition"
      ? []
      : status.triggers
          .filter(
            ({ on, target }) =>
              ((on === "ends" ||
                on === "ends-early" ||
                on === "expires" ||
                on === "bearer-uses-skill" ||
                on === "bearer-attacks" ||
                on === "bearer-casts-spell" ||
                on === "bearer-takes-damage-from-foe" ||
                on === "bearer-health-drops-below" ||
                on === "bearer-creates-creature") &&
                target === "bearer") ||
              target === "offender" ||
              target === "created" ||
              target === "hexed-foe",
          )
          .flatMap(({ effects, target }) =>
            effects.flatMap((effect) =>
              effect.kind === "spread-gained-condition" ||
              effect.kind === "echo" ||
              effect.kind === "mirror-stance" ||
              effect.kind === "cancel-attack" ||
              effect.kind === "pay-energy-or-end" ||
              (target === "bearer" && isPrice(effect))
                ? []
                : [effect],
            ),
          );
  const riders = [
    ...(status.onAttackHit?.effects ?? []),
    ...(status.onAttackBlocked?.effects ?? []),
    ...(status.nextAttackSkill ?? []),
    ...(status.nextSkill?.effects ?? []),
    ...forBearer,
  ];
  return [...roles, ...riders.flatMap(effectRoles)];
}

/**
 * A hex or condition an ally's own status puts on its bearer (#1228):
 * Illusion of Haste's cripple as it ends is its price, not a role.
 */
function isPrice(effect: SkillEffect): boolean {
  if (effect.kind !== "apply-status") {
    return false;
  }
  const { category } = getStatusDefinition(effect.statusId);
  return category === "hex" || category === "condition";
}

/**
 * A skill's roles, derived from its effects only, never a hand-kept
 * list: adding a skill tags it. A blocked blow's effects count too,
 * since they are still what the skill does (Swift Chop's Deep Wound), and
 * so do a critical hit's and a missed blow's (#1486, Vicious Attack's).
 * One on your own pet (#1046) does nothing for the team: no role,
 * unless it is a pet attack (#1107), whose effects land on the foe
 * its bite hits: Maiming Strike cripples, Disrupting Lunge interrupts.
 */
export function skillRoles(skill: Skill): readonly SkillRole[] {
  if (isCompanionRule(skill.target) && skill.petAttack === undefined) {
    return [];
  }
  const effects = [
    ...skill.effects,
    ...(skill.attack?.onBlocked ?? []),
    ...(skill.attack?.onCritical ?? []),
    ...(skill.attack?.onFailedToHit ?? []),
  ];
  const roles = new Set(effects.flatMap(effectRoles));
  return SKILL_ROLES.filter((role) => roles.has(role));
}
