import { describe, expect, it } from "vitest";

import { rechargeView } from "./recharge-overlay.js";

describe("rechargeView", () => {
  it("shows nothing for a ready skill, or one with no recharge at all", () => {
    expect(rechargeView({ remaining: 0, total: 10 }, "Fireball", false)).toBeUndefined();
    expect(rechargeView({ remaining: 0, total: 0 }, "Fireball", false)).toBeUndefined();
  });

  it("shades the share still to go, and says the whole seconds left", () => {
    expect(rechargeView({ remaining: 7.4, total: 10 }, "Fireball", false)).toEqual({
      fraction: 0.74,
      seconds: "7",
      label: "Fireball, recharging, 7 seconds",
    });
  });

  it("stops the number at 1; the last second is the wipe alone", () => {
    expect(rechargeView({ remaining: 1.2, total: 10 }, "Fireball", false)?.seconds).toBe("1");
    const last = rechargeView({ remaining: 0.4, total: 10 }, "Fireball", false);
    expect(last?.seconds).toBe("");
    expect(last?.label).toBe("Fireball, recharging, 1 second");
  });

  it("snaps the wipe up to the next eighth with reduced motion", () => {
    expect(rechargeView({ remaining: 7.4, total: 10 }, "Fireball", true)?.fraction).toBe(0.75);
    expect(rechargeView({ remaining: 0.1, total: 10 }, "Fireball", true)?.fraction).toBe(0.125);
    expect(rechargeView({ remaining: 10, total: 10 }, "Fireball", true)?.fraction).toBe(1);
  });

  it("never shades more than the whole slot", () => {
    expect(rechargeView({ remaining: 12, total: 10 }, "Fireball", false)?.fraction).toBe(1);
  });
});
