import { describe, expect, it } from "vitest";

import { arenaPalette, GATE_DOOR_LOOK, GATE_PORTCULLIS_LOOK } from "./arena-palette.js";
import type { RenderableShape } from "./arena-snapshot.js";
import {
  doorPalette,
  GATE_ART,
  openLeaves,
  paintPlate,
  type GateArt,
  type GateFrame,
  type GatePainter,
  type PlatePainter,
} from "./gate-mark.js";

/** A line drawn, in its layer's coordinates: `lift` is how far up it was translated. */
interface Segment {
  readonly from: { readonly x: number; readonly y: number };
  readonly to: { readonly x: number; readonly y: number };
  readonly lift: number;
  readonly colour: number;
}

interface Drawn {
  readonly fills: {
    readonly shape: RenderableShape;
    readonly colour: number;
    readonly alpha: number;
  }[];
  readonly columns: { readonly height: number; readonly colour: number }[];
  readonly strokes: RenderableShape[];
  readonly lines: number;
  readonly segments: readonly Segment[];
}

function draw(art: GateArt, wall: RenderableShape, frame: GateFrame): Drawn {
  let fill = { colour: 0, alpha: 0 };
  let stroke = 0;
  let lift = 0;
  const saved: number[] = [];
  const fills: Drawn["fills"] = [];
  const columns: Drawn["columns"] = [];
  const strokes: RenderableShape[] = [];
  const segments: Segment[] = [];
  const painter: GatePainter = {
    save: () => saved.push(lift),
    restore: () => {
      lift = saved.pop() ?? 0;
    },
    translateCanvas: (_, y) => {
      lift -= y;
    },
    fillStyle: (colour, alpha) => {
      fill = { colour, alpha };
    },
    lineStyle: (_, colour) => {
      stroke = colour;
    },
    fillShape: (shape) => fills.push({ shape, ...fill }),
    strokeShape: (shape) => strokes.push(shape),
    fillColumn: (_, height, colour) => columns.push({ height, colour }),
    lineBetween: (x1, y1, x2, y2) => {
      segments.push({ from: { x: x1, y: y1 }, to: { x: x2, y: y2 }, lift, colour: stroke });
    },
  };
  art(painter, wall, frame);
  return { fills, columns, strokes, lines: segments.length, segments };
}

const DOOR: RenderableShape = { kind: "rect", x: 244, y: 680, width: 16, height: 80 };
const FRAME: GateFrame = {
  height: 28,
  line: 1,
  palette: doorPalette(arenaPalette({ layerCount: 3, biome: "hall", ascentAct: null })),
};

describe("gate doors (#3061, #3053)", () => {
  it("draws a shut door as an oak box over its wall, framed, with a brass knob", () => {
    const shut = draw(GATE_ART.shut.door, DOOR, FRAME);
    expect(shut.fills[0]).toEqual({ shape: DOOR, colour: GATE_DOOR_LOOK.body, alpha: 1 });
    expect(shut.fills[1]?.colour).toBe(GATE_DOOR_LOOK.knob);
    expect(shut.columns).toEqual([{ height: 28, colour: GATE_DOOR_LOOK.face }]);
    expect(shut.strokes).toEqual([DOOR]);
    // Its seam, its bands on top and round the face, and its lit south edge.
    expect(shut.lines).toBeGreaterThan(3);
  });

  it("draws a shut door flat, without a front face, on a one-layer map", () => {
    const flat = draw(GATE_ART.shut.door, DOOR, { ...FRAME, height: 0 });
    expect(flat.columns).toEqual([]);
    expect(flat.fills[0]?.shape).toEqual(DOOR);
  });

  it("swings an open door's leaves aside: a dark sill where it closes, a leaf beyond each end", () => {
    const open = draw(GATE_ART.open.door, DOOR, FRAME);
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
    const shut = draw(GATE_ART.shut.door, wedge, FRAME);
    expect(shut.columns).toHaveLength(1);
    expect(shut.fills).toEqual([{ shape: wedge, colour: GATE_DOOR_LOOK.body, alpha: 1 }]);
    expect(openLeaves(wedge)).toEqual([]);
    expect(draw(GATE_ART.open.door, wedge, FRAME).fills).toEqual([
      { shape: wedge, colour: GATE_DOOR_LOOK.sill, alpha: 0.55 },
    ]);
  });
});

