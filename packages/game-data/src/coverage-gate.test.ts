import { describe, expect, it } from "vitest";

import {
  IMPLEMENTED_SKILLS,
  computeCoverage,
  missingMechanics,
  resolveMagnitudeAtRanks,
  unmaintainedUpkeepSkills,
  type LevelScaling,
} from "@vibewars/game-core";

import { corpusSkills } from "./corpus.js";
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

  it("marks a touch skill exactly where its corpus text has its user touch the target (#1966)", () => {
    const descriptions = new Map(corpusSkills().map((skill) => [skill.gwId, skill.description]));
    const touches = /\btouched\b|\btouch (?:target|the body)\b/i;
    const corpus = IMPLEMENTED_SKILLS.filter(
      (skill) => skill.gwId !== undefined && touches.test(descriptions.get(skill.gwId) ?? ""),
    ).map((skill) => skill.id);
    const marked = IMPLEMENTED_SKILLS.filter((skill) => skill.touch === true).map(
      (skill) => skill.id,
    );
    expect(corpus.length).toBeGreaterThan(0);
    expect(marked).toEqual(corpus);
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

/** A scaled number: its value at ranks 0 and 12 of its attribute. */
interface Ends {
  readonly atZero: number;
  readonly atTwelve: number;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

function isEnds(value: unknown): value is Ends {
  return isRecord(value) && typeof value.atZero === "number" && typeof value.atTwelve === "number";
}

function isLevelLine(value: unknown): value is { readonly byLevel: LevelScaling } {
  if (!isRecord(value) || !isRecord(value.byLevel)) {
    return false;
  }
  const { level, atLevelZero, perLevel } = value.byLevel;
  return (
    isEnds(level) &&
    isRecord(level) &&
    typeof level.attributeId === "string" &&
    typeof atLevelZero === "number" &&
    typeof perLevel === "number"
  );
}

/** Every object reachable from `root`, once each: summoned creatures and their replacements included. */
function reachable(root: unknown): readonly Readonly<Record<string, unknown>>[] {
  const seen = new Set<unknown>();
  const found: Readonly<Record<string, unknown>>[] = [];
  const visit = (value: unknown): void => {
    if (!isRecord(value) || seen.has(value)) {
      return;
    }
    seen.add(value);
    found.push(value);
    for (const child of Object.values(value)) {
      visit(child);
    }
  };
  visit(root);
  return found;
}

/** GW1's `a...b`: a scaled number at ranks 0 and 15. */
function corpusPairs(description: string): readonly (readonly [number, number])[] {
  return [...description.matchAll(/(\d+)\.\.\.(\d+)/g)].map(
    (match) => [Number(match[1]), Number(match[2])] as const,
  );
}

/** The line through ranks 0 and 15, at 12: never the wiki's rounded table. */
function exactAtTwelve([atZero, atFifteen]: readonly [number, number]): number {
  return atZero + 0.8 * (atFifteen - atZero);
}

describe("scaled numbers at rank 12 against gw-skilldata (#1899)", () => {
  const descriptions = new Map(corpusSkills().map((skill) => [skill.gwId, skill.description]));
  const described = IMPLEMENTED_SKILLS.flatMap((skill) => {
    const description = skill.gwId === undefined ? undefined : descriptions.get(skill.gwId);
    return description === undefined ? [] : [{ skill, description }];
  });

  it("gives every summoned creature its corpus level line, and 80 + 20 Health a whole level", () => {
    let creatures = 0;
    for (const { skill, description } of described) {
      for (const node of reachable(skill)) {
        const attack = node.attack;
        const health = node.maxHealth;
        if (!isRecord(attack) || !isRecord(attack.scaling) || attack.scaling.kind !== "level") {
          continue;
        }
        const level = attack.scaling.level;
        if (!isEnds(level) || !isLevelLine(health) || !isLevelLine(node.armor)) {
          throw new Error(`${skill.id}: a creature without a level, or Health or armor off it`);
        }
        const name = String(node.name);
        const pair = new RegExp(`level (\\d+)\\.\\.\\.(\\d+) ${name}`, "i").exec(description);
        expect(pair, `${skill.id} names no "level a...b ${name}"`).not.toBeNull();
        const corpus = [Number(pair?.[1]), Number(pair?.[2])] as const;
        creatures += 1;
        expect(level.atZero, `${skill.id} level at 0`).toBe(corpus[0]);
        expect(level.atTwelve, `${skill.id} level at 12`).toBeCloseTo(exactAtTwelve(corpus), 3);
        // One level line for blows, Health and armor alike.
        expect(health.byLevel.level, `${skill.id} Health's level`).toMatchObject(level);
        expect(node.armor.byLevel.level, `${skill.id} armor's level`).toMatchObject(level);
        // GW1's level is whole, so Health steps: 80 + 20·21 = 500 for the
        // Flesh Golem at 12, never 80 + 20·20.6. Runes reach 15.
        const { attributeId } = health.byLevel.level;
        for (let rank = 0; rank <= 15; rank += 1) {
          const whole = Math.round(corpus[0] + ((corpus[1] - corpus[0]) * rank) / 15);
          expect(
            resolveMagnitudeAtRanks(health, new Map([[attributeId, rank]])),
            `${skill.id} Health at ${String(rank)}`,
          ).toBe(80 + 20 * whole);
        }
      }
    }
    // Not vacuous: Animate Bone Minions, Animate Flesh Golem and the rest.
    expect(creatures).toBeGreaterThanOrEqual(6);
  });

  /**
   * What is wrong with the Health of `skill`'s spirits (#1917), when its
   * corpus text makes a "level a...b spirit": anything but GW1's 50 + 20
   * per whole level, at every rank to 15, is named.
   */
  function spiritHealthProblems(skill: unknown, description: string): readonly string[] {
    const pair = /level (\d+)\.\.\.(\d+) spirit/i.exec(description);
    if (pair === null) {
      return [];
    }
    const corpus = [Number(pair[1]), Number(pair[2])] as const;
    return reachable(skill).flatMap((node) => {
      if (node.kind !== "spirit") {
        return [];
      }
      const name = String(node.name);
      const health = node.maxHealth;
      if (!isLevelLine(health)) {
        return [`${name}: Health is not a level line`];
      }
      const { attributeId } = health.byLevel.level;
      return Array.from({ length: 16 }, (_, rank) => rank).flatMap((rank) => {
        const whole = Math.round(corpus[0] + ((corpus[1] - corpus[0]) * rank) / 15);
        const got = resolveMagnitudeAtRanks(health, new Map([[attributeId, rank]]));
        return got === 50 + 20 * whole
          ? []
          : [`${name}: Health ${String(got)} at ${String(rank)}, GW1 ${String(50 + 20 * whole)}`];
      });
    });
  }

  it("gives every spirit 50 + 20 Health a whole level of its corpus line (#1917)", () => {
    const spirits = described.filter(({ description }) =>
      /level \d+\.\.\.\d+ spirit/i.test(description),
    );
    expect(
      spirits.flatMap(({ skill, description }) =>
        spiritHealthProblems(skill, description).map((problem) => `${skill.id}: ${problem}`),
      ),
    ).toEqual([]);
    // Not vacuous: every nature ritual and binding ritual.
    expect(spirits.length).toBeGreaterThanOrEqual(20);
  });

  it("names a spirit whose Health is a straight line through ranks 0 and 12 (#1917)", () => {
    const straight = {
      effects: [
        {
          creature: {
            kind: "spirit",
            name: "Straight",
            maxHealth: {
              scaling: { attributeId: "ranger.wilderness-survival", atZero: 70, atTwelve: 210 },
            },
          },
        },
      ],
    };
    expect(spiritHealthProblems(straight, "Create a level 1...10 spirit.")).toEqual([
      "Straight: Health is not a level line",
    ]);
  });

  it("never stores the wiki's rounded rank-12 value for a corpus a...b", () => {
    const hits: string[] = [];
    for (const { skill, description } of described) {
      const pairs = corpusPairs(description);
      for (const node of reachable(skill)) {
        if (!isEnds(node)) {
          continue;
        }
        for (const pair of pairs) {
          const exact = exactAtTwelve(pair);
          if (
            !Number.isInteger(exact) &&
            node.atZero === pair[0] &&
            node.atTwelve === Math.round(exact)
          ) {
            hits.push(
              `${skill.id}: ${String(pair[0])}...${String(pair[1])} is ${String(exact)} at 12`,
            );
          }
        }
      }
    }
    expect(hits).toEqual([]);
  });
});
