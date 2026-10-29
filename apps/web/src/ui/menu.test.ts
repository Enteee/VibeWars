import { defaultBuildEquipment } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { CHARACTER_SCHEMA_VERSION, type StoredCharacter } from "../storage/schema.js";
import { isPlayable, rosterOrder, rosterSubtitle } from "./menu.js";

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

describe("rosterOrder (#1425)", () => {
  const ids = (list: readonly StoredCharacter[]) => list.map((c) => c.id);
  // Newest saved first, as the repository lists them.
  const saved = [character({ id: "rolled" }), character({ id: "b" }), character({ id: "c" })];

  it("puts the random starter last, even when it is the newest", () => {
    expect(ids(rosterOrder(saved, "rolled"))).toEqual(["b", "c", "rolled"]);
  });

  it("keeps everyone else newest first", () => {
    expect(ids(rosterOrder(saved, "b"))).toEqual(["rolled", "c", "b"]);
  });

  it("changes nothing with no starter, or one deleted", () => {
    expect(ids(rosterOrder(saved, undefined))).toEqual(["rolled", "b", "c"]);
    expect(ids(rosterOrder(saved, "gone"))).toEqual(["rolled", "b", "c"]);
  });

  it("lists a starter alone as the only row", () => {
    expect(ids(rosterOrder([character({ id: "rolled" })], "rolled"))).toEqual(["rolled"]);
  });
});
