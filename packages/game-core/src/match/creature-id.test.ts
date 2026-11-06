import { describe, expect, it } from "vitest";

import { creatureId, creatureOwnerOf } from "./creature-id.js";

describe("creatureOwnerOf (#2483)", () => {
  it("reads the owner back from the id the simulation mints", () => {
    expect(creatureOwnerOf(creatureId("you", 3))).toBe("you");
    expect(creatureOwnerOf(creatureId("you/c3", 4))).toBe("you/c3");
  });

  it("is undefined for a masterless creature and a participant who is not a creature", () => {
    expect(creatureOwnerOf(creatureId(undefined, 1))).toBeUndefined();
    expect(creatureOwnerOf("you")).toBeUndefined();
    expect(creatureOwnerOf("/c1")).toBeUndefined();
    expect(creatureOwnerOf("you/cat")).toBeUndefined();
  });
});
