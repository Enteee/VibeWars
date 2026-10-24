import {
  ALL_UNIVERSAL_RUNES,
  ARMOR_SLOTS,
  ATTRIBUTE_RUNE_TIERS,
  RUNE_TIERS,
  MINIMAL_GW_INSPIRED_PVP_V1,
  SHIELD_REQUIREMENT_ATTRIBUTES,
  accessibleAttributeIds,
  allowsOffhand,
  getAttribute,
  getOffhand,
  getWeapon,
  isArmorSlot,
  isInsigniaId,
  isOffhandId,
  isUniversalRuneId,
  isWeaponId,
  reconcileEquipment,
  resolveLoadout,
  runeDisplayName,
  type ArmorSlot,
  type EquippedRune,
  type InsigniaId,
  type OffhandId,
  type ResolvedLoadout,
  type RuneTier,
  type WeaponId,
} from "@vibewars/game-core";

import type { StoredCharacter } from "../storage/schema.js";

/**
 * Gear editing rules (ADR-0012).
 *
 * Pure functions over a `StoredCharacter`, in the same style as
 * `build-editor.ts`'s `setRank` / `setSkill` and for the same reason:
 * every rule here is testable in Node with no DOM, and the renderer is
 * left with nothing to decide. `gear-editor.test.ts` covers this file;
 * the browser tests only check that the controls are wired to it.
 */

function touched(
  character: StoredCharacter,
  equipment: StoredCharacter["equipment"],
): StoredCharacter {
  return { ...character, equipment, updatedAt: Date.now() };
}

/** Attribute ids this character can actually reach, for a nomination list. */
export function accessibleAttributes(character: StoredCharacter): readonly string[] {
  return accessibleAttributeIds(character.primaryProfession, character.secondaryProfession);
}

/**
 * The attribute a newly-picked piece of gear should nominate.
 *
 * Prefers the character's primary attribute where it is allowed, since
 * that is the one they are most likely to have invested in; otherwise
 * the first legal option, sorted so the choice is stable rather than
 * dependent on iteration order.
 */
function defaultNomination(
  character: StoredCharacter,
  allowed: readonly string[] | "any-accessible",
): string | null {
  const reachable = accessibleAttributes(character);
  const candidates =
    allowed === "any-accessible" ? [...reachable] : allowed.filter((id) => reachable.includes(id));
  if (candidates.length === 0) {
    return null;
  }
  const primaryFirst = candidates.find((id) => getAttribute(id)?.isPrimary === true);
  return primaryFirst ?? [...candidates].sort()[0] ?? null;
}

/* -------------------------------------------------------------------------- */
/* Weapons and off-hands                                                       */
/* -------------------------------------------------------------------------- */

export function setWeapon(character: StoredCharacter, weaponId: WeaponId): StoredCharacter {
  const weapon = getWeapon(weaponId);
  if (weapon === undefined) {
    return character;
  }

  const requirementAttributeId =
    weapon.requirement.kind === "fixed"
      ? null
      : defaultNomination(character, weapon.requirement.from);

  // Picking a two-hander puts the off-hand down. That coupling lives
  // here, in a tested function, rather than in a click handler — it is
  // the rule the whole gear trade-off rests on.
  const offHand = allowsOffhand(weapon) ? character.equipment.offHand : null;

  return touched(character, {
    ...character.equipment,
    mainHand: { weaponId, requirementAttributeId },
    offHand,
  });
}

/** Whether this character's current weapon leaves a hand free. */
export function canEquipOffhand(character: StoredCharacter): boolean {
  const weapon = getWeapon(character.equipment.mainHand.weaponId);
  return weapon !== undefined && allowsOffhand(weapon);
}

