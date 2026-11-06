import { describe, expect, it } from "vitest";

import {
  MISSING_MECHANIC_DESCRIPTIONS,
  computeCoverage,
  formatCoverage,
  missingMechanics,
  unmaintainedUpkeepSkills,
  type CorpusRef,
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

/** One listed gap, Energy Boon: a corpus skill with no catalog entry. Kept literal on purpose. */
const KNOWN_UNIMPLEMENTED = [{ gwId: 837, name: "Energy Boon" }] as const;

const CORPUS: readonly CorpusRef[] = [
  { gwId: 74, name: "Echo" },
  { gwId: 186, name: "Fireball" },
  { gwId: 258, name: "Guardian" },
  { gwId: 358, name: "Backbreaker" },
  { gwId: 395, name: "Barrage" },
  { gwId: 1356, name: "Contagion" },
  ...KNOWN_UNIMPLEMENTED,
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
    // A made-up GW1 id: no catalog skill carries it and no reason names it.
    const coverage = computeCoverage([...CORPUS, { gwId: 99_999, name: "Some New Import" }]);

    expect(coverage.unexplained).toEqual([99_999]);
    expect(formatCoverage(coverage)).toContain("NO REASON RECORDED");
  });

  it("holds the line on what is implemented", () => {
    const coverage = computeCoverage(CORPUS);

    expect(coverage.implemented).toBe(CORPUS.length - KNOWN_UNIMPLEMENTED.length);
    expect(coverage.unimplemented.map((s) => s.gwId)).toEqual(
      KNOWN_UNIMPLEMENTED.map((s) => s.gwId),
    );
  });

  it("never counts an original-design skill as corpus coverage", () => {
    // The subtle way to fake coverage: write your own skill, then let it
    // be counted as though the corpus skill had been implemented.
    const coverage = computeCoverage(CORPUS);

    expect(coverage.originalDesign).not.toContain("elementalist.fireball");
    expect(coverage.originalDesign).toContain("necromancer.blood-renewal-lite");
    expect(coverage.implemented).toBe(coverage.imported - coverage.unimplemented.length);
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

    expect(grouped.get("max-health-per-max-energy")).toEqual([837]);
  });

  // No reason line names two mechanics since #2502 implemented Reclaim
  // Essence: one is grouped under the mechanic it waits on, once.
  it("counts a skill once under the mechanic it waits on (Balthazar's Pendulum)", () => {
    const coverage = computeCoverage([...CORPUS, { gwId: 1395, name: "Balthazar's Pendulum" }]);
    const grouped = missingMechanics(coverage);

    expect(coverage.unimplemented.filter((s) => s.gwId === 1395)).toHaveLength(1);
    expect(grouped.get("knockdown-offender")).toEqual([1395]);
  });

  it("counts a duplicated corpus entry once", () => {
    const coverage = computeCoverage([...CORPUS, { gwId: 186, name: "Fireball" }]);

    expect(coverage.imported).toBe(CORPUS.length);
  });

  it("reports a reason in the human-readable output", () => {
    const text = formatCoverage(computeCoverage(CORPUS));

    expect(text).toContain("imported 7 / implemented 6 / 1 unimplemented");
    expect(text).toContain("837 Energy Boon — needs max-health-per-max-energy");
    expect(text).toContain("blocked on:");
    expect(text).toContain(MISSING_MECHANIC_DESCRIPTIONS["max-health-per-max-energy"]);
  });

  it("passes an upkeep skill the catalog maintains (Mending, #840)", () => {
    expect(unmaintainedUpkeepSkills(["monk.mending"])).toEqual([]);
  });

  it("flags an upkeep skill the catalog does not maintain (#840)", () => {
    // Guardian is a timed enchantment here; were the corpus to call it
    // upkeep, the two would disagree and this must say so.
    expect(unmaintainedUpkeepSkills(["monk.guardian", "monk.mending"])).toEqual(["monk.guardian"]);
  });

  it("ignores an upkeep skill the catalog does not have (#840)", () => {
    expect(unmaintainedUpkeepSkills(["monk.not-in-the-catalog"])).toEqual([]);
  });
});
