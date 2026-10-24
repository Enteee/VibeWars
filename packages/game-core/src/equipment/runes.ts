import { getAttribute, type ProfessionId } from "../professions.js";
import type { StatusId } from "../skills/status.js";

/**
 * Runes (ADR-0012).
 *
 * A rune is the one place in the build where a bonus costs something
 * other than attribute points. Attribute runes trade maximum health for
 * rank; that trade is the whole mechanic, and it is why the duplicate
 * rule in `resolve.ts` is asymmetric.
 */

export type RuneTier = "minor" | "major" | "superior";

export const RUNE_TIERS: readonly RuneTier[] = Object.freeze(["minor", "major", "superior"]);

export function isRuneTier(value: unknown): value is RuneTier {
  return typeof value === "string" && (RUNE_TIERS as readonly string[]).includes(value);
}

/* -------------------------------------------------------------------------- */
/* Attribute runes                                                             */
/* -------------------------------------------------------------------------- */

export interface AttributeRuneTier {
  readonly bonus: number;
  /** Subtracted from maximum health. Positive numbers; the cost, not a delta. */
  readonly healthPenalty: number;
}

export const ATTRIBUTE_RUNE_TIERS: Readonly<Record<RuneTier, AttributeRuneTier>> = Object.freeze({
  minor: Object.freeze({ bonus: 1, healthPenalty: 0 }),
  major: Object.freeze({ bonus: 2, healthPenalty: 35 }),
  superior: Object.freeze({ bonus: 3, healthPenalty: 75 }),
});

/* -------------------------------------------------------------------------- */
/* Everything else                                                             */
/* -------------------------------------------------------------------------- */

export type UniversalRuneId =
  | "vigor"
  | "vitae"
  | "attunement"
  | "clarity"
  | "purity"
  | "recovery"
  | "restoration"
  | "absorption";

export type RuneEffect =
  | { readonly kind: "health"; readonly amount: number }
  | { readonly kind: "energy"; readonly amount: number }
  | {
      readonly kind: "status-duration";
      readonly statusIds: readonly StatusId[];
      readonly reduction: number;
    }
  | { readonly kind: "flat-physical-reduction"; readonly amount: number };

export interface UniversalRune {
  readonly id: UniversalRuneId;
  readonly name: string;
  /** `true` when the rune comes in minor/major/superior; `false` for a single grade. */
  readonly tiered: boolean;
  /** Restricted to this primary profession, or `undefined` for anyone. */
  readonly requiresPrimary: ProfessionId | undefined;
  /** Effect by tier. A non-tiered rune has the same entry under every key. */
  readonly byTier: Readonly<Record<RuneTier, RuneEffect>>;
}

function tiered(
  id: UniversalRuneId,
  name: string,
  minor: RuneEffect,
  major: RuneEffect,
  superior: RuneEffect,
  requiresPrimary?: ProfessionId,
): UniversalRune {
  return Object.freeze({
    id,
    name,
    tiered: true,
    requiresPrimary,
    byTier: Object.freeze({ minor, major, superior }),
  });
}

function flat(id: UniversalRuneId, name: string, effect: RuneEffect): UniversalRune {
  return Object.freeze({
    id,
    name,
    tiered: false,
    requiresPrimary: undefined,
    byTier: Object.freeze({ minor: effect, major: effect, superior: effect }),
  });
}

function durationRune(
  id: UniversalRuneId,
  name: string,
  statusIds: readonly StatusId[],
): UniversalRune {
  const effect: RuneEffect = Object.freeze({
    kind: "status-duration",
    statusIds: Object.freeze([...statusIds]),
    reduction: 0.2,
  });
  return flat(id, name, effect);
}

export const UNIVERSAL_RUNES: Readonly<Record<UniversalRuneId, UniversalRune>> = Object.freeze({
  vigor: tiered(
    "vigor",
    "Rune of Vigor",
    { kind: "health", amount: 30 },
    { kind: "health", amount: 41 },
    { kind: "health", amount: 50 },
  ),

  vitae: flat("vitae", "Rune of Vitae", { kind: "health", amount: 10 }),

  // Rescaled from the reference data's +1/+2/+3. That was sized for a
  // much smaller energy pool; against this game's 50 energy regenerating
  // at 2/second, a single point is below the threshold of noticing, and
  // a rune nobody can feel is a rune nobody will take. The *shape* of
  // the effect is preserved; the magnitude is this project's own tuning,
  // the same licence `status.ts` already takes with condition values.
  attunement: tiered(
    "attunement",
    "Rune of Attunement",
    { kind: "energy", amount: 3 },
    { kind: "energy", amount: 6 },
    { kind: "energy", amount: 9 },
  ),

  clarity: durationRune("clarity", "Rune of Clarity", ["blind", "weakness"]),
  // The reference pairs Purity with Poison and Disease. This game has no
  // Disease condition, so the rune covers Burning instead rather than
  // shipping with half its text pointing at nothing. Changed deliberately,
  // not approximated — the pairing is "the two conditions that burn you
  // down over time", which is what the rune is for.
  purity: durationRune("purity", "Rune of Purity", ["poison", "burning"]),
  recovery: durationRune("recovery", "Rune of Recovery", ["dazed", "deep-wound"]),
  restoration: durationRune("restoration", "Rune of Restoration", ["bleeding", "crippled"]),

  absorption: tiered(
    "absorption",
    "Rune of Absorption",
    { kind: "flat-physical-reduction", amount: 1 },
    { kind: "flat-physical-reduction", amount: 2 },
    { kind: "flat-physical-reduction", amount: 3 },
    "warrior",
  ),
});

export function isUniversalRuneId(value: unknown): value is UniversalRuneId {
  return typeof value === "string" && Object.hasOwn(UNIVERSAL_RUNES, value);
}

export function getUniversalRune(id: string): UniversalRune | undefined {
  return isUniversalRuneId(id) ? UNIVERSAL_RUNES[id] : undefined;
}

export const ALL_UNIVERSAL_RUNES: readonly UniversalRune[] = Object.freeze(
  Object.values(UNIVERSAL_RUNES),
);

/* -------------------------------------------------------------------------- */
/* What a build actually stores                                                */
/* -------------------------------------------------------------------------- */

/**
 * A rune slotted into an armor piece.
 *
 * A union rather than one shape with a nullable `attributeId`, because
 * only attribute runes name an attribute and a nullable field would make
 * "superior rune of nothing" representable.
 */
export type EquippedRune =
  | { readonly kind: "attribute"; readonly attributeId: string; readonly tier: RuneTier }
  | { readonly kind: "universal"; readonly runeId: UniversalRuneId; readonly tier: RuneTier };

export function runeDisplayName(rune: EquippedRune): string {
  if (rune.kind === "universal") {
    const definition = UNIVERSAL_RUNES[rune.runeId];
    return definition.tiered ? `${tierLabel(rune.tier)} ${definition.name}` : definition.name;
  }
  // The attribute's display name, not its id: "Rune of
  // warrior.hammer-mastery" is a database row, not something to show a
  // player. Falls back to the id only for an attribute that no longer
  // exists, where showing the raw value is more useful than hiding it.
  const attributeName = getAttribute(rune.attributeId)?.name ?? rune.attributeId;
  return `${tierLabel(rune.tier)} Rune of ${attributeName}`;
}

function tierLabel(tier: RuneTier): string {
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}
