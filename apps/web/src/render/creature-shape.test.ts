import { CREATURE_LOOKS } from "@vibewars/game-core";
import { describe, expect, it } from "vitest";

import {
  CREATURE_DRAWN_RADIUS,
  DEAD_DASH,
  DEAD_GAP,
  HEXAGON_SCALE,
  creatureOrnament,
  creatureOutline,
  creatureTick,
  dashes,
  spiritBob,
  spiritWisp,
  type CreatureOrnament,
} from "./creature-shape.js";

describe("creatureOutline (#1162)", () => {
  it("gives a creature a pointy-top hexagon at 1.1 × its radius", () => {
    const points = creatureOutline(100, 50, 10);
    expect(points).toHaveLength(6);
    for (const point of points) {
      expect(Math.hypot(point.x - 100, point.y - 50)).toBeCloseTo(10 * HEXAGON_SCALE, 9);
    }
    expect(Math.min(...points.map((p) => p.y))).toBeCloseTo(50 - 11, 9);
    expect(points.filter((p) => Math.abs(p.x - 100) < 1e-9)).toHaveLength(2);
  });
});

describe("dashes (#1162)", () => {
  it("runs the pattern on round corners, a dash every dash + gap of outline", () => {
    const square = [
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 5, y: 5 },
      { x: 0, y: 5 },
    ];
    const drawn = dashes(square, 3, 2);
    const total = drawn.reduce((sum, [a, b]) => sum + Math.hypot(b.x - a.x, b.y - a.y), 0);
    // 20 of outline, 4 whole patterns of 5: 12 drawn.
    expect(total).toBeCloseTo(12, 9);
    // The second dash starts at 5 on the first corner, the pattern unbroken.
    expect(drawn[0]).toEqual([
      { x: 0, y: 0 },
      { x: 3, y: 0 },
    ]);
    expect(drawn[1]?.[0]).toEqual({ x: 5, y: 0 });
  });

  it("keeps the study's 3 2 at radius 10", () => {
    expect([DEAD_DASH * 10, DEAD_GAP * 10]).toEqual([3, 2]);
  });
});

describe("creature ornaments (#2047)", () => {
  /** How far from the centre an ornament reaches, its stroke included. */
  const reach = (ornament: CreatureOrnament, x: number, y: number): number =>
    ornament.kind === "ring"
      ? ornament.radius + ornament.width / 2
      : Math.max(...ornament.points.map((p) => Math.hypot(p.x - x, p.y - y)));

  it("draws every look at a radius, an NPC bigger than a summon", () => {
    for (const look of CREATURE_LOOKS) {
      expect(CREATURE_DRAWN_RADIUS[look]).toBeGreaterThanOrEqual(10);
    }
    expect(CREATURE_DRAWN_RADIUS["guild-lord"]).toBeGreaterThan(CREATURE_DRAWN_RADIUS.priest);
    expect(CREATURE_DRAWN_RADIUS["bone-horror"]).toBeGreaterThan(
      CREATURE_DRAWN_RADIUS["bone-minion"],
    );
  });

  it("rims a horror with 12 teeth and a minion with 10", () => {
    const teeth = (look: "bone-minion" | "jagged-horror"): number => {
      const [rim] = creatureOrnament(look, 0, 0, CREATURE_DRAWN_RADIUS[look]);
      return rim?.kind === "polygon" ? rim.points.length / 2 : 0;
    };
    expect(teeth("bone-minion")).toBe(10);
    expect(teeth("jagged-horror")).toBe(12);
  });

  it("gives a pet two ears and a Guild Lord five gold gems", () => {
    expect(creatureOrnament("beast", 0, 0, 10)).toHaveLength(2);
    const gems = creatureOrnament("guild-lord", 0, 0, 15);
    expect(gems).toHaveLength(5);
    expect(gems.every((gem) => gem.kind === "polygon" && gem.colour === 0xffd866)).toBe(true);
  });

  it("gives a spirit no dashed aura (#3306) and keeps the other rings whole", () => {
    const [halo] = creatureOrnament("ghostly-hero", 0, 0, 13.5);
    expect(creatureOrnament("spirit", 0, 0, 10)).toEqual([]);
    expect(halo?.kind === "ring" && halo.arcs).toEqual([{ from: 0, to: 2 * Math.PI }]);
  });

  it("keeps every ornament round its creature: past the plate, within 1.8 × its radius", () => {
    // The study's ear tips reach 1.69 r and the Lord's gems 1.77 r.
    for (const look of CREATURE_LOOKS.filter((look) => look !== "spirit")) {
      const r = CREATURE_DRAWN_RADIUS[look];
      const ornaments = creatureOrnament(look, 40, -20, r);
      expect(ornaments.length).toBeGreaterThan(0);
      for (const ornament of ornaments) {
        expect(reach(ornament, 40, -20)).toBeGreaterThan(r * HEXAGON_SCALE);
        expect(reach(ornament, 40, -20)).toBeLessThanOrEqual(r * 1.8);
      }
    }
  });
});

