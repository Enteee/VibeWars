import { describe, expect, it } from "vitest";

import {
  MISSING_MECHANIC_DESCRIPTIONS,
  computeCoverage,
  formatCoverage,
  missingMechanics,
  unmaintainedUpkeepSkills,
  type CorpusRef,
  type SkillCoverage,
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

const CORPUS: readonly CorpusRef[] = [
  { gwId: 74, name: "Echo" },
  { gwId: 186, name: "Fireball" },
  { gwId: 258, name: "Guardian" },
  { gwId: 358, name: "Backbreaker" },
  { gwId: 395, name: "Barrage" },
  { gwId: 1356, name: "Contagion" },
];

/**
 * Two gaps, built by hand: every PvP corpus skill is in the catalog since
 * #2503, so no real one is left to group or print.
 */
const TWO_GAPS: SkillCoverage = {
  imported: 8,
  implemented: 6,
  unimplemented: [
    { gwId: 99_998, name: "First Gap", missing: ["unwritten"] },
    { gwId: 99_999, name: "Second Gap", missing: ["unwritten"] },
  ],
  originalDesign: [],
  unexplained: [],
};

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

    expect(coverage.implemented).toBe(CORPUS.length);
    expect(coverage.unimplemented).toEqual([]);
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
    const grouped = missingMechanics(TWO_GAPS);

    expect(grouped.size).toBeGreaterThan(0);
    for (const mechanic of grouped.keys()) {
      expect(MISSING_MECHANIC_DESCRIPTIONS[mechanic]).toBeTruthy();
    }
  });

  it("groups skills by the mechanic they wait on, each once", () => {
    expect(missingMechanics(TWO_GAPS).get("unwritten")).toEqual([99_998, 99_999]);
  });

  it("counts a duplicated corpus entry once", () => {
    const coverage = computeCoverage([...CORPUS, { gwId: 186, name: "Fireball" }]);

    expect(coverage.imported).toBe(CORPUS.length);
  });

  it("reports a reason in the human-readable output", () => {
    const text = formatCoverage(TWO_GAPS);

    expect(text).toContain("imported 8 / implemented 6 / 2 unimplemented");
    expect(text).toContain("99998 First Gap — needs unwritten");
    expect(text).toContain("blocked on:");
    expect(text).toContain(MISSING_MECHANIC_DESCRIPTIONS.unwritten);
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
