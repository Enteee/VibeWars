import type { ProfessionId } from "../professions.js";
import type { ArmorPiece, ArmorSet } from "./armor.js";
import {
  defaultEquipmentFor,
  type BuildEquipment,
  type EquippedOffhand,
  type EquippedWeapon,
} from "./loadout.js";
import { isOffhandId } from "./offhands.js";
import { isInsigniaId, type InsigniaId } from "./insignias.js";
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
 * Unlike the rest of the build, **a missing `equipment` key is not an
 * error.** A build saved or exported before weapons existed is *old*,
 * not malformed, and the whole point of the migration work is that such
 * a build stays playable. It gets its profession's default loadout.
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

function parseArmorSet(value: unknown): ArmorSet | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (typeof value !== "object") {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const pieces: Partial<Record<(typeof ARMOR_SLOTS)[number], ArmorPiece>> = {};
  for (const slot of ARMOR_SLOTS) {
    const piece = parseArmorPiece(record[slot]);
    if (piece === undefined) {
      return undefined;
    }
    pieces[slot] = piece;
  }
  // Every slot was just assigned, so the cast is total rather than hopeful.
  return pieces as ArmorSet;
}

function parseRequirementAttribute(value: unknown): string | null | undefined {
  if (value === null || value === undefined) {
    return null;
  }
  return typeof value === "string" ? value : undefined;
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
  return { weaponId: record.weaponId, requirementAttributeId };
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
  return { offhandId: record.offhandId, requirementAttributeId };
}

/**
 * Parse the gear half of a build.
 *
 * Returns `undefined` only for gear that is present but structurally
 * wrong. Absent gear yields `fallbackProfession`'s default loadout, so
 * an older client stays playable rather than being rejected at the door.
 */
export function parseBuildEquipment(
  value: unknown,
  fallbackProfession: ProfessionId,
): BuildEquipment | undefined {
  if (value === undefined || value === null) {
    return defaultEquipmentFor(fallbackProfession);
  }
  if (typeof value !== "object") {
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
  const armor = parseArmorSet(record.armor);
  if (armor === undefined) {
    return undefined;
  }

  return { mainHand, offHand, armor };
}
