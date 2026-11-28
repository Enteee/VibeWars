import { describe, expect, it } from "vitest";

import { fileMap } from "../net/maps.js";
import { matchCreatureLooks } from "./match-creature-looks.js";

const looks = (...args: Parameters<typeof matchCreatureLooks>): string[] =>
  [...matchCreatureLooks(...args)].sort();

describe("matchCreatureLooks (#4172)", () => {
  it("gives a necromancer every minion and horror its skills can raise", () => {
    expect(looks(["necromancer"], undefined)).toEqual([
      "bone-fiend",
      "bone-horror",
      "bone-minion",
      "flesh-golem",
      "jagged-horror",
      "shambling-horror",
      "vampiric-horror",
    ]);
  });

  it("gives a ritualist its spirits and a ranger its spirits and pets, a secondary too", () => {
    expect(looks(["ritualist"], undefined)).toEqual(["spirit"]);
    expect(looks(["ranger"], undefined)).toEqual(["beast", "spirit"]);
    expect(looks(["warrior", "ritualist"], undefined)).toEqual(["spirit"]);
  });

  it("gives nothing for professions with no summons, nor for none", () => {
    expect(looks(["warrior", "monk", "mesmer", "elementalist", undefined], undefined)).toEqual([]);
    expect(looks([], undefined)).toEqual([]);
  });

  it("adds what the map places: guards, a guild lord, priests, a Ghostly Hero", () => {
    expect(looks([], fileMap("guild-hall-isle"))).toEqual(["guard", "guild-lord", "priest"]);
    expect(looks([], fileMap("barrow-field"))).toEqual(["ghostly-hero", "priest"]);
    expect(looks([], fileMap("arena-crossroads"))).toEqual([]);
  });
});
