import { defaultEquipmentFor, encodeTemplate, looksLikeTemplate } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { exportBuild } from "./build-transfer.js";
import { importTemplate } from "./gw1-template.js";
import { CHARACTER_SCHEMA_VERSION, type StoredCharacter } from "./schema.js";

/**
 * Importing a GW1 template code as a character (#494): the codec itself
 * is game-core's, tested there. A code is untrusted text, like a JSON
 * build, so a refusal is the build rules' message, never a throw.
 */

const WARRIOR_MONK: StoredCharacter = {
  schemaVersion: CHARACTER_SCHEMA_VERSION,
  id: "local-1",
  name: "Hammer",
  primaryProfession: "warrior",
  secondaryProfession: "monk",
  attributes: [
    { attributeId: "warrior.strength", rank: 12 },
    { attributeId: "warrior.hammer-mastery", rank: 10 },
  ],
  skillBar: [
    "warrior.hammer-bash",
    "warrior.backbreaker",
    null,
    "monk.orison-of-healing",
    null,
    null,
    null,
    null,
  ],
  equipment: defaultEquipmentFor("warrior"),
  updatedAt: 1,
};

function codeOf(character: StoredCharacter): string {
  const encoded = encodeTemplate(character);
  if (!encoded.ok) {
    throw new Error(encoded.problem);
  }
  return encoded.code;
}

function problemsOf(code: string): readonly string[] {
  const result = importTemplate(code, "local-2", 42);
  return result.ok ? [] : result.problems;
}

describe("importing a GW1 template code (#494)", () => {
  it("makes a new character named for its professions, in its primary's gear", () => {
    const result = importTemplate(codeOf(WARRIOR_MONK), "local-2", 42);
    expect(result).toMatchObject({
      ok: true,
      missingSkills: [],
      character: {
        ...WARRIOR_MONK,
        id: "local-2",
        updatedAt: 42,
        name: "Warrior/Monk build",
      },
    });
  });

  it("names a build with no secondary for its primary alone", () => {
    const result = importTemplate(
      codeOf({
        ...WARRIOR_MONK,
        secondaryProfession: undefined,
        attributes: [],
        skillBar: Array<null>(8).fill(null),
      }),
      "local-2",
      42,
    );
    expect(result.ok && result.character.name).toBe("Warrior build");
  });

  it("refuses what is not a code with the codec's reason", () => {
    expect(problemsOf("OQMAAAAA-AAAAAAA")).toEqual(["This is not a GW1 skill template."]);
  });

  it.each([
    ["rank 13", { attributes: [{ attributeId: "warrior.strength", rank: 13 }] }, "rank 13"],
    [
      "an attribute neither profession has",
      { attributes: [{ attributeId: "elementalist.fire-magic", rank: 10 }] },
      "not accessible",
    ],
    [
      "the same skill twice",
      {
        skillBar: ["warrior.swift-chop", "warrior.swift-chop", null, null, null, null, null, null],
      },
      "more than once",
    ],
  ])("refuses %s as a JSON build is refused", (_, change, problem) => {
    expect(problemsOf(codeOf({ ...WARRIOR_MONK, ...change }))).toEqual([
      expect.stringContaining(problem),
    ]);
  });

  it("does not take an exported JSON build for a code", () => {
    expect(looksLikeTemplate(exportBuild(WARRIOR_MONK))).toBe(false);
  });
});
