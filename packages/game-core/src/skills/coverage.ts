import { IMPLEMENTED_SKILLS } from "./catalog.js";

/**
 * Skill coverage reporting (brief §9, §29).
 *
 * The brief is explicit that a skill existing in the database is NOT the
 * same as it being implemented, and that coverage must never be faked.
 * This makes the distinction machine-readable so CI can assert on it and
 * a future build UI can show implementation status per skill.
 */

export interface SkillCoverage {
  /** Skills present in the imported reference corpus. */
  readonly imported: number;
  /** Skills implemented against the generic effect system. */
  readonly implemented: number;
  /** Imported skill ids with no implementation yet. */
  readonly unimplemented: readonly string[];
  /** Implemented skills that are this project's own design, not imports. */
  readonly originalDesign: readonly string[];
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

  const unimplemented = importedSkillIds.filter((id) => !implementedIds.has(id)).sort();
  const originalDesign = [...implementedIds].filter((id) => !importedSet.has(id)).sort();

  return {
    imported: importedSet.size,
    implemented: implementedIds.size,
    unimplemented,
    originalDesign,
  };
}

export function formatCoverage(coverage: SkillCoverage): string {
  const lines = [
    `imported:    ${String(coverage.imported)}`,
    `implemented: ${String(coverage.implemented)}`,
    `unimplemented (${String(coverage.unimplemented.length)}):`,
    ...coverage.unimplemented.map((id) => `  - ${id}`),
  ];
  if (coverage.originalDesign.length > 0) {
    lines.push(
      `original-design skills not from the corpus (${String(coverage.originalDesign.length)}):`,
      ...coverage.originalDesign.map((id) => `  - ${id}`),
    );
  }
  return lines.join("\n");
}
