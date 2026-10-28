import { primaryAttributeIds } from "../character.js";
import { getAttribute, getProfession, type ProfessionId } from "../professions.js";
import { armorPieces } from "./armor.js";
import { getInsignia } from "./insignias.js";
import type { BuildEquipment, WeaponSet } from "./loadout.js";
import { getOffhand } from "./offhands.js";
import { getUniversalRune, runeDisplayName, type EquippedRune } from "./runes.js";
import type { EquipmentRequirement } from "./types.js";
import { allowsOffhand, getWeapon } from "./weapons.js";

/**
 * Legality rules for gear (ADR-0012, brief §32).
 *
 * Structurally identical to `BuildProblem`, and deliberately not that
 * type: `build.ts` imports this module, so importing its type back here
 * would be a cycle. `validatePlayerBuild` folds these into its list.
 */
export interface EquipmentProblem {
  readonly field: string;
  readonly message: string;
}

export interface EquipmentValidationContext {
  readonly primaryProfession: ProfessionId;
  readonly secondaryProfession: ProfessionId | undefined;
  /** Attribute ids the character can actually reach, from `accessibleAttributeIds`. */
  readonly accessibleAttributeIds: ReadonlySet<string>;
}

/**
 * Check a nominated requirement attribute against what the class allows.
 *
 * Three distinct failures, because they mean different things to the
 * person reading the message: naming an attribute for a class that has
 * a fixed one (the client invented a rule), naming one the class does
 * not offer, and naming one the character cannot reach.
 */
function checkRequirement(
  field: string,
  label: string,
  requirement: EquipmentRequirement,
  nominated: string | null,
  context: EquipmentValidationContext,
  problems: EquipmentProblem[],
): void {
  if (requirement.kind === "fixed") {
    if (nominated !== null) {
      problems.push({
        field,
        message: `${label} is always linked to ${requirement.attributeId}; it cannot nominate ${nominated}`,
      });
    }
    return;
  }

  // A `chosen` requirement with an empty list is a class nothing can
  // improve (fists). Nominating anything for it is still wrong.
  if (Array.isArray(requirement.from) && requirement.from.length === 0) {
    if (nominated !== null) {
      problems.push({ field, message: `${label} has no attribute to nominate` });
    }
    return;
  }

  if (nominated === null) {
    problems.push({ field, message: `${label} must nominate the attribute it is linked to` });
    return;
  }

  if (requirement.from !== "any-accessible" && !requirement.from.includes(nominated)) {
    problems.push({
      field,
      message: `${label} cannot be linked to ${nominated}`,
    });
    return;
  }

  if (!context.accessibleAttributeIds.has(nominated)) {
    problems.push({
      field,
      message: `${label} is linked to ${nominated}, which this character cannot access`,
    });
  }
}

function checkRune(
  field: string,
  rune: EquippedRune,
  context: EquipmentValidationContext,
  problems: EquipmentProblem[],
): void {
  if (rune.kind === "attribute") {
    // Rejected, not merely warned about. An attribute rune fits only the
    // primary's armor (#1141, GW1), and one on an attribute you cannot
    // raise is pure health penalty for no bonus — a trap rather than a
    // trade-off, as the skill bar refuses inaccessible skills.
    if (!primaryAttributeIds(context.primaryProfession).includes(rune.attributeId)) {
      const name = getAttribute(rune.attributeId)?.name ?? rune.attributeId;
      problems.push({
        field,
        message: `a rune of ${name}, which is not a ${getProfession(context.primaryProfession).name} attribute`,
      });
    }
    return;
  }

  const definition = getUniversalRune(rune.runeId);
  if (definition === undefined) {
    problems.push({ field, message: `unknown rune ${rune.runeId}` });
    return;
  }
  if (
    definition.requiresPrimary !== undefined &&
    definition.requiresPrimary !== context.primaryProfession
  ) {
    problems.push({
      field,
      message: `${definition.name} needs a primary ${definition.requiresPrimary}`,
    });
  }
}

/**
 * One weapon set's checks, `index` 0 for set 1. Set 1's messages read as
 * they always have; sets 2-4's say which set (ADR-0036).
 */
