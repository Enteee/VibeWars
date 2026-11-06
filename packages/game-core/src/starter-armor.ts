import type { AttributeAllocation } from "./attributes.js";
import type { ArmorPiece, ArmorSet, EquippedRune, InsigniaId } from "./equipment/index.js";

/**
 * The gear the starter builds (#2554) and starter teams (#2035) wear:
 * a template code carries none, so every one gets the same honest kit.
 */

export function allocations(
  ranks: Readonly<Record<string, number>>,
): readonly AttributeAllocation[] {
  return Object.entries(ranks).map(([attributeId, rank]) => ({ attributeId, rank }));
}

function minorRune(attributeId: string): EquippedRune {
  return { kind: "attribute", attributeId, tier: "minor" };
}

const SUPERIOR_VIGOR: EquippedRune = { kind: "universal", runeId: "vigor", tier: "superior" };

/**
 * One insignia on every piece, a minor rune of the build's main
 * attribute on the head, with its headgear on the same attribute
 * (#1140), and a superior Vigor on the chest; `hands` takes one more
 * rune where the build has a use for it.
 */
export function armor(
  insigniaId: InsigniaId,
  mainAttributeId: string,
  hands?: EquippedRune,
): ArmorSet {
  const piece = (rune: EquippedRune | null): ArmorPiece => ({ insigniaId, rune });
  return {
    head: { ...piece(minorRune(mainAttributeId)), headgearAttributeId: mainAttributeId },
    chest: piece(SUPERIOR_VIGOR),
    hands: piece(hands ?? null),
    legs: piece(null),
    feet: piece(null),
  };
}
