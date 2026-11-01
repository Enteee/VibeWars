import { CREATURE_LOOKS } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { CREATURE_ARMS } from "./creature-arms.js";
import { WEAPON_MARK_GEOMETRY } from "./weapon-mark-geometry.js";

describe("CREATURE_ARMS (#2047)", () => {
  it("arms exactly the priest, the guard, the Guild Lord and the Ghostly Hero", () => {
    const armed = CREATURE_LOOKS.filter((look) => CREATURE_ARMS[look] !== undefined);
    expect([...armed].sort()).toEqual(["ghostly-hero", "guard", "guild-lord", "priest"]);
  });

  it("gives each a weapon that has a mark, and the guard alone a shield", () => {
    for (const arms of Object.values(CREATURE_ARMS)) {
      expect(Object.keys(WEAPON_MARK_GEOMETRY)).toContain(arms.weapon);
    }
    expect(CREATURE_ARMS.guard).toEqual({ weapon: "spear", offHand: "shield" });
  });
});
