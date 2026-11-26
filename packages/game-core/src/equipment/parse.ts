import type { ArmorPiece, ArmorSet, HeadPiece } from "./armor.js";
import {
  WEAPON_SETS,
  type BuildEquipment,
  type EquippedOffhand,
  type EquippedWeapon,
  type WeaponSet,
  type WeaponSets,
} from "./loadout.js";
import { isOffhandId } from "./offhands.js";
import { isInsigniaId, type InsigniaId } from "./insignias.js";
import { MOD_SLOT_KEYS, isModId, type ItemUpgrades, type ModId, type ModSlot } from "./mods.js";
import { isRuneTier, isUniversalRuneId, type EquippedRune } from "./runes.js";
import { ARMOR_SLOTS } from "./types.js";
import { isWeaponId } from "./weapons.js";

/**
 * Parsing gear off the wire (ADR-0012).
 *
 * Structure only. Whether the gear is *legal* — a shield next to a
 * hammer, a rune for an attribute you cannot reach — is
 * `validateEquipment`'s job, kept separate for the same reason
 * `parsePlayerBuild` and `validatePlayerBuild` are separate: the server
 * needs to say "that is not a build" and "that build is illegal"
 * differently.
 *
 * Gear is as required as every other part of a build: a missing
 * `equipment` key fails the parse like any other missing field
 * (ADR-0016).
 */

function parseRune(value: unknown): EquippedRune | null | undefined {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "object") {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (!isRuneTier(record.tier)) {
    return undefined;
  }
  if (record.kind === "attribute") {
    return typeof record.attributeId === "string"
      ? { kind: "attribute", attributeId: record.attributeId, tier: record.tier }
      : undefined;
  }
  if (record.kind === "universal") {
    return isUniversalRuneId(record.runeId)
      ? { kind: "universal", runeId: record.runeId, tier: record.tier }
      : undefined;
  }
  return undefined;
}

function parseArmorPiece(value: unknown): ArmorPiece | undefined {
  if (value === null || value === undefined) {
    return { insigniaId: null, rune: null };
  }
  if (typeof value !== "object") {
    return undefined;
  }
  const record = value as Record<string, unknown>;

  const insigniaRaw: unknown = record.insigniaId ?? null;
  let insigniaId: InsigniaId | null = null;
  if (insigniaRaw !== null) {
    if (!isInsigniaId(insigniaRaw)) {
      return undefined;
    }
    insigniaId = insigniaRaw;
  }

  const rune = parseRune(record.rune);
  if (rune === undefined) {
    return undefined;
  }

  return { insigniaId, rune };
}

/** A head piece: a piece, and a `headgearAttributeId` that is a string or `null`, never absent (#1140). */
function parseHeadPiece(value: unknown): HeadPiece | undefined {
  if (typeof value !== "object" || value === null || !("headgearAttributeId" in value)) {
    return undefined;
  }
  const { headgearAttributeId } = value;
  const piece = parseArmorPiece(value);
  if (
    piece === undefined ||
    (headgearAttributeId !== null && typeof headgearAttributeId !== "string")
  ) {
    return undefined;
  }
  return { ...piece, headgearAttributeId };
}

function parseArmorSet(value: unknown): ArmorSet | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value !== "object") {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const head = parseHeadPiece(record.head);
  if (head === undefined) {
    return undefined;
  }
  const pieces: Partial<Record<(typeof ARMOR_SLOTS)[number], ArmorPiece>> = {};
  for (const slot of ARMOR_SLOTS) {
    const piece = slot === "head" ? head : parseArmorPiece(record[slot]);
    if (piece === undefined) {
      return undefined;
    }
    pieces[slot] = piece;
  }
  // Every slot was just assigned, the head as a head, so the cast is total rather than hopeful.
  return pieces as ArmorSet;
}

function parseRequirementAttribute(value: unknown): string | null | undefined {
  if (value === null || value === undefined) {
    return null;
  }
  return typeof value === "string" ? value : undefined;
}

/**
 * An item's mods (#2007): all three keys, each a known id or `null`. A
 * missing key is malformed, not "no mod" (ADR-0016).
 */
function parseUpgrades(value: unknown): ItemUpgrades | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const upgrades: Partial<Record<ModSlot, ModId | null>> = {};
  for (const slot of MOD_SLOT_KEYS) {
    const id = record[slot];
    if (id !== null && !isModId(id)) {
      return undefined;
    }
    upgrades[slot] = id;
  }
  // Every slot was just assigned, so the cast is total.
  return upgrades as ItemUpgrades;
}

function parseMainHand(value: unknown): EquippedWeapon | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (!isWeaponId(record.weaponId)) {
    return undefined;
  }
  const requirementAttributeId = parseRequirementAttribute(record.requirementAttributeId);
  if (requirementAttributeId === undefined) {
    return undefined;
  }
  const upgrades = parseUpgrades(record.upgrades);
  if (upgrades === undefined) {
    return undefined;
  }
  return { weaponId: record.weaponId, requirementAttributeId, upgrades };
}

function parseOffHand(value: unknown): EquippedOffhand | null | undefined {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "object") {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (!isOffhandId(record.offhandId)) {
    return undefined;
  }
  const requirementAttributeId = parseRequirementAttribute(record.requirementAttributeId);
  if (requirementAttributeId === undefined) {
    return undefined;
  }
  const upgrades = parseUpgrades(record.upgrades);
  if (upgrades === undefined) {
    return undefined;
  }
  return { offhandId: record.offhandId, requirementAttributeId, upgrades };
}

function parseWeaponSet(value: unknown): WeaponSet | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const mainHand = parseMainHand(record.mainHand);
  if (mainHand === undefined) {
    return undefined;
  }
  const offHand = parseOffHand(record.offHand);
  if (offHand === undefined) {
    return undefined;
  }
  return { mainHand, offHand };
}

/** Exactly `WEAPON_SETS` entries: set 1 a set, the others a set or `null` (ADR-0036). */
function parseWeaponSets(value: unknown): WeaponSets | undefined {
  if (!Array.isArray(value) || value.length !== WEAPON_SETS) {
    return undefined;
  }
  const [first, ...rest] = value as unknown[];
  const set1 = parseWeaponSet(first);
  if (set1 === undefined) {
    return undefined;
  }
  const spares: (WeaponSet | null)[] = [];
  for (const entry of rest) {
    const set = entry === null ? null : parseWeaponSet(entry);
    if (set === undefined) {
      return undefined;
    }
    spares.push(set);
  }
  const [set2 = null, set3 = null, set4 = null] = spares;
  return [set1, set2, set3, set4];
}

/**
 * Parse the gear half of a build.
 *
 * @returns the gear, or `undefined` if it is absent or structurally
 *   wrong.
 */
export function parseBuildEquipment(value: unknown): BuildEquipment | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "object") {
    return undefined;
  }
  const record = value as Record<string, unknown>;

  const weaponSets = parseWeaponSets(record.weaponSets);
  if (weaponSets === undefined) {
    return undefined;
  }
  const armor = parseArmorSet(record.armor);
  if (armor === undefined) {
    return undefined;
  }

  return { weaponSets, armor };
}
