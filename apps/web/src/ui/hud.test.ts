import { describe, expect, it } from "vitest";

import { describeOutcome, describeRefusal, formatClock, skillSlotHtml } from "./hud.js";

describe("formatClock", () => {
  it("formats seconds as m:ss", () => {
    expect(formatClock(0)).toBe("0:00");
    expect(formatClock(9)).toBe("0:09");
    expect(formatClock(65)).toBe("1:05");
    expect(formatClock(600)).toBe("10:00");
  });

  it("floors fractional seconds rather than showing a jittery decimal", () => {
    expect(formatClock(59.9)).toBe("0:59");
  });

  it("never shows a negative clock", () => {
    expect(formatClock(-5)).toBe("0:00");
  });
});

describe("describeOutcome", () => {
  it("reads as victory for the winning team's own players", () => {
    expect(describeOutcome(0, "score", 0)).toBe("Victory");
  });

  it("reads as defeat for the losing team's players", () => {
    expect(describeOutcome(0, "score", 1)).toBe("Defeat");
  });

  it("calls out a draw", () => {
    expect(describeOutcome(undefined, "time", 0)).toBe("Draw (time)");
  });

  it("notes when a match ended on the clock rather than on score", () => {
    expect(describeOutcome(1, "time", 1)).toBe("Victory (time)");
    expect(describeOutcome(1, "score", 1)).toBe("Victory");
  });

  it("falls back to naming the team for a spectator with no team of their own", () => {
    expect(describeOutcome(1, "score", undefined)).toBe("Team 2 wins");
  });
});

describe("describeRefusal", () => {
  it("says why a cast was refused, in one short line", () => {
    expect(describeRefusal("out-of-range")).toBe("Target is out of range.");
    expect(describeRefusal("no-line-of-sight")).toBe("Target is not in line of sight.");
    expect(describeRefusal("no-target")).toBe("Select a target first.");
    expect(describeRefusal("insufficient-energy")).toBe("Not enough energy.");
  });

  it("still says something for a reason this client does not know", () => {
    expect(describeRefusal("time-travel")).toBe("You cannot use that skill now.");
    // Not fooled by what every object has.
    expect(describeRefusal("toString")).toBe("You cannot use that skill now.");
  });
});

describe("skillSlotHtml", () => {
  const slot = (id: string) => ({
    id,
    name: id,
    energyCost: 10,
    adrenalineCost: 0,
    activationSeconds: 1,
    rechargeSeconds: 7,
  });

  it("carries the skill's type badge, named for a screen reader", () => {
    expect(skillSlotHtml(slot("elementalist.fireball"), 0)).toContain('alt="Spell"');
    expect(skillSlotHtml(slot("necromancer.faintheartedness"), 6)).toContain('alt="Hex"');
  });

  it("has no badge for a skill this client does not know", () => {
    expect(skillSlotHtml(slot("nobody.unknown"), 0)).not.toContain("skill-type-badge");
  });
});
