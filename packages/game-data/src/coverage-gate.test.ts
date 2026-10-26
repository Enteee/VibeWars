import { describe, expect, it } from "vitest";

import { IMPLEMENTED_SKILLS, computeCoverage, missingMechanics } from "@vibewars/game-core";

import { generateSkillBundle } from "./generate.js";

/**
 * The coverage gate, run against the *real* committed corpus (brief §9, §29).
 *
 * `game-core`'s own coverage tests necessarily use a literal skill list,
 * because `game-core` must not depend on `game-data` (ADR-0001). That
 * leaves one hole: importing a new skill into the corpus would not fail
 * any test there. This closes it. Adding a skill to `normalized/` and
 * neither implementing it nor recording why fails CI here.
 */
describe("coverage gate against the committed corpus", () => {
  const coverage = computeCoverage(generateSkillBundle().skills.map((skill) => skill.id));

  it("explains every unimplemented skill in the real corpus", () => {
    expect(coverage.unexplained).toEqual([]);
  });

  it("implements a majority of the corpus", () => {
    // Not a vanity metric: if this drops, either skills were removed or
    // the corpus grew without the engine growing, and both deserve a look.
    const fromCorpus = coverage.implemented - coverage.originalDesign.length;
    expect(fromCorpus * 2).toBeGreaterThan(coverage.imported);
  });

  it("blames only mechanics the engine genuinely lacks", () => {
    // A guard against the lazy fix for the test above: marking a skill as
    // blocked on something already built, to avoid implementing it.
    const grouped = missingMechanics(coverage);
    const implementedMechanics = ["damage", "heal", "status", "interrupt"];

    for (const mechanic of grouped.keys()) {
      expect(implementedMechanics).not.toContain(mechanic);
    }
  });

  it("marks a catalog skill elite exactly when the corpus does (#459)", () => {
    const corpus = new Map(generateSkillBundle().skills.map((skill) => [skill.id, skill.elite]));
    for (const skill of IMPLEMENTED_SKILLS) {
      // Original designs have no corpus entry to agree with.
      const elite = corpus.get(skill.id);
      if (elite !== undefined) {
        expect(skill.elite, skill.id).toBe(elite);
      }
    }
  });
});
