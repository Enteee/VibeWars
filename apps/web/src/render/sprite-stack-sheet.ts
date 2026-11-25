/**
 * #3977 spike only: a sheet for the ADR's screenshots. With `?stack`, the
 * page puts `window.__stackSheet()` up, a canvas of today's disc beside the
 * stacked body at four headings, the walk and the cast, and a stacked crate.
 */
import { canvasPainter } from "../ui/character-figure.js";
import { REST_FRAME } from "./attack-clock.js";
import { BODY_EDGE, teamColour } from "./arena-snapshot.js";
import { paintStandingBody } from "./body-painter.js";
import { bodySlices, crateSlices, paintStack } from "./sprite-stack.js";

const R = 16;
const CELL = 64;
const SCALE = 2;

export function showStackSheet(): HTMLCanvasElement {
  const headings = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
  const canvas = document.createElement("canvas");
  canvas.id = "stack-sheet";
  canvas.width = CELL * 6 * SCALE;
  canvas.height = CELL * 3 * SCALE;
  canvas.style.cssText = "position:fixed;left:0;top:0;z-index:99999;background:#5d6b4a";
  const context = canvas.getContext("2d");
  if (context === null) return canvas;
  context.scale(SCALE, SCALE);
  const painter = canvasPainter(context);
  const teams = ["ally", "enemy", "self"] as const;
  teams.forEach((team, row) => {
    const y = CELL * row + CELL / 2 + 8;
    paintStandingBody(painter, {
      x: CELL / 2,
      y,
      r: R,
      facing: 0,
      team,
      weaponId: "sword",
      offhandId: undefined,
      frame: REST_FRAME,
      cape: undefined,
    });
    headings.forEach((facing, i) => {
      const slices =
        row === 2 && i === 3
          ? crateSlices()
          : bodySlices(row === 1 ? Math.sin(i * 1.3) : 0, row === 2 && i === 2 ? 1 : 0);
      paintStack(
        painter,
        {
          x: CELL * (i + 1.5),
          y,
          r: R,
          facing,
          colour: teamColour(team),
          tint: undefined,
          edge: BODY_EDGE,
        },
        slices,
      );
    });
  });
  document.body.append(canvas);
  return canvas;
}