export function setOffhand(
  character: StoredCharacter,
  offhandId: OffhandId | null,
): StoredCharacter {
  if (offhandId === null) {
    return touched(character, { ...character.equipment, offHand: null });
  }
  // A no-op rather than an error when both hands are full, in the spirit
  // of `swapSkillSlots(a, a)` returning the character unchanged.
  if (!canEquipOffhand(character)) {
    return character;
  }
  const offhand = getOffhand(offhandId);
  if (offhand === undefined) {
    return character;
  }
  return touched(character, {
    ...character.equipment,
    offHand: {
      offhandId,
      requirementAttributeId:
        offhand.requirement.kind === "fixed"
          ? null
          : defaultNomination(character, offhand.requirement.from),
    },
  });
}

/** Re-link a piece of gear to a different attribute. */
export function setRequirementAttribute(
  character: StoredCharacter,
  hand: "mainHand" | "offHand",
  attributeId: string | null,
): StoredCharacter {
  if (hand === "mainHand") {
    return touched(character, {
      ...character.equipment,
      mainHand: { ...character.equipment.mainHand, requirementAttributeId: attributeId },
    });
  }
  const offHand = character.equipment.offHand;
  if (offHand === null) {
    return character;
  }
  return touched(character, {
    ...character.equipment,
    offHand: { ...offHand, requirementAttributeId: attributeId },
  });
}

/**
 * Attributes the equipped weapon may be linked to.
 *
 * Empty for a fixed-requirement weapon: a sword has no choice to offer,
 * and showing a one-option dropdown would imply it did.
 */
export function weaponAttributeChoices(character: StoredCharacter): readonly string[] {
  const weapon = getWeapon(character.equipment.mainHand.weaponId);
  if (weapon === undefined || weapon.requirement.kind === "fixed") {
    return [];
  }
  const reachable = accessibleAttributes(character);
  return weapon.requirement.from === "any-accessible"
    ? reachable
    : weapon.requirement.from.filter((id) => reachable.includes(id));
}

/** Attributes a given off-hand may be linked to, filtered to what is reachable. */
export function offhandAttributeChoices(
  character: StoredCharacter,
  offhandId: OffhandId,
): readonly string[] {
  const offhand = getOffhand(offhandId);
  if (offhand === undefined || offhand.requirement.kind === "fixed") {
    return [];
  }
  const reachable = accessibleAttributes(character);
  return offhand.requirement.from === "any-accessible"
    ? reachable
    : SHIELD_REQUIREMENT_ATTRIBUTES.filter((id) => reachable.includes(id));
}

/* -------------------------------------------------------------------------- */
/* Armor                                                                       */
/* -------------------------------------------------------------------------- */

export function setInsignia(
  character: StoredCharacter,
  slot: ArmorSlot,
  insigniaId: InsigniaId | null,
): StoredCharacter {
  const piece = character.equipment.armor[slot];
  return touched(character, {
    ...character.equipment,
    armor: { ...character.equipment.armor, [slot]: { ...piece, insigniaId } },
  });
}

export function setRune(
  character: StoredCharacter,
  slot: ArmorSlot,
  rune: EquippedRune | null,
): StoredCharacter {
  const piece = character.equipment.armor[slot];
  return touched(character, {
    ...character.equipment,
    armor: { ...character.equipment.armor, [slot]: { ...piece, rune } },
  });
}

/** Clear every rune and insignia. One click to undo a bad experiment. */
export function clearArmorUpgrades(character: StoredCharacter): StoredCharacter {
  const armor = Object.fromEntries(
    ARMOR_SLOTS.map((slot) => [slot, { insigniaId: null, rune: null }]),
  ) as StoredCharacter["equipment"]["armor"];
  return touched(character, { ...character.equipment, armor });
}

/* -------------------------------------------------------------------------- */
/* The readout                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * What this character's gear actually comes to.
 *
 * Computed by `game-core`'s own resolver — the same call the server
 * makes at join — rather than re-adding the numbers here. A second
 * implementation in the web layer is the obvious way to end up with an
 * editor that promises 530 health and a match that gives 495.
 */