describe("portcullis and secret passage (#3068)", () => {
  const STONE: GateFrame = {
    height: 28,
    line: 1,
    palette: arenaPalette({ layerCount: 3, biome: "hall", ascentAct: null }),
  };

  it("draws a shut portcullis as the dark of its arch behind an iron grid", () => {
    const shut = draw(GATE_ART.shut.portcullis, DOOR, STONE);
    expect(shut.columns).toEqual([{ height: 28, colour: GATE_PORTCULLIS_LOOK.dark }]);
    expect(shut.fills.filter((fill) => fill.shape.kind === "rect")).toEqual([
      { shape: DOOR, colour: GATE_PORTCULLIS_LOOK.dark, alpha: 1 },
    ]);
    // Framed round its footprint, and its grid's top.
    expect(shut.strokes).toEqual([DOOR, DOOR]);
    expect(shut.lines).toBeGreaterThan(10);
  });

  it("raises an open portcullis' grid over a dark opening, nothing of it in the gap", () => {
    const open = draw(GATE_ART.open.portcullis, DOOR, STONE);
    expect(open.fills).toEqual([{ shape: DOOR, colour: GATE_PORTCULLIS_LOOK.dark, alpha: 1 }]);
    expect(open.columns).toEqual([]);
    expect(open.strokes).toEqual([DOOR]);
  });

  it("has no shut art for a secret passage, which is drawn as its wall, and opens it dark", () => {
    expect(Object.keys(GATE_ART.shut)).not.toContain("secret");
    const open = draw(GATE_ART.open.secret, DOOR, STONE);
    expect(open.fills).toEqual([{ shape: DOOR, colour: GATE_PORTCULLIS_LOOK.dark, alpha: 1 }]);
    expect(open.columns).toEqual([]);
  });
});

describe("a portcullis reads up or down from its footprint, also under a cover (#3644)", () => {
  const STONE: GateFrame = {
    height: 28,
    line: 1,
    palette: arenaPalette({ layerCount: 3, biome: "hall" }),
  };
  // A 14 u strip across an east-west tunnel, and a wide gate across a north-south way.
  const STRIP = { kind: "rect", x: 300, y: 500, width: 14, height: 60 } as const;
  const WIDE = { kind: "rect", x: 200, y: 400, width: 120, height: 14 } as const;
  const shapes = [
    { name: "a 14 u strip", wall: STRIP, depth: STRIP.width },
    { name: "a wide gate", wall: WIDE, depth: WIDE.height },
  ];

  /** Its iron, drawn on its layer (not lifted) and within its footprint. */
  function ironInFootprint(drawn: Drawn, wall: typeof STRIP | typeof WIDE): readonly Segment[] {
    const inside = ({ x, y }: { x: number; y: number }): boolean =>
      x >= wall.x && x <= wall.x + wall.width && y >= wall.y && y <= wall.y + wall.height;
    return drawn.segments.filter(
      (segment) =>
        segment.colour === GATE_PORTCULLIS_LOOK.iron &&
        segment.lift === 0 &&
        inside(segment.from) &&
        inside(segment.to),
    );
  }

  /** How far across its footprint a segment reaches. */
  const reach = (segment: Segment): number =>
    Math.hypot(segment.to.x - segment.from.x, segment.to.y - segment.from.y);

  for (const { name, wall, depth } of shapes) {
    for (const height of [28, 0]) {
      it(`shut, ${name} fills its footprint with bars across it, at height ${String(height)}`, () => {
        const shut = draw(GATE_ART.shut.portcullis, wall, { ...STONE, height });
        const across = ironInFootprint(shut, wall).filter((bar) => reach(bar) === depth);
        // One at every bar, `BAR_EVERY` (6 u) apart along it.
        const along = wall.height >= wall.width ? "y" : "x";
        const length = Math.max(wall.width, wall.height);
        const count = Math.floor(length / 6);
        const at = new Set(across.map((bar) => bar.from[along]));
        for (let bar = 1; bar < count; bar += 1) {
          expect(at).toContain(wall[along] + (length * bar) / count);
        }
        // Its spiked tips, on its camera-facing edge.
        const spikes = shut.fills.filter((fill) => fill.shape.kind === "polygon");
        expect(spikes.length).toBeGreaterThan(0);
        for (const { shape } of spikes) {
          if (shape.kind !== "polygon") {
            throw new Error("a spike is a polygon");
          }
          expect(Math.max(...shape.points.map((point) => point.y))).toBe(wall.y + wall.height);
        }
      });

      it(`open, ${name} has no bars in its footprint beyond a stub, at height ${String(height)}`, () => {
        const open = draw(GATE_ART.open.portcullis, wall, { ...STONE, height });
        const iron = ironInFootprint(open, wall);
        expect(iron.length).toBeGreaterThan(0);
        for (const bar of iron) {
          expect(reach(bar)).toBeLessThanOrEqual(depth / 4);
        }
        // Nothing lifted lands back on its footprint, on a flat map either.
        const lifted = open.segments.filter((segment) => segment.lift > 0);
        expect(lifted.length > 0).toBe(height > 0);
      });
    }
  }
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
