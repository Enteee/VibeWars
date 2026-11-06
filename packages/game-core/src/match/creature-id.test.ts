import { describe, expect, it } from "vitest";

import { creatureOwnerOf, mintCreatureId } from "./creature-id.js";

describe("creatureOwnerOf (#2483)", () => {
  it("names the owner of the id a creature is minted with", () => {
    expect(mintCreatureId("p1", 3)).toBe("p1/c3");
    expect(creatureOwnerOf(mintCreatureId("p1", 3))).toBe("p1");
  });

  it("names no owner for a masterless creature", () => {
    expect(creatureOwnerOf(mintCreatureId(undefined, 4))).toBeUndefined();
  });

  it("names no owner for an id that is no creature's", () => {
    expect(creatureOwnerOf("p1")).toBeUndefined();
    expect(creatureOwnerOf("p1/x")).toBeUndefined();
  });
});