export function resolveForDisplay(character: StoredCharacter): ResolvedLoadout {
  return resolveLoadout(
    {
      primaryProfession: character.primaryProfession,
      allocatedRanks: new Map(character.attributes.map((a) => [a.attributeId, a.rank])),
      equipment: character.equipment,
    },
    MINIMAL_GW_INSPIRED_PVP_V1.combat,
  );
}

export interface GearSummary {
  readonly maxHealth: number;
  readonly maxEnergy: number;
  readonly armor: number;
  readonly weaponName: string;
  readonly damageRange: string;
  readonly attackInterval: string;
  /** `true` when the weapon's requirement is met at the character's ranks. */
  readonly requirementMet: boolean;
  /** Attribute ranks raised above what points bought, from runes. */
  readonly runeBonuses: readonly { readonly attributeId: string; readonly bonus: number }[];
  readonly conditionalArmor: readonly string[];
  readonly flatPhysicalReduction: number;
}

const CONDITION_LABELS: Readonly<Record<string, string>> = {
  "vs-physical": "vs physical damage",
  "while-attacking": "while attacking",
  "while-enchanted": "while enchanted",
};

export function summariseGear(character: StoredCharacter): GearSummary {
  const resolved = resolveForDisplay(character);
  const { mainHand } = resolved.equipment;
  const allocated = new Map(character.attributes.map((a) => [a.attributeId, a.rank]));

  const runeBonuses: { attributeId: string; bonus: number }[] = [];
  for (const [attributeId, rank] of resolved.attributeRanks) {
    const base = allocated.get(attributeId) ?? 0;
    if (rank > base) {
      runeBonuses.push({ attributeId, bonus: rank - base });
    }
  }
  runeBonuses.sort((a, b) => a.attributeId.localeCompare(b.attributeId));

  return {
    maxHealth: resolved.maxHealth,
    maxEnergy: resolved.maxEnergy,
    armor: resolved.equipment.baseArmor,
    weaponName: mainHand.weapon.name,
    damageRange: `${String(mainHand.weapon.damageMin)}–${String(mainHand.weapon.damageMax)}`,
    attackInterval: `${mainHand.weapon.attackIntervalSeconds.toFixed(2)}s`,
    requirementMet: mainHand.requirementMet,
    runeBonuses,
    conditionalArmor: resolved.equipment.conditionalArmor.map(
      (bonus) =>
        `+${String(bonus.amount)} armor ${CONDITION_LABELS[bonus.condition] ?? bonus.condition}`,
    ),
    flatPhysicalReduction: resolved.equipment.flatPhysicalReduction,
  };
}

/** Re-apply the legality rules after a profession change, from game-core. */
export function reconcileForCharacter(character: StoredCharacter): StoredCharacter {
  return touched(
    character,
    reconcileEquipment(character.equipment, {
      primaryProfession: character.primaryProfession,
      accessibleAttributeIds: new Set(accessibleAttributes(character)),
    }),
  );
}

/** A rune the editor can offer for a slot, as one flat pickable list. */
export interface RuneChoice {
  readonly key: string;
  readonly label: string;
  readonly rune: EquippedRune;
}

const TIER_LABEL: Readonly<Record<RuneTier, string>> = {
  minor: "Minor",
  major: "Major",
  superior: "Superior",
};

export function encodeRune(rune: EquippedRune): string {
  return rune.kind === "attribute"
    ? `attribute:${rune.attributeId}:${rune.tier}`
    : `universal:${rune.runeId}:${rune.tier}`;
}

/**
 * Parse a rune back out of a `<select>` value.
 *
 * Returns `undefined` for anything unrecognised rather than throwing —
 * the same contract `decodeDragSource` already uses, and for the same
 * reason: a stale DOM value must not be able to break the editor.
 */
