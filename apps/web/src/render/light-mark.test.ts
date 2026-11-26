import { describe, expect, it } from "vitest";

import { LIGHT_MARK_LOOK } from "./arena-palette.js";
import {
  BRAZIER_WIDTH,
  LIGHT_MARK_ART,
  LIGHT_MARK_BOX,
  type LightMarkKey,
  lightMarkKey,
  type LightMarkPainter,
} from "./light-mark.js";

interface Fill {
  readonly colour: number;
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** What a mark paints, each fill as the box it covers and the colour it is in. */
function fills(key: LightMarkKey, at: { x: number; y: number }): Fill[] {
  const painted: Fill[] = [];
  let colour = 0;
  const painter: LightMarkPainter = {
    fillStyle: (next) => {
      colour = next;
    },
    fillCircle: (x, y, r) =>
      painted.push({ colour, left: x - r, top: y - r, right: x + r, bottom: y + r }),
    fillRect: (x, y, w, h) =>
      painted.push({ colour, left: x, top: y, right: x + w, bottom: y + h }),
    fillEllipse: (x, y, w, h) =>
      painted.push({
        colour,
        left: x - w / 2,
        top: y - h / 2,
        right: x + w / 2,
        bottom: y + h / 2,
      }),
  };
  LIGHT_MARK_ART[key](painter, at);
  return painted;
}

describe("light marks (#2989)", () => {
  it("names a mark by the light id's prefix, and none for any other id", () => {
    expect(lightMarkKey("torch-west-door")).toBe("torch");
    expect(lightMarkKey("fire-west-hearth")).toBe("fire");
    expect(lightMarkKey("brazier-west-camp")).toBe("brazier");
    expect(lightMarkKey("lamp")).toBeUndefined();
    expect(lightMarkKey("torch")).toBeUndefined();
    expect(lightMarkKey("bonfire-1")).toBeUndefined();
  });

  it("paints each mark inside its box round the anchor, which is what it can hide (#3251)", () => {
    for (const key of Object.keys(LIGHT_MARK_ART) as LightMarkKey[]) {
      const painted = fills(key, { x: 300, y: 200 });
      expect(painted.length).toBeGreaterThan(0);
      const box = LIGHT_MARK_BOX[key];
      for (const fill of painted) {
        expect(fill.left).toBeGreaterThanOrEqual(300 + box.left);
        expect(fill.right).toBeLessThanOrEqual(300 + box.right);
        expect(fill.top).toBeGreaterThanOrEqual(200 + box.top);
        expect(fill.bottom).toBeLessThanOrEqual(200 + box.bottom);
      }
    }
  });

  it("stands a brazier's iron bowl ~28 units across on the anchor, its fire on top (#3504)", () => {
    const painted = fills("brazier", { x: 300, y: 200 });
    const rim = painted.findIndex((fill) => fill.colour === LIGHT_MARK_LOOK.ironRim);
    const bowl = painted[rim];
    expect(bowl).toBeDefined();
    expect((bowl?.right ?? 0) - (bowl?.left ?? 0)).toBe(BRAZIER_WIDTH);
    expect(((bowl?.left ?? 0) + (bowl?.right ?? 0)) / 2).toBe(300);
    // Its rim is lifted off the ground, over its legs' feet on the anchor.
    expect(bowl?.bottom ?? 200).toBeLessThan(200);
    expect(
      painted.some((fill) => fill.colour === LIGHT_MARK_LOOK.stand && fill.bottom === 200),
    ).toBe(true);
    // The fire is painted last, over the iron, in the fire's own colours.
    const fire = painted.slice(rim + 1);
    expect(fire.map((fill) => fill.colour)).toEqual(
      expect.arrayContaining([LIGHT_MARK_LOOK.coals, LIGHT_MARK_LOOK.blaze]),
    );
    expect(
      fire.every((f) => f.colour === LIGHT_MARK_LOOK.coals || f.colour === LIGHT_MARK_LOOK.blaze),
    ).toBe(true);
  });
});
