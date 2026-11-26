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
  "profession-insignias" | "weapon-upgrades" | "per-piece-armor-ratings";

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
    mechanic: "profession-insignias",
    description: "insignias available to one profession only, each with its own bonus",
    kind: "gap",
    reason:
      "All but five are in (#1142, #1188, #1206). Herald's needs bundles, which this game " +
      "does not have; Lieutenant's, Stonefist, Bloodstained and Tormentor's do something " +
      "other than armor, and each needs its own mechanic.",
    affects: [],
  },
  {
    mechanic: "weapon-upgrades",
    description: "on-hit prefixes, damage and conditional inscriptions, and the chance mods",
    kind: "gap",
    reason:
      "Mods are ids on an equipped item, always perfect (ADR-0047). The stat mods are in " +
      "(#2007); the on-hit prefixes (#2009), conditional inscriptions (#2010) and " +
      "caster chance mods (#2011) each need their own mechanic.",
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
