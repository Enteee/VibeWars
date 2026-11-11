import { describe, expect, it } from "vitest";

import { arenaPalette, GATE_DOOR_LOOK } from "./arena-palette.js";
import type { RenderableShape } from "./arena-snapshot.js";
import {
  doorPalette,
  GATE_ART,
  openLeaves,
  paintPlate,
  type GateFrame,
  type GatePainter,
  type PlatePainter,
} from "./gate-mark.js";

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

describe("gate doors (#3061, #3053)", () => {
  it("draws a shut door as an oak box over its wall, framed, with a brass knob", () => {
    const shut = draw("shut", DOOR, FRAME);
    expect(shut.fills[0]).toEqual({ shape: DOOR, colour: GATE_DOOR_LOOK.body, alpha: 1 });
    expect(shut.fills[1]?.colour).toBe(GATE_DOOR_LOOK.knob);
    expect(shut.columns).toEqual([{ height: 28, colour: GATE_DOOR_LOOK.face }]);
    expect(shut.strokes).toEqual([DOOR]);
    // Its seam, its bands on top and round the face, and its lit south edge.
    expect(shut.lines).toBeGreaterThan(3);
  });

  it("draws a shut door flat, without a front face, on a one-layer map", () => {
    const flat = draw("shut", DOOR, { ...FRAME, height: 0 });
    expect(flat.columns).toEqual([]);
    expect(flat.fills[0]?.shape).toEqual(DOOR);
  });

  it("swings an open door's leaves aside: a dark sill where it closes, a leaf beyond each end", () => {
    const open = draw("open", DOOR, FRAME);
    expect(open.fills[0]).toEqual({ shape: DOOR, colour: GATE_DOOR_LOOK.sill, alpha: 0.55 });
    expect(open.strokes).not.toContainEqual(DOOR);
    const leaves = openLeaves(DOOR);
    expect(leaves).toHaveLength(2);
    expect(open.columns).toHaveLength(2);
    for (const leaf of leaves) {
      if (leaf.kind !== "rect") {
        throw new Error("a rect door's leaves are rects");
      }
      // Off the gap, so the way through is clear.
      expect(leaf.y + leaf.height <= DOOR.y || leaf.y >= DOOR.y + 80).toBe(true);
    }
    // Shut, it fills its gap; open, nothing of it stands in the gap.
    expect(open.fills.filter((fill) => fill.colour === GATE_DOOR_LOOK.body)).toHaveLength(2);
  });

  it("extrudes a polygon door, with no knob, and opens it to its sill alone", () => {
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
    expect(openLeaves(wedge)).toEqual([]);
    expect(draw("open", wedge, FRAME).fills).toEqual([
      { shape: wedge, colour: GATE_DOOR_LOOK.sill, alpha: 0.55 },
    ]);
  });
});

describe("a gate's pressure plate (#3053)", () => {
  function plate(held: boolean): { fills: number[]; strokes: number[]; faces: number } {
    const fills: number[] = [];
    const strokes: number[] = [];
    let stroke = 0;
    let faces = 0;
    const painter: PlatePainter = {
      fillStyle: (colour) => {
        fills.push(colour);
        if (colour === GATE_DOOR_LOOK.plateFace) {
          faces += 1;
        }
      },
      lineStyle: (_, colour) => {
        stroke = colour;
      },
      fillEllipse: () => undefined,
      strokeEllipse: () => strokes.push(stroke),
    };
    paintPlate(painter, { x: 0, y: 0 }, held, 1);
    return { fills, strokes, faces };
  }

  it("stands proud with a front face, and sinks flush, ringed brass, while held", () => {
    expect(plate(false).faces).toBe(1);
    expect(plate(true).faces).toBe(0);
    expect(plate(false).strokes).not.toContain(GATE_DOOR_LOOK.knob);
    expect(plate(true).strokes).toContain(GATE_DOOR_LOOK.knob);
  });
});
