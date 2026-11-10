import { ZONE_KINDS } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import { ZONE_LOOK, zoneFillAlpha } from "./zone-look.js";

describe("ZONE_LOOK (ADR-0053, #3024)", () => {
  it("breathes round its alpha, never to nothing and never opaque", () => {
    for (const kind of ZONE_KINDS) {
      const look = ZONE_LOOK[kind];
      const alphas = Array.from({ length: 64 }, (_, at) => zoneFillAlpha(look, at / 20, false));
      expect(Math.min(...alphas)).toBeGreaterThan(0);
      expect(Math.max(...alphas)).toBeLessThan(1);
      expect(Math.max(...alphas) - Math.min(...alphas)).toBeGreaterThan(look.pulse);
    }
  });

  it("gives every kind its own fill, so each is told apart (#3027)", () => {
    const fills = ZONE_KINDS.map((kind) => ZONE_LOOK[kind].fill);
    expect(new Set(fills).size).toBe(fills.length);
  });

  it("holds still when the player asks for less motion", () => {
    const look = ZONE_LOOK.scorched;
    expect(zoneFillAlpha(look, 0.4, true)).toBe(look.alpha);
    expect(zoneFillAlpha(look, 1.1, true)).toBe(look.alpha);
  });
});
