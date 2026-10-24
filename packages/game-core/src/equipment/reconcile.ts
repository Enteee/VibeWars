import { armorPieces, type ArmorPiece, type ArmorSet } from "./armor.js";
import type { BuildEquipment, EquippedOffhand, EquippedWeapon } from "./loadout.js";
import { getOffhand } from "./offhands.js";
import { getUniversalRune, type EquippedRune } from "./runes.js";
import type { EquipmentRequirement } from "./types.js";
import { allowsOffhand, getWeapon } from "./weapons.js";

/**
 * Bringing gear back into legality after the character changed under it
 * (ADR-0012).
 *
 * Changing profession can invalidate gear in three ways: a nominated
 * requirement attribute stops being reachable, an attribute rune points
 * at an attribute you can no longer raise, or a profession-locked rune
 * loses its profession. The build editor already does exactly this for
 * attributes and skills in `setProfessions`; gear joins the same rule
 * rather than getting its own.
 *
 * **The weapon class itself is never cleared.** Weapons are gated by
 * attribute requirement, not by profession — anyone may hold anything
 * and simply swing it badly. A Mesmer who picks up a hammer has made a
 * bad choice, not an illegal one, and deleting their choice would be
 * the editor overruling them.
 */

export interface ReconcileContext {
  readonly accessibleAttributeIds: ReadonlySet<string>;
  readonly primaryProfession: string;
}

/**
 * Pick a legal nomination for a `chosen` requirement, preferring to keep
 * the one already there.
 *
 * Returns `undefined` when no legal nomination exists at all — which is
 * a different outcome from "none needed", and the caller treats it as
 * "this item cannot be carried any more".
 */
function repointRequirement(
  requirement: EquipmentRequirement,
  current: string | null,
  context: ReconcileContext,
): { readonly attributeId: string | null } | undefined {
  if (requirement.kind === "fixed") {
    return { attributeId: null };
  }
  if (Array.isArray(requirement.from) && requirement.from.length === 0) {
    return { attributeId: null };
  }

  const allowed = (id: string): boolean =>
    (requirement.from === "any-accessible" || requirement.from.includes(id)) &&
    context.accessibleAttributeIds.has(id);

  if (current !== null && allowed(current)) {
    return { attributeId: current };
  }

  const candidates =
    requirement.from === "any-accessible"
      ? [...context.accessibleAttributeIds]
      : requirement.from.filter((id) => context.accessibleAttributeIds.has(id));

  // Sorted so the fallback is stable rather than dependent on Set
  // insertion order — an editor that picked a different attribute each
  // time you toggled professions would be maddening.
  const [first] = [...candidates].sort();
  return first === undefined ? undefined : { attributeId: first };
}

function reconcileRune(rune: EquippedRune | null, context: ReconcileContext): EquippedRune | null {
  if (rune === null) {
    return null;
  }
  if (rune.kind === "attribute") {
    return context.accessibleAttributeIds.has(rune.attributeId) ? rune : null;
  }
  const definition = getUniversalRune(rune.runeId);
  if (definition === undefined) {
    return null;
  }
  if (
    definition.requiresPrimary !== undefined &&
    definition.requiresPrimary !== context.primaryProfession
  ) {
    return null;
  }
  return rune;
}

function reconcileArmor(armor: ArmorSet, context: ReconcileContext): ArmorSet {
  const next: Record<string, ArmorPiece> = {};
  for (const [slot, piece] of armorPieces(armor)) {
    next[slot] = { insigniaId: piece.insigniaId, rune: reconcileRune(piece.rune, context) };
  }
  return next as ArmorSet;
}

export function reconcileEquipment(
  equipment: BuildEquipment,
  context: ReconcileContext,
): BuildEquipment {
  const weapon = getWeapon(equipment.mainHand.weaponId);

  let mainHand: EquippedWeapon = equipment.mainHand;
  if (weapon !== undefined) {
    const repointed = repointRequirement(
      weapon.requirement,
      equipment.mainHand.requirementAttributeId,
      context,
    );
    // A weapon with no legal nomination left keeps the one it had: the
    // build will report a problem the player can see and fix, which is
    // better than silently swapping their weapon out from under them.
    if (repointed !== undefined) {
      mainHand = {
        weaponId: equipment.mainHand.weaponId,
        requirementAttributeId: repointed.attributeId,
      };
    }
  }

  let offHand: EquippedOffhand | null = equipment.offHand;
  if (offHand !== null) {
    const definition = getOffhand(offHand.offhandId);
    if (definition === undefined || (weapon !== undefined && !allowsOffhand(weapon))) {
      offHand = null;
    } else {
      const repointed = repointRequirement(
        definition.requirement,
        offHand.requirementAttributeId,
        context,
      );
      // Unlike a weapon, an off-hand with no legal link is simply
      // dropped — there is no "bad shield", only one you cannot hold.
      offHand =
        repointed === undefined
          ? null
          : { offhandId: offHand.offhandId, requirementAttributeId: repointed.attributeId };
    }
  }

  return { mainHand, offHand, armor: reconcileArmor(equipment.armor, context) };
}
