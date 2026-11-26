import { describe, expect, it } from "vitest";

import {
  accessibleAttributeIds,
  CharacterValidationError,
  validateCharacter,
  type Character,
} from "./character.js";
import { MINIMAL_GW_INSPIRED_PVP_V1 } from "./ruleset.js";

const RULES = MINIMAL_GW_INSPIRED_PVP_V1.attributes;

function character(overrides: Partial<Character> = {}): Character {
  return {
    id: "char-1",
    name: "Test Character",
    primaryProfession: "warrior",
    secondaryProfession: "monk",
    attributes: [],
    ...overrides,
  };
}

describe("accessibleAttributeIds", () => {
  it("includes all 4 of the primary profession's attributes", () => {
    const ids = accessibleAttributeIds("warrior", undefined);
    expect(ids).toEqual(
      expect.arrayContaining([
        "warrior.strength",
        "warrior.axe-mastery",
        "warrior.hammer-mastery",
        "warrior.swordsmanship",
        "warrior.tactics",
      ]),
    );
    expect(ids).toHaveLength(5);
  });

  it("adds only the secondary profession's non-primary attributes", () => {
    const ids = accessibleAttributeIds("warrior", "monk");
    expect(ids).toContain("monk.healing-prayers");
    expect(ids).toContain("monk.protection-prayers");
    expect(ids).toContain("monk.smiting-prayers");
    // The secondary profession's PRIMARY attribute must never be accessible.
    expect(ids).not.toContain("monk.divine-favor");
    // 5 warrior attributes + 3 non-primary monk attributes.
    expect(ids).toHaveLength(8);
  });

  it("never grants a second profession's primary attribute even transitively", () => {
    for (const secondary of ["ranger", "necromancer", "mesmer", "elementalist"] as const) {
      const ids = accessibleAttributeIds("warrior", secondary);
      const secondaryPrimaryId = `${secondary}.${
        {
          ranger: "expertise",
          necromancer: "soul-reaping",
          mesmer: "fast-casting",
          elementalist: "energy-storage",
        }[secondary]
      }`;
      expect(ids).not.toContain(secondaryPrimaryId);
    }
  });
});

describe("validateCharacter", () => {
  it("accepts a well-formed character with no attribute allocations", () => {
    expect(() => validateCharacter(character(), RULES)).not.toThrow();
  });

  it("accepts a character with valid, affordable allocations", () => {
    const c = character({
      attributes: [
        { attributeId: "warrior.strength", rank: 10 },
        { attributeId: "monk.healing-prayers", rank: 8 },
      ],
    });
    expect(() => validateCharacter(c, RULES)).not.toThrow();
  });

  it("rejects an empty name", () => {
    expect(() => validateCharacter(character({ name: "" }), RULES)).toThrow(
      CharacterValidationError,
    );
    expect(() => validateCharacter(character({ name: "   " }), RULES)).toThrow(
      CharacterValidationError,
    );
  });

  it("rejects a secondary profession identical to the primary", () => {
    expect(() =>
      validateCharacter(
        character({ primaryProfession: "warrior", secondaryProfession: "warrior" }),
        RULES,
      ),
    ).toThrow(CharacterValidationError);
  });

  it("rejects investing in another profession's primary attribute", () => {
    const c = character({ attributes: [{ attributeId: "monk.divine-favor", rank: 5 }] });
    expect(() => validateCharacter(c, RULES)).toThrow(CharacterValidationError);
  });

  it("rejects investing in an attribute from a profession that is neither primary nor secondary", () => {
    const c = character({
      primaryProfession: "warrior",
      secondaryProfession: "monk",
      attributes: [{ attributeId: "ranger.marksmanship", rank: 5 }],
    });
    expect(() => validateCharacter(c, RULES)).toThrow(CharacterValidationError);
  });

  it("rejects an unknown attribute id", () => {
    const c = character({ attributes: [{ attributeId: "warrior.not-a-real-attribute", rank: 5 }] });
    expect(() => validateCharacter(c, RULES)).toThrow(CharacterValidationError);
  });

  it("rejects a duplicate attribute allocation", () => {
    const c = character({
      attributes: [
        { attributeId: "warrior.strength", rank: 5 },
        { attributeId: "warrior.strength", rank: 3 },
      ],
    });
    expect(() => validateCharacter(c, RULES)).toThrow(CharacterValidationError);
  });

  it("rejects a rank outside [0, MAX_ATTRIBUTE_RANK]", () => {
    expect(() =>
      validateCharacter(
        character({ attributes: [{ attributeId: "warrior.strength", rank: -1 }] }),
        RULES,
      ),
    ).toThrow(CharacterValidationError);
    expect(() =>
      validateCharacter(
        character({ attributes: [{ attributeId: "warrior.strength", rank: 13 }] }),
        RULES,
      ),
    ).toThrow(CharacterValidationError);
  });

  it("rejects an allocation that exceeds the point budget", () => {
    const c = character({
      attributes: [
        { attributeId: "warrior.strength", rank: 12 },
        { attributeId: "warrior.axe-mastery", rank: 12 },
        { attributeId: "warrior.swordsmanship", rank: 12 },
        { attributeId: "warrior.tactics", rank: 12 },
      ],
    });
    expect(() => validateCharacter(c, { attributePointBudget: 10 })).toThrow(
      CharacterValidationError,
    );
  });

  it("allows 12/12/3, which spends the 200-point budget exactly, and refuses 12/12/4", () => {
    const build = (third: number) =>
      character({
        attributes: [
          { attributeId: "warrior.strength", rank: 12 },
          { attributeId: "warrior.swordsmanship", rank: 12 },
          { attributeId: "warrior.tactics", rank: third },
        ],
      });
    expect(RULES.attributePointBudget).toBe(200);
    expect(() => validateCharacter(build(3), RULES)).not.toThrow();
    expect(() => validateCharacter(build(4), RULES)).toThrow(CharacterValidationError);
  });

  it("reports every problem at once, not just the first", () => {
    const c = character({
      name: "",
      primaryProfession: "warrior",
      secondaryProfession: "warrior",
      attributes: [{ attributeId: "warrior.not-real", rank: 99 }],
    });
    try {
      validateCharacter(c, RULES);
      expect.fail("expected validateCharacter to throw");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("name must not be empty");
      expect(message).toContain("secondary profession must differ");
      expect(message).toContain("unknown attribute id");
    }
  });
});
