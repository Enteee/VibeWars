import { describe, expect, it } from "vitest";
import { gw1EnergyScaled } from "./ruleset.js";

describe("gw1EnergyScaled (#1395)", () => {
  it("scales a GW1 energy threshold from its pool of 20 to this one's 50", () => {
    expect(gw1EnergyScaled(22)).toBe(55);
    expect(gw1EnergyScaled(20)).toBe(50);
  });
});
