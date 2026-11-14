import { describe, expect, it } from "vitest";
import {
  MAX_POOL_ALPHA,
  cursedBy,
  dashedCircle,
  groundLook,
  groundMotion,
  harmsViewer,
  overlapsOf,
  poolBreath,
  stackedPoolAlpha,
  swirl,
  wisp,
  type CursingArea,
} from "./ground-effect-look.js";
import { ZONE_EDGE_WIDTH } from "./zone-look.js";

describe("harmsViewer (#3283, Q75 option A)", () => {
  it("dashes a foe's harm, not your own nor a foe's help", () => {
    expect(harmsViewer("foes", "enemy", false)).toBe(true);
    expect(harmsViewer("foes", "ally", false)).toBe(false);
    expect(harmsViewer("allies", "enemy", false)).toBe(false);
    expect(harmsViewer("allies", "ally", false)).toBe(false);
  });

  it("dashes an area that reaches all for every viewer", () => {
    expect(harmsViewer("all", "ally", false)).toBe(true);
    expect(harmsViewer("all", "enemy", false)).toBe(true);
    expect(harmsViewer("all", "ally", true)).toBe(true);
  });

  it("shows a watcher the skill's own reach", () => {
    expect(harmsViewer("foes", "ally", true)).toBe(true);
    expect(harmsViewer("allies", "enemy", true)).toBe(false);
  });
});

describe("groundLook (#3283)", () => {
  const settled = { dashed: true, age: 5, remaining: 5 };

  it("rests at the zone edge's width, a harmful pool fainter than a helpful one", () => {
    const harm = groundLook(settled);
    const help = groundLook({ ...settled, dashed: false });
    expect(harm.dashed).toBe(true);
    expect(help.dashed).toBe(false);
    expect(harm.edgeWidth).toBe(ZONE_EDGE_WIDTH);
    expect(harm.poolAlpha).toBeCloseTo(0.1, 9);
    expect(help.poolAlpha).toBeCloseTo(0.15, 9);
  });

  it("lands 2.5× wide, held for 0.3 s, eased back by 0.5 s", () => {
    expect(groundLook({ ...settled, age: 0 }).edgeWidth).toBeCloseTo(ZONE_EDGE_WIDTH * 2.5, 9);
    expect(groundLook({ ...settled, age: 0.3 }).edgeWidth).toBeCloseTo(ZONE_EDGE_WIDTH * 2.5, 9);
    const easing = groundLook({ ...settled, age: 0.4 }).edgeWidth;
    expect(easing).toBeLessThan(ZONE_EDGE_WIDTH * 2.5);
    expect(easing).toBeGreaterThan(ZONE_EDGE_WIDTH);
    expect(groundLook({ ...settled, age: 0.5 }).edgeWidth).toBeCloseTo(ZONE_EDGE_WIDTH, 9);
  });

  it("thins to 1 line over its last second, the pool fading by half", () => {
    const ending = groundLook({ ...settled, remaining: 0 });
    expect(ending.edgeWidth).toBeCloseTo(1, 9);
    expect(ending.poolAlpha).toBeCloseTo(0.05, 9);
    expect(ending.edgeAlpha).toBeLessThan(groundLook(settled).edgeAlpha);
    expect(groundLook({ ...settled, remaining: 0.5 }).edgeWidth).toBeCloseTo(1.5, 9);
  });

  it("keeps the landing and the ending under reduced motion; only the breath stills", () => {
    // groundLook takes no motion setting: what it says is state.
    expect(poolBreath(1.7, 0.4, true)).toBe(1);
    expect(poolBreath(0.75, 0, false)).toBeCloseTo(1.15, 9);
  });
});

