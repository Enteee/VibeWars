import { defaultBuildEquipment } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { CHARACTER_SCHEMA_VERSION, type StoredCharacter } from "../storage/schema.js";
import { isPlayable, rosterSubtitle, rosterTags } from "./menu.js";

function character(overrides: Partial<StoredCharacter> = {}): StoredCharacter {
  return {
    schemaVersion: CHARACTER_SCHEMA_VERSION,
    id: "a",
    name: "Pyro",
    primaryProfession: "elementalist",
    secondaryProfession: "monk",
    attributes: [],
    skillBar: ["elementalist.fireball", null, null, null, null, null, null, null],
    equipment: defaultBuildEquipment("elementalist"),
    updatedAt: 1,
    ...overrides,
  };
}

describe("rosterSubtitle (#579)", () => {
  it("names the professions and how many slots are filled", () => {
    expect(rosterSubtitle(character())).toBe("Elementalist / Monk · 1/8 skills");
  });

  it("leaves an illegal build's invalidity to its row's tag (#1290)", () => {
    const illegal = character({
      skillBar: ["no.such-skill", null, null, null, null, null, null, null],
    });
    expect(rosterSubtitle(illegal)).toBe("Elementalist / Monk · 1/8 skills");
  });
});

describe("isPlayable (#1290)", () => {
  it("lets a legal build and an empty bar be chosen", () => {
    expect(isPlayable(character())).toBe(true);
    expect(isPlayable(character({ skillBar: Array(8).fill(null) }))).toBe(true);
  });

  it("never an invalid one", () => {
    expect(
      isPlayable(
        character({ skillBar: ["no.such-skill", null, null, null, null, null, null, null] }),
      ),
    ).toBe(false);
  });
});

describe("rosterTags (#1426)", () => {
  const illegal = { skillBar: ["no.such-skill", null, null, null, null, null, null, null] };

  it("marks the starter character Random, and no other", () => {
    expect(rosterTags(character({ id: "s" }), "s")).toEqual(["Random"]);
    expect(rosterTags(character({ id: "a" }), "s")).toEqual([]);
  });

  it("marks nothing Random without a starter", () => {
    expect(rosterTags(character({ id: "s" }), undefined)).toEqual([]);
  });

  it("puts Random before Invalid on an invalid starter", () => {
    expect(rosterTags(character({ id: "s", ...illegal }), "s")).toEqual(["Random", "Invalid"]);
    expect(rosterTags(character({ id: "a", ...illegal }), "s")).toEqual(["Invalid"]);
  });
});
