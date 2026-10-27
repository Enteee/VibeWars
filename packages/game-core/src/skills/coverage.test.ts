import { describe, expect, it } from "vitest";

import { IMPLEMENTED_SKILLS } from "./catalog.js";
import {
  MISSING_MECHANIC_DESCRIPTIONS,
  computeCoverage,
  formatCoverage,
  missingMechanics,
} from "./coverage.js";

/**
 * The coverage regression gate (brief §9, §29).
 *
 * These tests exist to make one specific dishonesty impossible: quietly
 * letting the implemented/imported gap grow, or papering over a skill by
 * mapping it onto whatever generic effect happens to be nearby. They
 * assert on process, not on gameplay — which is why they live apart from
 * `catalog.test.ts`.
 */

/** The five corpus skills that have no implementation. Kept literal on purpose. */
const KNOWN_UNIMPLEMENTED = [
  "elementalist.meteor-shower",
  "mesmer.arcane-echo",
  "mesmer.echo",
  "monk.contemplation-of-purity",
  "warrior.whirlwind-attack",
] as const;

const CORPUS = [
  "elementalist.armor-of-earth",
  "elementalist.fireball",
  "elementalist.meteor-shower",
  "mesmer.arcane-echo",
  "mesmer.echo",
  "monk.contemplation-of-purity",
  "monk.guardian",
  "monk.orison-of-healing",
  "necromancer.contagion",
  "necromancer.faintheartedness",
  "necromancer.parasitic-bond",
  "ranger.barrage",
  "ranger.broad-head-arrow",
  "ranger.troll-unguent",
  "warrior.backbreaker",
  "warrior.swift-chop",
  "warrior.whirlwind-attack",
];

describe("skill coverage regression gate", () => {
  it("records a reason for every unimplemented skill", () => {
    // The core anti-dishonesty assertion. A new corpus skill that nobody
    // implements and nobody explains fails here, rather than silently
    // enlarging a number in a report no one reads.
    const coverage = computeCoverage(CORPUS);

    expect(coverage.unexplained).toEqual([]);
    for (const skill of coverage.unimplemented) {
      expect(skill.missing.length).toBeGreaterThan(0);
    }
  });

  it("surfaces an unexplained skill instead of inventing a reason for it", () => {
    const coverage = computeCoverage([...CORPUS, "mesmer.some-new-import"]);

    expect(coverage.unexplained).toEqual(["mesmer.some-new-import"]);
    expect(formatCoverage(coverage)).toContain("NO REASON RECORDED");
  });

  it("holds the line on what is implemented", () => {
    // A pinned floor, not an exact count: adding skills is good and should
    // not fail CI, but losing one silently should.
    const coverage = computeCoverage(CORPUS);

    expect(coverage.implemented).toBeGreaterThanOrEqual(IMPLEMENTED_SKILLS.length);
    expect(coverage.unimplemented.map((s) => s.id)).toEqual([...KNOWN_UNIMPLEMENTED]);
  });

  it("never counts an original-design skill as corpus coverage", () => {
    // The subtle way to fake coverage: write your own skill, then let it
    // be counted as though the corpus skill had been implemented.
    const coverage = computeCoverage(CORPUS);

    for (const id of coverage.originalDesign) {
      expect(CORPUS).not.toContain(id);
    }
    expect(coverage.implemented - coverage.originalDesign.length).toBe(
      coverage.imported - coverage.unimplemented.length,
    );
  });

  it("describes every mechanic it blames a skill on", () => {
    const grouped = missingMechanics(computeCoverage(CORPUS));

    expect(grouped.size).toBeGreaterThan(0);
    for (const mechanic of grouped.keys()) {
      expect(MISSING_MECHANIC_DESCRIPTIONS[mechanic]).toBeTruthy();
    }
  });

  it("groups skills by the mechanic they wait on", () => {
    const grouped = missingMechanics(computeCoverage(CORPUS));

    expect(grouped.get("skill-bar-mutation")).toEqual(["mesmer.arcane-echo", "mesmer.echo"]);
    expect(grouped.get("ground-targeting")).toEqual(["elementalist.meteor-shower"]);
    expect(grouped.get("title-attribute")).toEqual(["warrior.whirlwind-attack"]);
  });

  it("does not blame a mechanic that now exists", () => {
    // Areas shipped (#5). Fireball and Barrage use them; the three skills
    // that waited on them still wait, on something else.
    for (const skill of computeCoverage(CORPUS).unimplemented) {
      expect(skill.missing, skill.id).not.toContain("area-of-effect");
    }
  });

  it("counts a duplicated import once", () => {
    const coverage = computeCoverage([...CORPUS, "elementalist.fireball"]);

    expect(coverage.imported).toBe(CORPUS.length);
  });

  it("reports a reason in the human-readable output", () => {
    const text = formatCoverage(computeCoverage(CORPUS));

    expect(text).toContain("mesmer.echo — needs skill-bar-mutation");
    expect(text).toContain("blocked on:");
    expect(text).toContain(MISSING_MECHANIC_DESCRIPTIONS.knockdown);
  });
});
