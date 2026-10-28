/**
 * Honest gaps in the gear model (ADR-0012, brief §9).
 *
 * `skills/coverage.ts` exists because "a skill is in the database" is
 * not the same as "a skill is implemented", and counting the first
 * while claiming the second is the specific dishonesty the brief
 * forbids. The same applies to equipment: a reader looking at five
 * armor pieces and fifteen weapons has no way to tell what was modelled
 * deliberately, what was simplified deliberately, and what was simply
 * not done — unless it is written down and tested.
 *
 * Two different things are recorded here, and the distinction matters:
 *
 * - **Simplifications** are reference behaviour this project chose not
 *   to reproduce, with a reason. They are not work queued up.
 * - **Gaps** are reference behaviour that would be worth having and is
 *   missing. They are work.
 */

/** A piece of gear behaviour this project does not simulate. */
export type MissingGearMechanic =
  "stances" | "profession-insignias" | "weapon-upgrades" | "per-piece-armor-ratings";

export interface GearOmission {
  readonly mechanic: MissingGearMechanic;
  /** What the reference does that this project does not. */
  readonly description: string;
  /**
   * `simplification` — a deliberate decision, not a backlog item.
   * `gap` — genuinely missing, and worth building.
   */
  readonly kind: "simplification" | "gap";
  /** Why, in one line. Never empty; `coverage.test.ts` enforces that. */
  readonly reason: string;
  /** Catalog entries this omission currently affects, if any. */
  readonly affects: readonly string[];
}

export const GEAR_OMISSIONS: readonly GearOmission[] = Object.freeze([
  {
    mechanic: "stances",
    description: "a self-targeted state that armor and skills can key off",
    kind: "gap",
    reason:
      "No stance mechanic exists, so a 'while in a stance' armor bonus could never fire. " +
      "The reference's Sentry's Insignia is therefore not in the catalog at all rather than " +
      "shipped as a stat line that is permanently zero.",
    affects: [],
  },
  {
    mechanic: "profession-insignias",
    description: "insignias available to one profession only, each with its own bonus",
    kind: "gap",
    reason:
      "Partial (#1142): Knight's, Sentinel's, Nightstalker's, Prodigy's and Windwalker are " +
      "in. Anchorite's, Wanderer's, Dreadnought, Disciple's, Blighter's, Undertaker's, " +
      "Forsaken, Shaman's, Minion Master's, Prismatic and the elemental ones need no new " +
      "mechanic and are next; Infiltrator's, Saboteur's, Vanguard's, Herald's, Scout's, " +
      "Centurion's, Virtuoso's, Mystic's, Artificer's, Beastmaster's, Tormentor's, " +
      "Lieutenant's, Ghost Forge, Stonefist and Bloodstained each need one.",
    affects: [],
  },
  {
    mechanic: "weapon-upgrades",
    description: "hafts, pommels, inscriptions and the rest of the weapon-modification system",
    kind: "simplification",
    reason:
      "Weapons here are classes, not items (ADR-0012). There is no inventory, no drop table " +
      "and no vendor, so there is nothing for an upgrade component to attach to.",
    affects: [],
  },
  {
    mechanic: "per-piece-armor-ratings",
    description: "each armor piece contributing its own armor rating to the total",
    kind: "simplification",
    reason:
      "Base armor is derived from the primary profession, which matches the reference at " +
      "max armor: every max set within a profession has the same rating on every piece, so " +
      "it stays one number. Insignia armor is per piece, and each hit rolls the piece it " +
      "lands on (ADR-0037).",
    affects: [],
  },
]);

export function gearOmission(mechanic: MissingGearMechanic): GearOmission | undefined {
  return GEAR_OMISSIONS.find((omission) => omission.mechanic === mechanic);
}

/** Omissions that are work rather than settled decisions. */
export function openGearGaps(): readonly GearOmission[] {
  return GEAR_OMISSIONS.filter((omission) => omission.kind === "gap");
}

export function formatGearCoverage(): string {
  const lines: string[] = [];
  for (const kind of ["gap", "simplification"] as const) {
    const matching = GEAR_OMISSIONS.filter((omission) => omission.kind === kind);
    lines.push(`${kind === "gap" ? "gaps" : "simplifications"} (${String(matching.length)}):`);
    for (const omission of matching) {
      lines.push(`  - ${omission.mechanic} — ${omission.description}`);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}