export function decodeRune(raw: string): EquippedRune | undefined {
  const parts = raw.split(":");
  if (parts.length !== 3) {
    return undefined;
  }
  const [kind, id, tier] = parts;
  if (id === undefined || id === "" || tier === undefined) {
    return undefined;
  }
  if (tier !== "minor" && tier !== "major" && tier !== "superior") {
    return undefined;
  }
  if (kind === "attribute") {
    return { kind: "attribute", attributeId: id, tier };
  }
  if (kind === "universal" && isUniversalRuneId(id)) {
    return { kind: "universal", runeId: id, tier };
  }
  return undefined;
}

/**
 * Every rune this character could legally slot, as one flat list.
 *
 * Attribute runes are offered only for attributes they can actually
 * raise, and profession-locked runes only to the profession that can use
 * them — so the dropdown never contains an option that would immediately
 * fail validation.
 */
export function runeChoices(character: StoredCharacter): readonly RuneChoice[] {
  const choices: RuneChoice[] = [];

  for (const rune of ALL_UNIVERSAL_RUNES) {
    if (
      rune.requiresPrimary !== undefined &&
      rune.requiresPrimary !== character.primaryProfession
    ) {
      continue;
    }
    const tiers: readonly RuneTier[] = rune.tiered ? RUNE_TIERS : ["minor"];
    for (const tier of tiers) {
      const equipped: EquippedRune = { kind: "universal", runeId: rune.id, tier };
      choices.push({
        key: encodeRune(equipped),
        label: rune.tiered ? `${TIER_LABEL[tier]} ${rune.name}` : rune.name,
        rune: equipped,
      });
    }
  }

  for (const attributeId of [...accessibleAttributes(character)].sort()) {
    for (const tier of RUNE_TIERS) {
      const equipped: EquippedRune = { kind: "attribute", attributeId, tier };
      const penalty = ATTRIBUTE_RUNE_TIERS[tier].healthPenalty;
      choices.push({
        key: encodeRune(equipped),
        // The health cost is in the label, not buried in a tooltip: it
        // is the entire decision being made.
        label:
          `${runeDisplayName(equipped)} (+${String(ATTRIBUTE_RUNE_TIERS[tier].bonus)}` +
          (penalty > 0 ? `, −${String(penalty)} health)` : ")"),
        rune: equipped,
      });
    }
  }

  return choices;
}

export { TIER_LABEL };

/* -------------------------------------------------------------------------- */
/* Drag and drop                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Where a dragged piece of gear came from.
 *
 * A separate union from `SkillDragSource` rather than an extension of
 * it, with its own `gear-` prefixes, so a skill dropped on an armor
 * slot decodes to nothing and is ignored — the two vocabularies can
 * never be confused for one another.
 */
export type GearDragSource =
  | { readonly from: "weapon-library"; readonly weaponId: WeaponId }
  | { readonly from: "offhand-library"; readonly offhandId: OffhandId }
  | { readonly from: "insignia-library"; readonly insigniaId: InsigniaId }
  | { readonly from: "rune-library"; readonly rune: EquippedRune }
  | { readonly from: "armor-slot"; readonly slot: ArmorSlot; readonly part: "insignia" | "rune" }
  | { readonly from: "hand"; readonly hand: "mainHand" | "offHand" };

/** Where a drop landed. */
export type GearDropTarget =
  | { readonly kind: "main-hand" }
  | { readonly kind: "off-hand" }
  | { readonly kind: "armor"; readonly slot: ArmorSlot; readonly part: "insignia" | "rune" }
  | { readonly kind: "library" };

export function encodeGearDrag(source: GearDragSource): string {
  switch (source.from) {
    case "weapon-library":
      return `gear-weapon:${source.weaponId}`;
    case "offhand-library":
      return `gear-offhand:${source.offhandId}`;
    case "insignia-library":
      return `gear-insignia:${source.insigniaId}`;
    case "rune-library":
      return `gear-rune:${encodeRune(source.rune)}`;
    case "armor-slot":
      return `gear-worn:${source.slot}:${source.part}`;
    case "hand":
      return `gear-hand:${source.hand}`;
  }
}

