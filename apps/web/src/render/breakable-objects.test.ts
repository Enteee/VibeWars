import { describe, expect, it } from "vitest";

import { FLAT_STRUCTURE } from "./arena-snapshot.js";
import {
  breakableAtPoint,
  crackStage,
  renderableBreakables,
  type RenderableBreakable,
} from "./breakable-objects.js";

const wall = { kind: "rect", x: 100, y: 100, width: 60, height: 16 } as const;
const descriptor = { id: "gap", layer: 0, wall, maxHealth: 300 };

describe("crackStage (#3031)", () => {
  it("is whole above two thirds, cracked at two thirds and a third, rubble at 0", () => {
    expect(crackStage(300, 300)).toBe(0);
    expect(crackStage(201, 300)).toBe(0);
    expect(crackStage(200, 300)).toBe(1);
    expect(crackStage(100, 300)).toBe(2);
    expect(crackStage(1, 300)).toBe(2);
    expect(crackStage(0, 300)).toBe(3);
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
