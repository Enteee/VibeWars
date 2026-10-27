import { defaultBuildEquipment } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import {
  SKILL_BAR_SLOTS,
  equippableSkills,
  toCharacter,
  validateBuild,
} from "./build-validation.js";
import { CHARACTER_SCHEMA_VERSION, type StoredCharacter } from "./schema.js";

function stored(overrides: Partial<StoredCharacter> = {}): StoredCharacter {
  return {
    schemaVersion: CHARACTER_SCHEMA_VERSION,
    id: "c1",
    name: "Valid Character",
    primaryProfession: "elementalist",
    secondaryProfession: "monk",
    attributes: [{ attributeId: "elementalist.fire-magic", rank: 12 }],
    skillBar: Array.from({ length: SKILL_BAR_SLOTS }, () => null),
    equipment: defaultBuildEquipment("elementalist"),
    updatedAt: 1,
    ...overrides,
  };
}

describe("toCharacter", () => {
  it("maps stored fields onto the domain character", () => {
    const character = toCharacter(stored());
    expect(character.primaryProfession).toBe("elementalist");
    expect(character.secondaryProfession).toBe("monk");
    expect(character.attributes).toEqual([{ attributeId: "elementalist.fire-magic", rank: 12 }]);
  });
});

describe("validateBuild", () => {
  it("accepts a valid build with an empty bar", () => {
    expect(validateBuild(stored())).toEqual([]);
  });

  it("accepts a valid build with equipped skills", () => {
    const bar = [...stored().skillBar];
    bar[0] = "elementalist.fireball";
    bar[1] = "monk.orison-of-healing";
    expect(validateBuild(stored({ skillBar: bar }))).toEqual([]);
  });

  it("reports a character-level problem from game-core", () => {
    const problems = validateBuild(stored({ name: "" }));
    expect(problems.some((p) => p.message.includes("name must not be empty"))).toBe(true);
  });

  it("rejects investing in an inaccessible attribute", () => {
    const problems = validateBuild(
      stored({ attributes: [{ attributeId: "monk.divine-favor", rank: 5 }] }),
    );
    expect(problems.some((p) => p.message.includes("not accessible"))).toBe(true);
  });

  it("rejects a bar with the wrong number of slots", () => {
    const problems = validateBuild(stored({ skillBar: [null, null] }));
    expect(problems.some((p) => p.field === "skillBar")).toBe(true);
  });

  it("rejects an unknown skill id", () => {
    const bar = [...stored().skillBar];
    bar[0] = "not.a.real.skill";
    const problems = validateBuild(stored({ skillBar: bar }));
    expect(problems.some((p) => p.message.includes("unknown or not-yet-implemented"))).toBe(true);
  });

  it("rejects the same skill equipped twice", () => {
    const bar = [...stored().skillBar];
    bar[0] = "elementalist.fireball";
    bar[1] = "elementalist.fireball";
    const problems = validateBuild(stored({ skillBar: bar }));
    expect(problems.some((p) => p.message.includes("more than once"))).toBe(true);
  });

  it("reports every problem at once rather than stopping at the first", () => {
    const bar = [...stored().skillBar];
    bar[0] = "not.a.real.skill";
    const problems = validateBuild(stored({ name: "", skillBar: bar }));
    expect(problems.length).toBeGreaterThanOrEqual(2);
  });
});

describe("equippableSkills", () => {
  it("includes skills whose attribute the character can access", () => {
    const ids = equippableSkills(stored()).map((s) => s.id);
    expect(ids).toContain("elementalist.fireball");
    expect(ids).toContain("monk.orison-of-healing");
  });

  it("excludes skills from a profession the character does not have", () => {
    const ids = equippableSkills(stored()).map((s) => s.id);
    expect(ids).not.toContain("ranger.broad-head-arrow");
  });

  it("offers a Mesmer primary its four skills (#521)", () => {
    const ids = equippableSkills(
      stored({
        primaryProfession: "mesmer",
        attributes: [],
        equipment: defaultBuildEquipment("mesmer"),
      }),
    ).map((s) => s.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "mesmer.power-spike",
        "mesmer.power-drain",
        "mesmer.shatter-enchantment",
        "mesmer.drain-enchantment",
      ]),
    );
  });

  it("offers each profession its skill that depends on how things stand (#794)", () => {
    const offered = (profession: "monk" | "dervish" | "ranger") =>
      equippableSkills(
        stored({
          primaryProfession: profession,
          attributes: [],
          equipment: defaultBuildEquipment(profession),
        }),
      ).map((s) => s.id);
    expect(offered("monk")).toContain("monk.word-of-healing");
    expect(offered("dervish")).toContain("dervish.mystic-sweep");
    expect(offered("ranger")).toContain("ranger.savage-shot");
  });

  it("changes with the character's secondary profession", () => {
    const asRanger = equippableSkills(stored({ secondaryProfession: "ranger" })).map((s) => s.id);
    expect(asRanger).toContain("ranger.troll-unguent");
    expect(asRanger).not.toContain("monk.orison-of-healing");
  });

  it("offers fewer skills with no secondary profession than with one", () => {
    const withSecondary = equippableSkills(stored()).length;
    const without = equippableSkills(stored({ secondaryProfession: undefined })).length;
    expect(without).toBeLessThan(withSecondary);
  });
});