function validateWeaponSet(
  set: WeaponSet,
  index: number,
  context: EquipmentValidationContext,
  problems: EquipmentProblem[],
): void {
  const field = `equipment.weaponSets[${String(index)}]`;
  const prefix = index === 0 ? "" : `Set ${String(index + 1)}: `;
  const weapon = getWeapon(set.mainHand.weaponId);
  if (weapon === undefined) {
    problems.push({
      field: `${field}.mainHand`,
      message: `${prefix}unknown weapon ${set.mainHand.weaponId}`,
    });
  } else {
    checkRequirement(
      `${field}.mainHand`,
      `${prefix}${weapon.name}`,
      weapon.requirement,
      set.mainHand.requirementAttributeId,
      context,
      problems,
    );
  }

  if (set.offHand !== null) {
    const offhand = getOffhand(set.offHand.offhandId);
    if (offhand === undefined) {
      problems.push({
        field: `${field}.offHand`,
        message: `${prefix}unknown off-hand ${set.offHand.offhandId}`,
      });
    } else {
      // The trade the whole gear system turns on: a free hand or a
      // bigger weapon, never both.
      if (weapon !== undefined && !allowsOffhand(weapon)) {
        problems.push({
          field: `${field}.offHand`,
          message: `${prefix}${weapon.name} needs both hands, so it cannot be carried with a ${offhand.name.toLowerCase()}`,
        });
      }
      checkRequirement(
        `${field}.offHand`,
        `${prefix}${offhand.name}`,
        offhand.requirement,
        set.offHand.requirementAttributeId,
        context,
        problems,
      );
    }
  }
}

/**
 * The headgear's attribute (#1140): every player build names one, of an
 * attribute it can put points in. `null` would be a head that does
 * nothing, a trap rather than a choice.
 */
function checkHeadgear(
  equipment: BuildEquipment,
  context: EquipmentValidationContext,
  problems: EquipmentProblem[],
): void {
  const field = "equipment.armor.head";
  const attributeId = equipment.armor.head.headgearAttributeId;
  if (attributeId === null) {
    problems.push({ field, message: "headgear needs an attribute" });
    return;
  }
  if (!context.accessibleAttributeIds.has(attributeId)) {
    const name = getAttribute(attributeId)?.name ?? attributeId;
    const professions = [context.primaryProfession, context.secondaryProfession]
      .flatMap((id) => (id === undefined ? [] : [getProfession(id).name]))
      .join(" or ");
    problems.push({
      field,
      message: `headgear of ${name}, which is not a ${professions} attribute`,
    });
  }
}

export function validateEquipment(
  equipment: BuildEquipment,
  context: EquipmentValidationContext,
): EquipmentProblem[] {
  const problems: EquipmentProblem[] = [];

  equipment.weaponSets.forEach((set, index) => {
    if (set !== null) {
      validateWeaponSet(set, index, context, problems);
    }
  });

  checkHeadgear(equipment, context, problems);

  const runedAttributes = new Set<string>();
  const universalRunes = new Set<string>();
  for (const [slot, piece] of armorPieces(equipment.armor)) {
    const field = `equipment.armor.${slot}`;

    if (piece.insigniaId !== null && getInsignia(piece.insigniaId) === undefined) {
      problems.push({ field, message: `unknown insignia ${piece.insigniaId}` });
    }

    if (piece.rune === null) {
      continue;
    }
    checkRune(field, piece.rune, context, problems);

    // Duplicate attribute runes are legal and the resolver handles them
    // (highest bonus, every penalty) — but they are almost always a
    // mistake, so the editor should be able to say so. Reported as a
    // problem rather than silently allowed, consistent with how a
    // duplicated skill on the bar is reported.
    if (piece.rune.kind === "attribute") {
      if (runedAttributes.has(piece.rune.attributeId)) {
        problems.push({
          field,
          message: `${runeDisplayName(piece.rune)} duplicates another rune of the same attribute; only the strongest bonus applies but both health penalties do`,
        });
      }
      runedAttributes.add(piece.rune.attributeId);
    } else if (getUniversalRune(piece.rune.runeId)?.stacks === false) {
      if (universalRunes.has(piece.rune.runeId)) {
        problems.push({
          field,
          message: `${runeDisplayName(piece.rune)} duplicates another rune of the same kind; only one applies`,
        });
      }
      universalRunes.add(piece.rune.runeId);
    }
  }

  return problems;
}
