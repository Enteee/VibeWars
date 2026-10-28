import { describe, expect, it } from "vitest";

import {
  IMPLEMENTED_SKILLS,
  computeCoverage,
  missingMechanics,
  unmaintainedUpkeepSkills,
} from "@vibewars/game-core";

import { generateSkillBundle } from "./generate.js";
import { gwSkillDataDir, readGwSkillData } from "./sources/gw-skilldata.js";

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

  it("maintains every catalog skill the corpus marks as upkeep (#840)", () => {
    const upkeep = generateSkillBundle()
      .skills.filter((skill) => skill.upkeep)
      .map((skill) => skill.id);
    // Not vacuous: Mending is in the corpus and is an upkeep skill.
    expect(upkeep).toContain("monk.mending");
    expect(unmaintainedUpkeepSkills(upkeep)).toEqual([]);
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

describe("every catalog skill against gw-skilldata (#1207)", () => {
  const corpus = readGwSkillData(gwSkillDataDir());

  it("names the base record of the GW1 skill it is, by its exact name", () => {
    for (const skill of IMPLEMENTED_SKILLS) {
      if (skill.gwId !== undefined) {
        const record = corpus.get(skill.gwId);
        // A PvP split's own record is never the one: template codes carry the base id.
        expect({ name: record?.name, pvp: record?.pvp }, skill.id).toEqual({
          name: skill.name,
          pvp: false,
        });
      }
    }
  });

  it("gives no two skills one GW1 id", () => {
    const ids = IMPLEMENTED_SKILLS.flatMap((skill) =>
      skill.gwId === undefined ? [] : [skill.gwId],
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("leaves only this game's own design without one: Vital Transfer", () => {
    expect(
      IMPLEMENTED_SKILLS.filter((skill) => skill.gwId === undefined).map((skill) => skill.id),
    ).toEqual(["necromancer.blood-renewal-lite"]);
  });
});
