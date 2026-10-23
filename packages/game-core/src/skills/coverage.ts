import { IMPLEMENTED_SKILLS } from "./catalog.js";

/**
 * Skill coverage reporting (brief §9, §29).
 *
 * The brief is explicit that a skill existing in the database is NOT the
 * same as it being implemented, and that coverage must never be faked.
 * This makes the distinction machine-readable so CI can assert on it and
 * a future build UI can show implementation status per skill.
 *
 * Reporting a count alone would be a weak form of honesty: "7 skills
 * unimplemented" invites the reader to assume the work is nearly done.
 * Naming the *mechanic* each one is waiting on is the useful statement,
 * because it says what would have to be built, and it makes the silent
 * failure mode — adding a corpus skill nobody ever looks at again —
 * impossible to miss. `coverage.test.ts` fails if an unimplemented skill
 * has no recorded reason.
 */

/**
 * A simulation capability `game-core` does not have yet.
 *
 * Deliberately a closed union rather than free text: a typo in a reason
 * string would quietly create a new "mechanic" and split the report, and
 * grouping skills by what they are waiting on is the whole point.
 */
export type MissingMechanic =
  | "area-of-effect"
  | "knockdown"
  | "skill-bar-mutation"
  | "enchantment-sacrifice"
  | "reactive-triggers"
  | "expiry-triggers"
  | "weapon-attacks";

/** What each missing mechanic would mean to build, in one line. */
export const MISSING_MECHANIC_DESCRIPTIONS: Readonly<Record<MissingMechanic, string>> =
  Object.freeze({
    "area-of-effect": "effects that hit every target in a radius, or a ground location",
    knockdown: "a control state that interrupts and immobilises for a duration",
    "skill-bar-mutation": "a skill that replaces itself with a different skill at runtime",
    "enchantment-sacrifice": "removing your own enchantments as a cost, scaled by how many",
    "reactive-triggers": "effects that fire in response to something happening to you",
    "expiry-triggers": "effects that fire when a status ends rather than when it is applied",
    "weapon-attacks": "attack skills that ride on an underlying weapon auto-attack",
  });

/**
 * Why each imported-but-unimplemented skill is not in the catalog.
 *
 * Keyed by skill id; several mechanics per skill where the skill genuinely
 * needs all of them (Meteor Shower is not blocked on area-of-effect alone,
 * and saying so would understate the work).
 */
const UNIMPLEMENTED_REASONS: Readonly<Record<string, readonly MissingMechanic[]>> = Object.freeze({
  // "...foes adjacent to that location are struck... and knocked down every 3 seconds."
  "elementalist.meteor-shower": ["area-of-effect", "knockdown"],
  // "...Arcane Echo is replaced with that spell for 20 seconds."
  "mesmer.arcane-echo": ["skill-bar-mutation"],
  // "...Echo is replaced with the next skill you use."
  "mesmer.echo": ["skill-bar-mutation"],
  // "Lose all enchantments. For each one lost, you gain health, lose one hex..."
  "monk.contemplation-of-purity": ["enchantment-sacrifice"],
  // "...whenever you suffer from a new Condition, all foes in the area suffer..."
  "necromancer.contagion": ["reactive-triggers", "area-of-effect"],
  // "The caster is healed for 30...120 when Parasitic Bond ends."
  "necromancer.parasitic-bond": ["expiry-triggers"],
  // "Attack target and adjacent foes."
  "warrior.whirlwind-attack": ["weapon-attacks", "area-of-effect"],
});

export interface UnimplementedSkill {
  readonly id: string;
  /**
   * The mechanics this skill is waiting on. Empty means nobody recorded a
   * reason — which is the exact gap this module exists to surface, so it
   * is reported rather than defaulted to something plausible.
   */
  readonly missing: readonly MissingMechanic[];
}

export interface SkillCoverage {
  /** Skills present in the imported reference corpus. */
  readonly imported: number;
  /** Skills implemented against the generic effect system. */
  readonly implemented: number;
  /** Imported skills with no implementation yet, and why. */
  readonly unimplemented: readonly UnimplementedSkill[];
  /** Implemented skills that are this project's own design, not imports. */
  readonly originalDesign: readonly string[];
  /**
   * Unimplemented skills with no recorded reason. Always empty in a healthy
   * repository; `coverage.test.ts` is what keeps it that way.
   */
  readonly unexplained: readonly string[];
}

/**
 * Compute coverage against a list of imported skill ids.
 *
 * Takes the imported ids as a parameter rather than importing
 * `@vibewars/game-data` directly: `game-core` must stay dependency-free
 * (ADR-0001), and the caller (a CLI, a test, a future build UI) is the
 * one that already has the corpus loaded.
 */
export function computeCoverage(importedSkillIds: readonly string[]): SkillCoverage {
  const implementedIds = new Set(IMPLEMENTED_SKILLS.map((s) => s.id));
  const importedSet = new Set(importedSkillIds);

  const unimplemented = [...importedSet]
    .filter((id) => !implementedIds.has(id))
    .sort()
    .map((id) => ({ id, missing: UNIMPLEMENTED_REASONS[id] ?? [] }));

  const originalDesign = [...implementedIds].filter((id) => !importedSet.has(id)).sort();

  return {
    imported: importedSet.size,
    implemented: implementedIds.size,
    unimplemented,
    originalDesign,
    unexplained: unimplemented.filter((s) => s.missing.length === 0).map((s) => s.id),
  };
}

/** Group unimplemented skills by the mechanic they are waiting on. */
export function missingMechanics(
  coverage: SkillCoverage,
): ReadonlyMap<MissingMechanic, readonly string[]> {
  const grouped = new Map<MissingMechanic, string[]>();
  for (const skill of coverage.unimplemented) {
    for (const mechanic of skill.missing) {
      const existing = grouped.get(mechanic);
      if (existing === undefined) {
        grouped.set(mechanic, [skill.id]);
      } else {
        existing.push(skill.id);
      }
    }
  }
  return grouped;
}

export function formatCoverage(coverage: SkillCoverage): string {
  const lines = [
    `imported:    ${String(coverage.imported)}`,
    `implemented: ${String(coverage.implemented)}`,
    `unimplemented (${String(coverage.unimplemented.length)}):`,
    ...coverage.unimplemented.map((skill) => {
      const why = skill.missing.length === 0 ? "NO REASON RECORDED" : skill.missing.join(", ");
      return `  - ${skill.id} — needs ${why}`;
    }),
  ];

  const grouped = missingMechanics(coverage);
  if (grouped.size > 0) {
    lines.push("", "blocked on:");
    for (const [mechanic, ids] of [...grouped].sort((a, b) => b[1].length - a[1].length)) {
      lines.push(
        `  ${mechanic} (${String(ids.length)}) — ${MISSING_MECHANIC_DESCRIPTIONS[mechanic]}`,
      );
    }
  }

  if (coverage.originalDesign.length > 0) {
    lines.push(
      "",
      `original-design skills not from the corpus (${String(coverage.originalDesign.length)}):`,
      ...coverage.originalDesign.map((id) => `  - ${id}`),
    );
  }
  return lines.join("\n");
}