describe("spiritWisp (#3306)", () => {
  it("is a teardrop, point up, about the size of the plate it replaces", () => {
    const wisp = spiritWisp(40, -20, 10);
    const ys = wisp.map((at) => at.y);
    const xs = wisp.map((at) => at.x);
    // The tip is the top, on the middle line.
    const tip = wisp[ys.indexOf(Math.min(...ys))];
    expect(tip?.x).toBeCloseTo(40, 9);
    expect(tip?.y).toBeCloseTo(-20 - 12.5, 9);
    expect(Math.max(...ys)).toBeCloseTo(-20 + 12.5, 1);
    // Widest below its middle, as wide as the hexagon.
    const widest = wisp[xs.indexOf(Math.max(...xs))];
    expect(widest?.y).toBeGreaterThan(-20);
    expect(Math.max(...xs) - 40).toBeCloseTo(40 - Math.min(...xs), 9);
    expect(Math.max(...xs) - 40).toBeGreaterThan(9);
    expect(Math.max(...xs) - 40).toBeLessThanOrEqual(10 * HEXAGON_SCALE);
  });

  it("draws its core smaller, low inside it", () => {
    const outer = spiritWisp(0, 0, 10);
    const core = spiritWisp(0, 0, 10, 0.45);
    expect(Math.min(...core.map((at) => at.y))).toBeGreaterThan(
      Math.min(...outer.map((at) => at.y)),
    );
    expect(Math.max(...core.map((at) => at.y))).toBeLessThan(Math.max(...outer.map((at) => at.y)));
    expect(Math.max(...core.map((at) => at.x))).toBeLessThan(Math.max(...outer.map((at) => at.x)));
  });
});

describe("spiritBob (#3306)", () => {
  it("floats ±2 over 2 s, out of step by phase", () => {
    expect(spiritBob(0.5, 0, false)).toBeCloseTo(2, 9);
    expect(spiritBob(1.5, 0, false)).toBeCloseTo(-2, 9);
    expect(spiritBob(2.5, 0, false)).toBeCloseTo(2, 9);
    expect(spiritBob(0.5, 0.5, false)).toBeCloseTo(-2, 9);
  });

  it("stays still under reduced motion", () => {
    for (const now of [0, 0.5, 1.3, 7]) {
      expect(spiritBob(now, 0.25, true)).toBe(0);
    }
  });
});

describe("creatureTick (#2047)", () => {
  it("points along the facing, just past the plate", () => {
    const [tip, left, right] = creatureTick(100, 50, 10, 0);
    expect(tip.x).toBeCloseTo(100 + 11 + 2.6, 9);
    expect(tip.y).toBeCloseTo(50, 9);
    expect(left.x).toBeLessThan(tip.x);
    expect(right.x).toBeLessThan(tip.x);

    const [down] = creatureTick(100, 50, 10, Math.PI / 2);
    expect(down.x).toBeCloseTo(100, 9);
    expect(down.y).toBeCloseTo(50 + 13.6, 9);
  });
});
