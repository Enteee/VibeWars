import type { Vec2 } from "@vibewars/game-core";
import type { OutsideKind } from "@vibewars/game-maps/schema";

import type { Box } from "./layer-surfaces.js";
import { OUTSIDE_LOOK } from "./arena-palette.js";
import { type OutsidePainter, paintOutsideTile } from "./outside-land.js";

/**
 * The top of a wall inside an outlined map (#3808,
 * docs/art/3808-wall-top-texture.md): the outside land's own tile, lifted
 * by a wash of its pale tone so the top stays the wall's lightest plane.
 * Graphics cannot fill with a pattern, so each layer's tops are one tiled
 * sprite drawn through a stencil of the tops as they show.
 */

/** The land a wall top is made of: forest, deep water and a cliff's drop are not wall rock. */
export type WallTopKind = "rock" | "basalt";

export function wallTopKind(outside: OutsideKind): WallTopKind {
  return outside === "basalt" ? "basalt" : "rock";
}

/** The study's lift per kind: basalt's land is near black, so it needs more. */
export const WALL_TOP_WASH: Record<
  WallTopKind,
  { readonly colour: number; readonly alpha: number }
> = {
  rock: { colour: OUTSIDE_LOOK.rock.rim, alpha: 0.22 },
  basalt: { colour: OUTSIDE_LOOK.basalt.ash, alpha: 0.32 },
};

/** Paints one wall-top tile of `kind` at the origin: the outside tile, then its wash. */
export function paintWallTopTile(painter: OutsidePainter, kind: WallTopKind, size: number): void {
  paintOutsideTile(painter, kind);
  const wash = WALL_TOP_WASH[kind];
  painter.fillStyle(wash.colour, wash.alpha);
  painter.fillRect(0, 0, size, size);
}

/**
 * What of one wall draws in its layer's graphics, in draw order: its
 * front faces and its top, each as convex polygons in drawn coordinates.
 * `group` is the sprite its top textures with: the layer's, or a tunnel's
 * when it is a piece faded with that tunnel's cover.
 */
export interface DrawnWall {
  readonly group: number | undefined;
  readonly faces: readonly (readonly Vec2[])[];
  readonly top: readonly (readonly Vec2[])[];
}

/** One step of a group's stencil: `open` lets the sprite through `polygons`, else it shuts them. */
export interface StencilStep {
  readonly open: boolean;
  readonly polygons: readonly (readonly Vec2[])[];
}

/**
 * The stencil steps that let `group`'s sprite show exactly where its tops
 * show: each top opens, and what draws later over an open top (a face in
 * front, or another group's piece) shuts again. Steps of one kind in a row
 * are one step, so a layer with no wall in front of another's top is a
 * single step.
 */
export function stencilSteps(
  walls: readonly DrawnWall[],
  group: number | undefined,
): readonly StencilStep[] {
  const steps: { open: boolean; polygons: (readonly Vec2[])[] }[] = [];
  const opened: Box[] = [];
  const push = (open: boolean, polygons: readonly (readonly Vec2[])[]): void => {
    if (polygons.length === 0) {
      return;
    }
    const last = steps.at(-1);
    if (last?.open === open) {
      last.polygons.push(...polygons);
    } else {
      steps.push({ open, polygons: [...polygons] });
    }
  };
  const over = (polygons: readonly (readonly Vec2[])[]): readonly (readonly Vec2[])[] =>
    polygons.filter((polygon) => {
      const box = boxOfPoints(polygon);
      return box !== undefined && opened.some((top) => overlaps(top, box));
    });
  for (const wall of walls) {
    if (wall.group === group) {
      push(false, over(wall.faces));
      push(true, wall.top);
      opened.push(...wall.top.flatMap((polygon) => boxOfPoints(polygon) ?? []));
    } else {
      push(false, over([...wall.faces, ...wall.top]));
    }
  }
  return steps;
}

/** The box round every point of `polygons`, or `undefined` for none. */
export function boxOfPoints(...polygons: readonly (readonly Vec2[])[]): Box | undefined {
  const points = polygons.flat();
  if (points.length === 0) {
    return undefined;
  }
  const xs = points.map(({ x }) => x);
  const ys = points.map(({ y }) => y);
  return {
    left: Math.min(...xs),
    top: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
  };
}

function overlaps(a: Box, b: Box): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}
