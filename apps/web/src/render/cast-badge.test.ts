import { describe, expect, it } from "vitest";

import {
  CAST_BADGE_GAP,
  CAST_BADGE_SIZE,
  CAST_BAR_HEIGHT,
  CAST_BAR_RISE,
  CAST_BAR_WIDTH,
  castBadgeLayout,
  castBadgeType,
} from "./cast-badge.js";

describe("castBadgeType (#1125)", () => {
  it("is the casting skill's type", () => {
    expect(castBadgeType("elementalist.fireball")).toBe("spell");
    expect(castBadgeType("mesmer.empathy")).toBe("hex");
    expect(castBadgeType("monk.protective-spirit")).toBe("enchantment");
    expect(castBadgeType("warrior.hammer-bash")).toBe("attack");
    expect(castBadgeType("ranger.troll-unguent")).toBe("skill");
  });

  it("is none for an unknown skill or no cast", () => {
    expect(castBadgeType("nobody.no-such-skill")).toBeUndefined();
    expect(castBadgeType(undefined)).toBeUndefined();
  });
});

describe("castBadgeLayout (#1125)", () => {
  it.each([14, 9])("sits left of the bar, centred on it, above the health bar, at r = %i", (r) => {
    const x = 100;
    const y = 200;
    const centre = castBadgeLayout(x, y, r);
    const barLeft = x - CAST_BAR_WIDTH / 2;
    const barTop = y - r - CAST_BAR_RISE;
    expect(centre.x + CAST_BADGE_SIZE / 2).toBe(barLeft - CAST_BADGE_GAP);
    expect(centre.y).toBe(barTop + CAST_BAR_HEIGHT / 2);
    // The health bar's top is y − r − 12.
    expect(centre.y + CAST_BADGE_SIZE / 2).toBeLessThan(y - r - 12);
  });
});
