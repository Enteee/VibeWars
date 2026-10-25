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
  | "stances"
  | "armor-while-attacking"
  | "attribute-headgear"
  | "profession-insignias"
  | "weapon-upgrades"
  | "per-piece-armor-ratings"
  | "armor-damage-type-resistance"
  | "shield-block";

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
    mechanic: "armor-while-attacking",
    description: "armor that applies while its wearer is attacking: Brawler's Insignia",
    kind: "gap",
    reason:
      "Weapon auto-attack now gives every combatant an attack state (ADR-0026), but armor " +
      "does not key off it yet. Brawler's Insignia stays out of the catalog until it does, " +
      "rather than shipping as a stat line nothing reads (ADR-0019).",
    affects: [],
  },
  {
    mechanic: "attribute-headgear",
    description: "a headpiece granting +1 to a chosen attribute, stacking with its rune",
    kind: "gap",
    reason:
      "The one genuinely non-cosmetic per-piece choice in the reference, and the reason a " +
      "maxed character reaches rank 16 rather than 15. Armor pieces here carry an insignia " +
      "and a rune and nothing else, so the head slot is currently no different from the feet.",
    affects: [],
  },
  {
    mechanic: "profession-insignias",
    description: "insignias available to one profession only, each with its own bonus",
    kind: "gap",
    reason:
      "Only universal insignias are modelled. The profession-specific ones are what " +
      "make an armor set feel like a set, and they are roughly forty more catalog entries " +
      "with no new mechanics behind them.",
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
      "Armor is derived from the primary profession, which matches the reference at max " +
      "armor: every max set within a profession has the same rating, and the differences " +
      "between sets became insignias. Modelling per-piece ratings would add arithmetic " +
      "without adding a decision.",
    affects: [],
  },
  {
    mechanic: "armor-damage-type-resistance",
    description: "armor that resists one damage type specifically, such as a ranger's vs elemental",
    kind: "gap",
    reason:
      "The damage pipeline knows a packet's type and the Stalwart insignia already keys off " +
      "it, so the seam exists — but no profession carries an inherent resistance, and this " +
      "project models only the physical/untyped split rather than the full elemental spread.",
    affects: ["stalwart"],
  },
  {
    mechanic: "shield-block",
    description: "a shield giving a chance to block an incoming attack outright",
    kind: "gap",
    reason:
      "Shields grant armor only. Blocking needs an attack pipeline to interrupt, which " +
      "arrives with weapon auto-attacks; the swing's draw protocol already reserves a roll " +
      "for it so that adding it later cannot change existing seeds.",
    affects: ["shield"],
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
