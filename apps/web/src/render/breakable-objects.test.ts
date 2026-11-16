import { describe, expect, it } from "vitest";

import { FLAT_STRUCTURE } from "./arena-snapshot.js";
import {
  breakableAtPoint,
  breakableSeed,
  CRACK_GROW_SECONDS,
  crackReveal,
  drawnReveal,
  observeBreakable,
  renderableBreakables,
  type RenderableBreakable,
} from "./breakable-objects.js";

const wall = { kind: "rect", x: 100, y: 100, width: 60, height: 16 } as const;
const descriptor = { id: "gap", layer: 0, wall, maxHealth: 300 };

describe("crackReveal (#3370)", () => {
  it("grows smoothly from 0 whole to 1 crumbled", () => {
    expect(crackReveal(300, 300)).toBe(0);
    expect(crackReveal(297, 300)).toBeCloseTo(0.01);
    expect(crackReveal(150, 300)).toBeCloseTo(0.5);
    expect(crackReveal(0, 300)).toBe(1);
    expect(crackReveal(-20, 300)).toBe(1);
  });
});

describe("breakableSeed (#3370)", () => {
  it("is the same for the same id, and differs between ids", () => {
    expect(breakableSeed("breakable-gap")).toBe(breakableSeed("breakable-gap"));
    expect(breakableSeed("breakable-gap")).not.toBe(breakableSeed("breakable-ice"));
  });
});

describe("renderableBreakables (#3031)", () => {
  it("targets each as breakable-<id>, with its outline and health", () => {
    expect(renderableBreakables([descriptor], [120])).toEqual([
      {
        id: "breakable-gap",
        layer: 0,
        wall,
        outline: [
          { x: 100, y: 100 },
          { x: 160, y: 100 },
          { x: 160, y: 116 },
          { x: 100, y: 116 },
        ],
        health: 120,
        maxHealth: 300,
      },
    ]);
  });

  it("stands whole before the first snapshot says otherwise", () => {
    expect(renderableBreakables([descriptor], [])[0]?.health).toBe(300);
  });
});

describe("breakableAtPoint (#3031)", () => {
  const standing: RenderableBreakable[] = renderableBreakables([descriptor], [300]);
  const crumbled: RenderableBreakable[] = renderableBreakables([descriptor], [0]);

  it("picks a standing wall under the point, and nothing beside it", () => {
    expect(breakableAtPoint(standing, { x: 130, y: 108 }, FLAT_STRUCTURE)).toBe("breakable-gap");
    expect(breakableAtPoint(standing, { x: 130, y: 140 }, FLAT_STRUCTURE)).toBeUndefined();
  });

  it("picks its front face, drawn above its footprint, on a layered map", () => {
    const layered = { ...FLAT_STRUCTURE, layerCount: 2 };
    expect(breakableAtPoint(standing, { x: 130, y: 90 }, layered)).toBe("breakable-gap");
    expect(breakableAtPoint(standing, { x: 130, y: 90 }, FLAT_STRUCTURE)).toBeUndefined();
  });

  it("never picks rubble", () => {
    expect(breakableAtPoint(crumbled, { x: 130, y: 108 }, FLAT_STRUCTURE)).toBeUndefined();
  });
});

describe("observeBreakable (#3370)", () => {
  const wall = { maxHealth: 300 };

  it("grows a hit's cracks in over 0.15 s, from where they were drawn", () => {
    const first = observeBreakable(undefined, { ...wall, health: 300 }, 0);
    const hit = observeBreakable(first, { ...wall, health: 150 }, 1);
    expect(hit.hitAt).toBe(1);
    expect(hit.hits).toBe(1);
    expect(drawnReveal(hit, 300, 1)).toBe(0);
    expect(drawnReveal(hit, 300, 1.075)).toBeGreaterThan(0);
    expect(drawnReveal(hit, 300, 1.075)).toBeLessThan(0.5);
    expect(drawnReveal(hit, 300, 1 + CRACK_GROW_SECONDS)).toBeCloseTo(0.5);
  });

  it("is itself while nothing changed", () => {
    const seen = observeBreakable(undefined, { ...wall, health: 200 }, 0);
    expect(observeBreakable(seen, { ...wall, health: 200 }, 3)).toBe(seen);
  });

  it("marks its fall, but not for a wall first seen fallen", () => {
    const standing = observeBreakable(undefined, { ...wall, health: 20 }, 0);
    expect(observeBreakable(standing, { ...wall, health: 0 }, 2).fellAt).toBe(2);
    expect(observeBreakable(undefined, { ...wall, health: 0 }, 2).fellAt).toBeUndefined();
  });

  it("moves its cracks back at once when it is healed", () => {
    const hurt = observeBreakable(
      observeBreakable(undefined, { ...wall, health: 300 }, 0),
      { ...wall, health: 60 },
      1,
    );
    const healed = observeBreakable(hurt, { ...wall, health: 240 }, 1.05);
    expect(healed.hitAt).toBeUndefined();
    expect(drawnReveal(healed, 300, 1.05)).toBeCloseTo(0.2);
  });
});
