import { describe, expect, it } from "vitest";

import { creatureId, creatureSummonerOf } from "./creature-id.js";

describe("creatureSummonerOf (#2483)", () => {
  it("reads the owner back from the id the simulation mints", () => {
    expect(creatureSummonerOf(creatureId("you", 3))).toBe("you");
    expect(creatureSummonerOf(creatureId("you/c3", 4))).toBe("you/c3");
  });

  it("is undefined for a masterless creature and a participant who is not a creature", () => {
    expect(creatureSummonerOf(creatureId(undefined, 1))).toBeUndefined();
    expect(creatureSummonerOf("you")).toBeUndefined();
    expect(creatureSummonerOf("/c1")).toBeUndefined();
    expect(creatureSummonerOf("you/cat")).toBeUndefined();
  });
});
