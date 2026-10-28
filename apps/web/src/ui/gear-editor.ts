import {
  ALL_INSIGNIAS,
  ALL_UNIVERSAL_RUNES,
  ARMOR_SLOTS,
  ATTRIBUTE_RUNE_TIERS,
  HIT_LOCATION_WEIGHTS,
  RUNE_TIERS,
  MINIMAL_GW_INSPIRED_PVP_V1,
  SHIELD_REQUIREMENT_ATTRIBUTES,
  accessibleAttributeIds,
  primaryAttributeIds,
  allowsOffhand,
  getAttribute,
  getOffhand,
  getWeapon,
  insigniaAllowed,
  isArmorSlot,
  isInsigniaId,
  isOffhandId,
  isWeaponSetIndex,
  isUniversalRuneId,
  isWeaponId,
  reconcileEquipment,
  resolveLoadout,
  runeDisplayName,
  type ArmorCondition,
  type ArmorSlot,
  type BuildEquipment,
  type ConditionalArmor,
  type EquippedRune,
  type Insignia,
  type InsigniaEffect,
  type InsigniaId,
  type OffhandId,
  type PieceArmor,
  type PieceReduction,
  type ResolvedLoadout,
  type RuneTier,
  type WeaponId,
  type WeaponSet,
  type WeaponSetIndex,
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

/** Weapon set `set` (#489); `null` for an empty set 2-4. */
export function setAt(character: StoredCharacter, set: WeaponSetIndex): WeaponSet | null {
  return character.equipment.weaponSets[set];
}

/** `character`'s gear with set `set` replaced by `value`; the others as they were. */
function withSet(
  character: StoredCharacter,
  set: WeaponSetIndex,
  value: WeaponSet,
): BuildEquipment {
  const [one, two, three, four] = character.equipment.weaponSets;
  return {
    ...character.equipment,
    weaponSets: [
      set === 0 ? value : one,
      set === 1 ? value : two,
      set === 2 ? value : three,
      set === 3 ? value : four,
    ],
  };
}

/**
 * `weaponId` into set `set`'s main hand. On an empty set it creates the
 * set, with the off hand empty.
 */
export function setWeapon(
  character: StoredCharacter,
  set: WeaponSetIndex,
  weaponId: WeaponId,
): StoredCharacter {
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
  const offHand = allowsOffhand(weapon) ? (setAt(character, set)?.offHand ?? null) : null;

  return touched(
    character,
    withSet(character, set, { mainHand: { weaponId, requirementAttributeId }, offHand }),
  );
}

/** Empty set 2-4 (#489). Set 1 always holds a weapon, so the type keeps it out. */
export function clearWeaponSet(character: StoredCharacter, set: 1 | 2 | 3): StoredCharacter {
  const [one, two, three, four] = character.equipment.weaponSets;
  return touched(character, {
    ...character.equipment,
    weaponSets: [one, set === 1 ? null : two, set === 2 ? null : three, set === 3 ? null : four],
  });
}

/** Whether set `set`'s weapon leaves a hand free; `false` for an empty set. */
export function canEquipOffhand(character: StoredCharacter, set: WeaponSetIndex): boolean {
  const held = setAt(character, set);
  const weapon = held === null ? undefined : getWeapon(held.mainHand.weaponId);
  return weapon !== undefined && allowsOffhand(weapon);
}

export function setOffhand(
  character: StoredCharacter,
  set: WeaponSetIndex,
  offhandId: OffhandId | null,
): StoredCharacter {
  const held = setAt(character, set);
  if (held === null) {
    return character;
  }
  if (offhandId === null) {
    return touched(character, withSet(character, set, { ...held, offHand: null }));
  }
  // A no-op rather than an error when both hands are full, in the spirit
  // of `swapSkillSlots(a, a)` returning the character unchanged.
  if (!canEquipOffhand(character, set)) {
    return character;
  }
  const offhand = getOffhand(offhandId);
  if (offhand === undefined) {
    return character;
  }
  return touched(
    character,
    withSet(character, set, {
      ...held,
      offHand: {
        offhandId,
        requirementAttributeId:
          offhand.requirement.kind === "fixed"
            ? null
            : defaultNomination(character, offhand.requirement.from),
      },
    }),
  );
}

/** Re-link a piece of set `set`'s gear to a different attribute. */
export function setRequirementAttribute(
  character: StoredCharacter,
  set: WeaponSetIndex,
  hand: "mainHand" | "offHand",
  attributeId: string | null,
): StoredCharacter {
  const held = setAt(character, set);
  if (held === null) {
    return character;
  }
  if (hand === "mainHand") {
    return touched(
      character,
      withSet(character, set, {
        ...held,
        mainHand: { ...held.mainHand, requirementAttributeId: attributeId },
      }),
    );
  }
  if (held.offHand === null) {
    return character;
  }
  return touched(
    character,
    withSet(character, set, {
      ...held,
      offHand: { ...held.offHand, requirementAttributeId: attributeId },
    }),
  );
}

/**
 * Attributes set `set`'s weapon may be linked to.
 *
 * Empty for a fixed-requirement weapon: a sword has no choice to offer,
 * and showing a one-option dropdown would imply it did. Empty for an
 * empty set too.
 */
export function weaponAttributeChoices(
  character: StoredCharacter,
  set: WeaponSetIndex,
): readonly string[] {
  const held = setAt(character, set);
  const weapon = held === null ? undefined : getWeapon(held.mainHand.weaponId);
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
  /** Energy regeneration in pips: the primary profession's. */
  readonly baseEnergyPips: number;
  readonly armor: number;
  readonly weaponName: string;
  /** What a hit deals before armor: a third of the weapon's range with its requirement unmet. */
  readonly damageRange: string;
  readonly attackInterval: string;
  /** The rank the weapon needs and the character lacks (#571); `undefined` when met. */
  readonly unmetRequirement: { readonly attributeId: string; readonly rank: number } | undefined;
  /** Attribute ranks raised above what points bought, from runes. */
  readonly runeBonuses: readonly { readonly attributeId: string; readonly bonus: number }[];
  /** The profession's armor on every hit, then the insignias' per piece (#1135), Knight's last (#1142). */
  readonly conditionalArmor: readonly string[];
  readonly flatPhysicalReduction: number;
}

function conditionLabel(condition: ArmorCondition): string {
  switch (condition.kind) {
    case "vs-physical":
      return "vs physical damage";
    case "vs-elemental":
      return "vs elemental damage";
    case "attacking":
      return "while attacking";
    case "enchantments-at-least":
      return condition.count === 1
        ? "while enchanted"
        : `with ${String(condition.count)}+ enchantments`;
    case "recharging-at-least":
      return `while ${String(condition.count)}+ skills recharge`;
    case "attribute-at-least":
      return `with ${String(condition.rank)}+ ${getAttribute(condition.attributeId)?.name ?? condition.attributeId}`;
  }
}

/** When a bonus holds (#1142): "vs elemental damage, with 13+ Strength"; "" for always. */
export function describeConditions(conditions: readonly ArmorCondition[]): string {
  return conditions.map(conditionLabel).join(", ");
}

/** `+10 armor vs physical damage`. */
function armorLine(bonus: ConditionalArmor): string {
  const when = describeConditions(bonus.conditions);
  return when === "" ? `+${String(bonus.amount)} armor` : `+${String(bonus.amount)} armor ${when}`;
}

/** A tier's count, for a bonus that is one condition with a count. */
function tierCount(bonus: ConditionalArmor): number | undefined {
  const [only, ...rest] = bonus.conditions;
  return rest.length === 0 &&
    (only?.kind === "enchantments-at-least" || only?.kind === "recharging-at-least")
    ? only.count
    : undefined;
}

/**
 * An insignia's armor or cut in a line (#1142), a tiered one's later
 * tiers short: "+5 armor while 1+ skills recharge, +5 at 3+, +5 at 5+".
 */
export function insigniaEffectNote(
  effect: Extract<InsigniaEffect, { kind: "conditional-armor" | "physical-reduction" }>,
): string {
  if (effect.kind === "physical-reduction") {
    return `−${String(effect.amount)} physical damage taken`;
  }
  return effect.bonuses
    .map((bonus, index) => {
      const count = tierCount(bonus);
      return index === 0 || count === undefined
        ? armorLine(bonus)
        : `+${String(bonus.amount)} at ${String(count)}+`;
    })
    .join(", ");
}

/**
 * One line per insignia bonus (#1135), its pieces named unless it is on
 * all five, with what it averages over every hit: `+10 armor vs physical
 * damage on chest, legs (avg +6.3)`.
 */
function pieceArmorLines(pieceArmor: PieceArmor): string[] {
  const groups = new Map<string, { bonus: ConditionalArmor; slots: ArmorSlot[] }>();
  for (const slot of ARMOR_SLOTS) {
    for (const bonus of pieceArmor[slot]) {
      const key = `${JSON.stringify(bonus.conditions)}:${String(bonus.amount)}`;
      const group = groups.get(key) ?? { bonus, slots: [] };
      group.slots.push(slot);
      groups.set(key, group);
    }
  }
  return [...groups.values()].map(({ bonus, slots }) => {
    if (slots.length === ARMOR_SLOTS.length) {
      return armorLine(bonus);
    }
    const chance = slots.reduce((sum, slot) => sum + HIT_LOCATION_WEIGHTS[slot], 0);
    const average = Math.round(bonus.amount * chance * 10) / 10;
    return `${armorLine(bonus)} on ${slots.join(", ")} (avg +${average.toFixed(1)})`;
  });
}

/** Knight's (#1142), as the armor lines: "−3 physical damage taken on chest (avg −1.1)". */
function pieceReductionLines(pieceReduction: PieceReduction): string[] {
  const groups = new Map<number, ArmorSlot[]>();
  for (const slot of ARMOR_SLOTS) {
    const amount = pieceReduction[slot];
    if (amount > 0) {
      groups.set(amount, [...(groups.get(amount) ?? []), slot]);
    }
  }
  return [...groups].map(([amount, slots]) => {
    const line = `−${String(amount)} physical damage taken`;
    if (slots.length === ARMOR_SLOTS.length) {
      return line;
    }
    const chance = slots.reduce((sum, slot) => sum + HIT_LOCATION_WEIGHTS[slot], 0);
    const average = Math.round(amount * chance * 10) / 10;
    return `${line} on ${slots.join(", ")} (avg −${average.toFixed(1)})`;
  });
}

/** What set `set` comes to; `undefined` for an empty set 2-4 (#489). */
export function summariseGear(
  character: StoredCharacter,
  set: WeaponSetIndex,
): GearSummary | undefined {
  const resolved = resolveForDisplay(character);
  const held = resolved.weaponSets[set];
  if (held === null) {
    return undefined;
  }
  const { mainHand } = held.equipment;
  const allocated = new Map(character.attributes.map((a) => [a.attributeId, a.rank]));

  const runeBonuses: { attributeId: string; bonus: number }[] = [];
  for (const [attributeId, rank] of resolved.attributeRanks) {
    const base = allocated.get(attributeId) ?? 0;
    if (rank > base) {
      runeBonuses.push({ attributeId, bonus: rank - base });
    }
  }
  runeBonuses.sort((a, b) => a.attributeId.localeCompare(b.attributeId));

  const { weapon, attributeId, requirementMet } = mainHand;
  // Unmet, every hit is scaled down (#571): the same multiplier the
  // simulation applies, so the editor shows what a match deals.
  const scale = requirementMet ? 1 : MINIMAL_GW_INSPIRED_PVP_V1.combat.unmetRequirementMultiplier;
  const dealt = (damage: number): string => String(Math.round(damage * scale));

  return {
    maxHealth: resolved.maxHealth,
    maxEnergy: held.maxEnergy,
    baseEnergyPips: resolved.baseEnergyPips,
    armor: held.equipment.baseArmor,
    weaponName: weapon.name,
    damageRange: `${dealt(weapon.damageMin)}–${dealt(weapon.damageMax)}`,
    attackInterval: `${weapon.attackIntervalSeconds.toFixed(2)}s`,
    unmetRequirement:
      requirementMet || attributeId === undefined
        ? undefined
        : { attributeId, rank: weapon.requirement.rank },
    runeBonuses,
    conditionalArmor: [
      ...held.equipment.conditionalArmor.map(armorLine),
      ...pieceArmorLines(held.equipment.pieceArmor),
      ...pieceReductionLines(held.equipment.pieceReduction),
    ],
    flatPhysicalReduction: held.equipment.flatPhysicalReduction,
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
 * Attribute runes are offered only for the primary profession's
 * attributes (#1141), and profession-locked runes only to the profession that can use
 * them — so the dropdown never contains an option that would immediately
 * fail validation.
 */
/** The insignias `character` may wear: the common ones and its primary's own (#1142). */
export function insigniaChoices(character: StoredCharacter): readonly Insignia[] {
  return ALL_INSIGNIAS.filter((insignia) => insigniaAllowed(insignia, character.primaryProfession));
}

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

  for (const attributeId of [...primaryAttributeIds(character.primaryProfession)].sort()) {
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
  | {
      readonly from: "hand";
      readonly set: WeaponSetIndex;
      readonly hand: "mainHand" | "offHand";
    };

/** Where a drop landed. */
export type GearDropTarget =
  | { readonly kind: "main-hand"; readonly set: WeaponSetIndex }
  | { readonly kind: "off-hand"; readonly set: WeaponSetIndex }
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
      return `gear-hand:${String(source.set)}:${source.hand}`;
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
    case "gear-hand": {
      const [set, hand] = rest.split(":");
      const index = Number(set);
      return isWeaponSetIndex(index) && (hand === "mainHand" || hand === "offHand")
        ? { from: "hand", set: index, hand }
        : undefined;
    }
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
      if (source.hand === "offHand") {
        return setOffhand(character, source.set, null);
      }
      // There is no "no weapon" in set 1: bare hands are a weapon. Sets
      // 2-4 may be empty, so taking their main hand off empties them.
      return source.set === 0 ? character : clearWeaponSet(character, source.set);
    }
    return character;
  }

  if (target.kind === "main-hand") {
    return source.from === "weapon-library"
      ? setWeapon(character, target.set, source.weaponId)
      : character;
  }

  if (target.kind === "off-hand") {
    if (source.from === "offhand-library") {
      return setOffhand(character, target.set, source.offhandId);
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

/**
 * Where click-to-equip puts an insignia or rune (#570): the armor piece
 * the player selected, or with none selected the first free one.
 */
export function armorTarget(
  character: StoredCharacter,
  part: "insignia" | "rune",
  selected: ArmorSlot | undefined,
): ArmorSlot {
  return selected ?? firstFreeArmorSlot(character, part);
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
