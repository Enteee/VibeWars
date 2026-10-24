import { primaryAttributeOf, type ProfessionId } from "../professions.js";
import { bareArmorSet, type ArmorSet } from "./armor.js";
import type { OffhandId } from "./offhands.js";
import type { WeaponId } from "./weapons.js";

/**
 * What a build stores about its gear (ADR-0012).
 *
 * Deliberately ids and nominations only — no damage numbers, no armor
 * values, nothing derived. The catalogs are the source of truth and the
 * resolver reads them; a build that cached a damage range would be
 * telling the server what its weapon does, which is the one thing a
 * client must never do (brief §32).
 */

export interface EquippedWeapon {
  readonly weaponId: WeaponId;
  /**
   * The attribute the player nominated, for classes whose requirement is
   * `chosen` (wand, staff, shield, focus). `null` for a fixed-requirement
   * class, where naming one would be the client inventing a rule.
   */
  readonly requirementAttributeId: string | null;
}

export interface EquippedOffhand {
  readonly offhandId: OffhandId;
  readonly requirementAttributeId: string | null;
}

export interface BuildEquipment {
  readonly mainHand: EquippedWeapon;
  readonly offHand: EquippedOffhand | null;
  readonly armor: ArmorSet;
}

/**
 * The weapon a character of this profession should be holding when
 * nobody has told us otherwise.
 *
 * The build editor uses it for a new character and when a profession
 * change makes the current weapon a poor fit. A warrior must find a
 * *sword* selected — not fists, and not an empty slot. An empty weapon
 * slot is a character who cannot attack, which is strictly worse than
 * any guess we could make.
 */
export function defaultWeaponFor(profession: ProfessionId): WeaponId {
  switch (profession) {
    case "warrior":
      return "sword";
    case "ranger":
      return "recurve-bow";
    case "assassin":
      return "daggers";
    case "dervish":
      return "scythe";
    case "paragon":
      return "spear";
    case "monk":
    case "necromancer":
    case "mesmer":
    case "elementalist":
    case "ritualist":
      return "wand";
  }
}

/**
 * The off-hand to pair with the default weapon, where the default weapon
 * leaves a hand free. `null` for the two-handed professions.
 */
export function defaultOffhandFor(profession: ProfessionId): OffhandId | null {
  switch (profession) {
    case "warrior":
    case "paragon":
      return "shield";
    case "monk":
    case "necromancer":
    case "mesmer":
    case "elementalist":
    case "ritualist":
      return "focus";
    // Recurve bows, daggers and scythes all occupy both hands.
    case "ranger":
    case "assassin":
    case "dervish":
      return null;
  }
}

/**
 * A complete, legal, unexciting loadout for a profession.
 *
 * No insignias and no runes: those are deliberate trades with a cost,
 * and choosing one on a player's behalf would be putting words in their
 * mouth. A bare armor set is the honest default.
 *
 * **Legal is the operative word.** Everything this returns must pass
 * `validatePlayerBuild` untouched, because it is what the build editor
 * hands a new character — and a default that is not a legal build would
 * make the editor's first screen an error. Classes with a `chosen` requirement (wand, staff,
 * shield, focus) therefore nominate the profession's primary attribute,
 * which is always reachable and always within the allowed set.
 */
export function defaultEquipmentFor(profession: ProfessionId): BuildEquipment {
  const weaponId = defaultWeaponFor(profession);
  const offhandId = defaultOffhandFor(profession);
  const primaryAttributeId = primaryAttributeOf(profession).id;
  const needsNomination = weaponId === "wand" || weaponId === "staff";

  return {
    mainHand: {
      weaponId,
      requirementAttributeId: needsNomination ? primaryAttributeId : null,
    },
    offHand: offhandId === null ? null : { offhandId, requirementAttributeId: primaryAttributeId },
    armor: bareArmorSet(),
  };
}
