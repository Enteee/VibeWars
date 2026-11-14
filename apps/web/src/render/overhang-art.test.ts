import { describe, expect, it } from "vitest";

import { BIOME } from "./arena-palette.js";
import {
  OVERHANG_FADED_ALPHA,
  OVERHANG_FADE_SECONDS,
  bodyUnder,
  overhangAlpha,
  paintOverhang,
  type OverhangBody,
  type OverhangCover,
} from "./overhang-art.js";
import { recordingGraphics } from "./recording-graphics.js";
import { ELEVATION_STEP } from "./render-order.js";

/** An awning of layer 1 over 100..200 × 100..200, on a map whose ground is 0. */
const AWNING: OverhangCover = {
  layer: 1,
  outline: [
    { x: 100, y: 100 },
    { x: 200, y: 100 },
    { x: 200, y: 200 },
    { x: 100, y: 200 },
  ],
  top: ELEVATION_STEP,
};
const FRAME = 1 / 60;
const onGround = (): number => 0;

function body(x: number, y: number, layer = 0): OverhangBody {
  return { id: "body", position: { x, y }, layer };
}

describe("bodyUnder (#3293)", () => {
  it("finds a body standing under it, anyone's", () => {
    expect(bodyUnder(AWNING, [body(150, 150)], onGround)).toBe(true);
  });

  it("finds a body drawn where its roof is drawn, just north of it", () => {
    // Its roof draws a layer's height up: 44..144 on screen.
    expect(bodyUnder(AWNING, [body(150, 70)], onGround)).toBe(true);
  });

  it("finds none beside it, or on its own layer", () => {
    expect(bodyUnder(AWNING, [body(260, 150)], onGround)).toBe(false);
    expect(bodyUnder(AWNING, [body(150, 150, 1)], onGround)).toBe(false);
    expect(bodyUnder(AWNING, [], onGround)).toBe(false);
  });

  it("reads where a lifted body stands, not where it draws", () => {
    // Drawn 56 up on layer 1 of a map whose ground is 0, standing under a layer 2 roof.
    const high = { ...AWNING, layer: 2, top: 2 * ELEVATION_STEP };
    const lifted = { id: "lifted", position: { x: 150, y: 150 - ELEVATION_STEP }, layer: 1 };
    expect(bodyUnder(high, [lifted], () => ELEVATION_STEP)).toBe(true);
  });
});

describe("overhangAlpha (#3293)", () => {
  /** The alpha after `seconds` of frames from `alpha`, covering or not. */
  const run = (alpha: number, covering: boolean, seconds: number, reduced = false): number => {
    let at = alpha;
    for (let t = 0; t < seconds - 1e-9; t += FRAME) {
      at = overhangAlpha(at, covering, FRAME, reduced);
    }
    return at;
  };

  it("fades while a body is under it, to the faded alpha and no lower", () => {
    expect(run(1, true, FRAME)).toBeLessThan(1);
    expect(run(1, true, OVERHANG_FADE_SECONDS)).toBeCloseTo(OVERHANG_FADED_ALPHA);
    expect(run(1, true, 1)).toBe(OVERHANG_FADED_ALPHA);
  });

  it("comes back over 0.2 s once its footprint is empty", () => {
    const halfway = run(OVERHANG_FADED_ALPHA, false, OVERHANG_FADE_SECONDS / 2);
    expect(halfway).toBeGreaterThan(OVERHANG_FADED_ALPHA);
    expect(halfway).toBeLessThan(1);
    expect(run(OVERHANG_FADED_ALPHA, false, OVERHANG_FADE_SECONDS)).toBeCloseTo(1);
  });

  it("fades at once under reduced motion", () => {
    expect(overhangAlpha(1, true, FRAME, true)).toBe(OVERHANG_FADED_ALPHA);
    expect(overhangAlpha(OVERHANG_FADED_ALPHA, false, FRAME, true)).toBe(1);
  });
});

describe("paintOverhang (#3293)", () => {
  for (const look of ["awning", "lean-to", "canopy"] as const) {
    it(`paints a ${look}: its eave, its roof and what tells it apart`, () => {
      const g = recordingGraphics();
      paintOverhang(
        {
          fillStyle: (colour, alpha) => g.fillStyle(colour, alpha),
          lineStyle: () => undefined,
          fillShape: (shape) => {
            if (shape.kind === "rect") {
              g.fillRect(shape.x, shape.y, shape.width, shape.height);
            } else {
              g.fillPoints(shape.points);
            }
          },
          fillCircle: (x, y, radius) => g.fillCircle(x, y, radius),
          lineBetween: () => undefined,
        },
        look,
        { kind: "rect", x: 100, y: 100, width: 100, height: 80 },
        BIOME.desert.overhang[look],
        1,
      );
      // The eave and the roof, opaque; a canopy's leaves fill too.
      expect(g.fills.length).toBeGreaterThanOrEqual(look === "canopy" ? 3 : 2);
      expect(g.fills.every(({ alpha }) => alpha === 1)).toBe(true);
    });
  }
});
