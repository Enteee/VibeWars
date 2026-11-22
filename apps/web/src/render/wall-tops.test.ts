import type { Vec2 } from "@vibewars/game-core";
import { OUTSIDE_KINDS } from "@vibewars/game-maps/schema";
import { describe, expect, it } from "vitest";

import { OUTSIDE_LOOK, OUTSIDE_TILE, type OutsidePainter } from "./outside-land.js";
import {
  WALL_TOP_WASH,
  boxOfPoints,
  paintWallTopTile,
  stencilSteps,
  wallTopKind,
  type DrawnWall,
} from "./wall-tops.js";

const square = (x: number, y: number, side: number): readonly Vec2[] => [
  { x, y },
  { x: x + side, y },
  { x: x + side, y: y + side },
  { x, y: y + side },
];

/** A wall whose top is a 100 square at `x, y`, its front face the 56 high strip under it. */
const wall = (x: number, y: number, group?: number): DrawnWall => ({
  group,
  top: [square(x, y, 100)],
  faces: [
    [
      { x, y: y + 100 },
      { x: x + 100, y: y + 100 },
      { x: x + 100, y: y + 156 },
      { x, y: y + 156 },
    ],
  ],
});

describe("wallTopKind", () => {
  it.each(OUTSIDE_KINDS)("%s tops its walls with rock or basalt", (outside) => {
    expect(wallTopKind(outside)).toBe(outside === "basalt" ? "basalt" : "rock");
  });
});

describe("paintWallTopTile", () => {
  it("paints the outside tile, then the study's wash over the whole of it", () => {
    const fills: [number, number][] = [];
    const rects: number[][] = [];
    const painter: OutsidePainter = {
      fillStyle: (colour, alpha) => fills.push([colour, alpha]),
      fillRect: (...rect) => rects.push(rect),
      fillCircle: () => undefined,
      fillTriangle: () => undefined,
      fillEllipse: () => undefined,
      lineStyle: () => undefined,
      lineBetween: () => undefined,
    } as OutsidePainter;
    paintWallTopTile(painter, "basalt", OUTSIDE_TILE);
    expect(fills[0]).toEqual([OUTSIDE_LOOK.basalt.base, 1]);
    expect(fills.at(-1)).toEqual([OUTSIDE_LOOK.basalt.ash, 0.32]);
    expect(rects.at(-1)).toEqual([0, 0, OUTSIDE_TILE, OUTSIDE_TILE]);
    expect(WALL_TOP_WASH.rock).toEqual({ colour: OUTSIDE_LOOK.rock.rim, alpha: 0.22 });
  });
});

describe("stencilSteps", () => {
  it("opens every top in one step when no wall stands in front of another", () => {
    const walls = [wall(0, 0), wall(300, 0), wall(0, 400)];
    expect(stencilSteps(walls, undefined)).toEqual([
      { open: true, polygons: walls.flatMap(({ top }) => top) },
    ]);
  });

  it("shuts a later wall's face where it stands over an earlier top, then opens that wall's top", () => {
    const back = wall(0, 150);
    const front = wall(0, 0);
    expect(stencilSteps([back, front], undefined)).toEqual([
      { open: true, polygons: back.top },
      { open: false, polygons: front.faces },
      { open: true, polygons: front.top },
    ]);
  });

  it("shuts another group's piece drawn over its tops, and opens only its own", () => {
    const rest = wall(0, 0);
    const overTunnel = wall(50, -80, 3);
    const far = wall(900, 900, 3);
    expect(stencilSteps([rest, overTunnel, far], undefined)).toEqual([
      { open: true, polygons: rest.top },
      { open: false, polygons: [...overTunnel.faces, ...overTunnel.top] },
    ]);
    expect(stencilSteps([rest, overTunnel, far], 3)).toEqual([
      { open: true, polygons: [...overTunnel.top, ...far.top] },
    ]);
  });

  it("has no step for a group with no wall", () => {
    expect(stencilSteps([wall(0, 0)], 7)).toEqual([]);
  });
});

describe("boxOfPoints", () => {
  it("is the box round every polygon, or nothing for none", () => {
    expect(boxOfPoints(square(0, 0, 10), square(20, -5, 10))).toEqual({
      left: 0,
      top: -5,
      right: 30,
      bottom: 10,
    });
    expect(boxOfPoints()).toBeUndefined();
  });
});
