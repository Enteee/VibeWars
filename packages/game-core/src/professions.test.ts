import { describe, expect, it } from "vitest";

import { PROFESSIONS, getAttribute, getProfession, primaryAttributeOf } from "./professions.js";

const ALL_PROFESSION_IDS = Object.keys(PROFESSIONS);

describe("PROFESSIONS", () => {
  it("has exactly 10 professions", () => {
    expect(ALL_PROFESSION_IDS).toHaveLength(10);
  });

  it("gives every profession 4 or 5 attributes", () => {
    // Deliberately a range, not a fixed count: the weapon professions
    // genuinely carry more attributes than the casters, and an
    // exactly-four rule left real skills (hammer attacks, earth magic)
    // with no attribute to belong to.
    for (const id of ALL_PROFESSION_IDS) {
      const count = getProfession(id as never).attributes.length;
      expect(count, `${id} has ${String(count)} attributes`).toBeGreaterThanOrEqual(4);
      expect(count, `${id} has ${String(count)} attributes`).toBeLessThanOrEqual(5);
    }
  });

  it("gives every profession exactly one primary attribute", () => {
    for (const id of ALL_PROFESSION_IDS) {
      const primaries = getProfession(id as never).attributes.filter((a) => a.isPrimary);
      expect(primaries).toHaveLength(1);
    }
  });

  it("has no two professions sharing an attribute id", () => {
    const allIds = ALL_PROFESSION_IDS.flatMap((id) =>
      getProfession(id as never).attributes.map((a) => a.id),
    );
    expect(new Set(allIds).size).toBe(allIds.length);
  });

  it("every attribute's professionId matches the profession that owns it", () => {
    for (const id of ALL_PROFESSION_IDS) {
      const prof = getProfession(id as never);
      for (const attr of prof.attributes) {
        expect(attr.professionId).toBe(prof.id);
      }
    }
  });
});

describe("getAttribute", () => {
  it("finds an attribute by id across all professions", () => {
    const strength = getAttribute("warrior.strength");
    expect(strength?.name).toBe("Strength");
    expect(strength?.isPrimary).toBe(true);
  });

  it("returns undefined for an unknown id", () => {
    expect(getAttribute("warrior.nonexistent")).toBeUndefined();
    expect(getAttribute("")).toBeUndefined();
  });
});

describe("primaryAttributeOf", () => {
  it("returns the correct primary attribute per profession", () => {
    expect(primaryAttributeOf("warrior").name).toBe("Strength");
    expect(primaryAttributeOf("monk").name).toBe("Divine Favor");
    expect(primaryAttributeOf("elementalist").name).toBe("Energy Storage");
  });

  it("matches getProfession's own primary flag", () => {
    for (const id of ALL_PROFESSION_IDS) {
      const primary = primaryAttributeOf(id as never);
      expect(primary.isPrimary).toBe(true);
      expect(primary.professionId).toBe(id);
    }
  });
});