describe("stackedPoolAlpha (#3283)", () => {
  it("keeps any number of overlapping pools under the cap", () => {
    for (const overlaps of [0, 1, 2, 5]) {
      const alpha = stackedPoolAlpha(0.15 * 1.15, overlaps);
      expect(1 - (1 - alpha) ** (overlaps + 1)).toBeLessThanOrEqual(MAX_POOL_ALPHA + 1e-9);
    }
    expect(stackedPoolAlpha(0.15, 0)).toBe(0.15);
  });

  it("counts the overlapping areas on the same layer only", () => {
    const a = { position: { x: 0, y: 0 }, layer: 0, radius: 50 };
    const b = { position: { x: 80, y: 0 }, layer: 0, radius: 50 };
    const c = { position: { x: 20, y: 0 }, layer: 1, radius: 50 };
    const d = { position: { x: 200, y: 0 }, layer: 0, radius: 50 };
    expect(overlapsOf(a, [a, b, c, d])).toBe(1);
    expect(overlapsOf(d, [a, b, c, d])).toBe(0);
  });
});

describe("dashedCircle", () => {
  it("cuts a circle into whole dashes, each dash long and a gap apart", () => {
    const arcs = dashedCircle(100, 9, 6);
    expect(arcs).toHaveLength(Math.round((2 * Math.PI * 100) / 15));
    const [first, second] = arcs;
    const step = (2 * Math.PI) / arcs.length;
    expect((first?.to ?? 0) - (first?.from ?? 0)).toBeCloseTo((step * 9) / 15, 9);
    expect(second?.from).toBeCloseTo(step, 9);
  });
});

describe("groundMotion (#3283)", () => {
  it("swirls a storm, raises wisps off a well, and leaves a ward and a trap still", () => {
    expect(groundMotion("mesmer.chaos-storm")).toBe("swirl");
    expect(groundMotion("necromancer.well-of-darkness")).toBe("wisp");
    expect(groundMotion("elementalist.ward-against-melee")).toBeUndefined();
    expect(groundMotion("ranger.barbed-trap")).toBeUndefined();
  });

  it("holds the swirls and wisps still under reduced motion", () => {
    const out = { radius: 0, from: 0, to: 0, alpha: 0 };
    const early = swirl(100, 1, 0, 0.2, true, out).from;
    expect(swirl(100, 1, 7, 0.2, true, out).from).toBe(early);
    expect(swirl(100, 1, 7, 0.2, false, out).from).not.toBe(early);
    const mote = { x: 0, y1: 0, y2: 0, alpha: 0 };
    const still = wisp(100, 2, 0, 0.2, true, mote).y1;
    expect(wisp(100, 2, 3.3, 0.2, true, mote).y1).toBe(still);
  });

  it("keeps every swirl and wisp inside its area", () => {
    const out = { radius: 0, from: 0, to: 0, alpha: 0 };
    const mote = { x: 0, y1: 0, y2: 0, alpha: 0 };
    for (let index = 0; index < 5; index += 1) {
      expect(swirl(100, index, 3, 0, false, out).radius).toBeLessThan(100);
      const w = wisp(100, index, 1.1, 0, false, mote);
      expect(Math.hypot(w.x, Math.max(Math.abs(w.y1), Math.abs(w.y2)))).toBeLessThan(100);
    }
  });
});

describe("cursedBy (#3283)", () => {
  const well: CursingArea = {
    position: { x: 0, y: 0 },
    layer: 0,
    radius: 100,
    reach: "foes",
    owner: "enemy",
    dashed: true,
  };

  it("marks a body of yours inside a foe's well", () => {
    expect(cursedBy({ x: 40, y: 0 }, 0, "ally", [well])).toBe(true);
  });

  it("leaves a body outside it, or on another layer, unmarked", () => {
    expect(cursedBy({ x: 140, y: 0 }, 0, "ally", [well])).toBe(false);
    expect(cursedBy({ x: 40, y: 0 }, 1, "ally", [well])).toBe(false);
  });

  it("leaves the well's own side unmarked, and any area that can't hurt your side", () => {
    expect(cursedBy({ x: 40, y: 0 }, 0, "enemy", [well])).toBe(false);
    const yours = { ...well, owner: "ally" as const, dashed: false };
    expect(cursedBy({ x: 40, y: 0 }, 0, "enemy", [yours])).toBe(false);
  });

  it("marks once inside two areas", () => {
    expect(cursedBy({ x: 40, y: 0 }, 0, "ally", [well, well])).toBe(true);
  });
});
