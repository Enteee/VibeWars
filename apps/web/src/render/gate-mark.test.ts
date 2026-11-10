import { describe, expect, it } from "vitest";

import { arenaPalette, GATE_DOOR_LOOK } from "./arena-palette.js";
import type { RenderableShape } from "./arena-snapshot.js";
import { doorPalette, GATE_ART, type GateFrame, type GatePainter } from "./gate-mark.js";

interface Drawn {
  readonly fills: {
    readonly shape: RenderableShape;
    readonly colour: number;
    readonly alpha: number;
  }[];
  readonly columns: { readonly height: number; readonly colour: number }[];
  readonly strokes: RenderableShape[];
  readonly lines: number;
}

function draw(art: keyof typeof GATE_ART, wall: RenderableShape, frame: GateFrame): Drawn {
  let fill = { colour: 0, alpha: 0 };
  const fills: Drawn["fills"] = [];
  const columns: Drawn["columns"] = [];
  const strokes: RenderableShape[] = [];
  let lines = 0;
  const painter: GatePainter = {
    save: () => undefined,
    restore: () => undefined,
    translateCanvas: () => undefined,
    fillStyle: (colour, alpha) => {
      fill = { colour, alpha };
    },
    lineStyle: () => undefined,
    fillShape: (shape) => fills.push({ shape, ...fill }),
    strokeShape: (shape) => strokes.push(shape),
    fillColumn: (_, height, colour) => columns.push({ height, colour }),
    lineBetween: () => {
      lines += 1;
    },
  };
  GATE_ART[art](painter, wall, frame);
  return { fills, columns, strokes, lines };
}

const DOOR: RenderableShape = { kind: "rect", x: 244, y: 680, width: 16, height: 80 };
const FRAME: GateFrame = { height: 28, line: 1, palette: doorPalette(arenaPalette(3)) };

describe("gate doors (#3061)", () => {
  it("draws a shut door as a solid amber box over its wall, with a knob line", () => {
    const shut = draw("shut", DOOR, FRAME);
    expect(shut.fills).toEqual([{ shape: DOOR, colour: GATE_DOOR_LOOK.body, alpha: 1 }]);
    expect(shut.columns).toEqual([{ height: 28, colour: GATE_DOOR_LOOK.face }]);
    expect(shut.strokes).toEqual([DOOR]);
    // Its lit south edge, and the knob line.
    expect(shut.lines).toBe(2);
  });

  it("draws a shut door flat, without a front face, on a one-layer map", () => {
    const flat = draw("shut", DOOR, { ...FRAME, height: 0 });
    expect(flat.columns).toEqual([]);
    expect(flat.fills).toHaveLength(1);
  });

  it("draws an open door as no body: a faint fill and a dashed outline only", () => {
    const open = draw("open", DOOR, FRAME);
    expect(open.columns).toEqual([]);
    expect(open.strokes).toEqual([]);
    expect(open.fills).toEqual([{ shape: DOOR, colour: GATE_DOOR_LOOK.body, alpha: 0.18 }]);
    // Dashes round the 192-unit outline, one every 9 units.
    expect(open.lines).toBeGreaterThan(16);
  });

  it("extrudes a polygon door, with no knob line", () => {
    const wedge: RenderableShape = {
      kind: "polygon",
      points: [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 20, y: 30 },
      ],
    };
    const shut = draw("shut", wedge, FRAME);
    expect(shut.columns).toHaveLength(1);
    expect(shut.fills).toEqual([{ shape: wedge, colour: GATE_DOOR_LOOK.body, alpha: 1 }]);
  });
});