export function decodeGearDrag(raw: string): GearDragSource | undefined {
  const separator = raw.indexOf(":");
  if (separator <= 0) {
    return undefined;
  }
  const kind = raw.slice(0, separator);
  const rest = raw.slice(separator + 1);
  if (rest === "") {
    return undefined;
  }

  switch (kind) {
    case "gear-weapon":
      return isWeaponId(rest) ? { from: "weapon-library", weaponId: rest } : undefined;
    case "gear-offhand":
      return isOffhandId(rest) ? { from: "offhand-library", offhandId: rest } : undefined;
    case "gear-insignia":
      return isInsigniaId(rest) ? { from: "insignia-library", insigniaId: rest } : undefined;
    case "gear-rune": {
      const rune = decodeRune(rest);
      return rune === undefined ? undefined : { from: "rune-library", rune };
    }
    case "gear-worn": {
      const [slot, part] = rest.split(":");
      if (!isArmorSlot(slot) || (part !== "insignia" && part !== "rune")) {
        return undefined;
      }
      return { from: "armor-slot", slot, part };
    }
    case "gear-hand":
      return rest === "mainHand" || rest === "offHand" ? { from: "hand", hand: rest } : undefined;
    default:
      return undefined;
  }
}

/**
 * Resolve a drop.
 *
 * Returns the character unchanged for any combination that does not
 * make sense — a rune onto the weapon slot, a shield onto a leg. Doing
 * nothing is the right answer there: the alternative is either an error
 * nobody asked for, or quietly putting the item somewhere the player
 * did not aim.
 */
export function applyGearDrop(
  character: StoredCharacter,
  source: GearDragSource,
  target: GearDropTarget,
): StoredCharacter {
  // Dragging worn gear back to the library takes it off.
  if (target.kind === "library") {
    if (source.from === "armor-slot") {
      return source.part === "insignia"
        ? setInsignia(character, source.slot, null)
        : setRune(character, source.slot, null);
    }
    if (source.from === "hand") {
      // There is no "no weapon" — bare hands are a weapon. Removing an
      // off-hand is meaningful; removing a main hand is not.
      return source.hand === "offHand" ? setOffhand(character, null) : character;
    }
    return character;
  }

  if (target.kind === "main-hand") {
    return source.from === "weapon-library" ? setWeapon(character, source.weaponId) : character;
  }

  if (target.kind === "off-hand") {
    if (source.from === "offhand-library") {
      return setOffhand(character, source.offhandId);
    }
    // A one-handed weapon dropped on the off-hand slot is a reasonable
    // thing to try; it just is not a thing the game supports.
    return character;
  }

  if (target.part === "insignia") {
    if (source.from === "insignia-library") {
      return setInsignia(character, target.slot, source.insigniaId);
    }
    if (source.from === "armor-slot" && source.part === "insignia") {
      // Move it, rather than cloning it onto both pieces.
      const moving = character.equipment.armor[source.slot].insigniaId;
      return setInsignia(setInsignia(character, source.slot, null), target.slot, moving);
    }
    return character;
  }

  if (source.from === "rune-library") {
    return setRune(character, target.slot, source.rune);
  }
  if (source.from === "armor-slot" && source.part === "rune") {
    const moving = character.equipment.armor[source.slot].rune;
    return setRune(setRune(character, source.slot, null), target.slot, moving);
  }
  return character;
}

/** The first armor slot with nothing of this kind in it, for click-to-equip. */
export function firstFreeArmorSlot(
  character: StoredCharacter,
  part: "insignia" | "rune",
): ArmorSlot {
  const free = ARMOR_SLOTS.find((slot) =>
    part === "insignia"
      ? character.equipment.armor[slot].insigniaId === null
      : character.equipment.armor[slot].rune === null,
  );
  return free ?? "head";
}
