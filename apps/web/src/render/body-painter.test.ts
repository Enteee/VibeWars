import { EMBLEM_GRID, packEmblem } from "@vibewars/game-protocol";
import { describe, expect, it } from "vitest";

import { cosmeticById } from "../cosmetics/catalog.js";
import { REST_FRAME } from "./attack-clock.js";
import {
  ASH,
  FORM_AURA_BREATH_SECONDS,
  FORM_AURA_COLOUR,
  ashCape,
  formAuraBreath,
  paintFormAura,
  paintStandingBody,
  type EmblemFrameLook,
  type Painter,
  type StandingBody,
} from "./body-painter.js";
import { capeMotionShape, newCapeMotion, stepCapeMotion, type CapeMotion } from "./cape-motion.js";
import {
  capeLook,
  emblemFrameShape,
  presetEmblem,
  type CapeLook,
  type EmblemGrid,
} from "./cape-shape.js";
import type { Point } from "./weapon-mark-geometry.js";

/** A painter that writes down every call, rounded so the record is stable. */
function recorder(): { readonly painter: Painter; readonly calls: string[] } {
  const calls: string[] = [];
  const n = (value: number): string => String(Math.round(value * 100) / 100);
  const log =
    (name: string) =>
    (...args: number[]): void => {
      calls.push(`${name}(${args.map(n).join(", ")})`);
    };
  return {
    calls,
    painter: {
      fillStyle: log("fillStyle"),
      lineStyle: log("lineStyle"),
      fillCircle: log("fillCircle"),
      strokeCircle: log("strokeCircle"),
      beginPath: log("beginPath"),
      moveTo: log("moveTo"),
      lineTo: log("lineTo"),
      arc: log("arc"),
      strokePath: log("strokePath"),
      fillPoints: (points) => {
        calls.push(`fillPoints(${points.map((p) => `${n(p.x)} ${n(p.y)}`).join(", ")})`);
      },
    },
  };
}

const BODY: StandingBody = {
  x: 100,
  y: 50,
  r: 14,
  facing: 0,
  team: "self",
  weaponId: "sword",
  offhandId: "shield",
  frame: REST_FRAME,
  cape: undefined,
};

const LOOK: CapeLook = capeLook({
  main: "a078e0",
  trim: "f2f2f2",
  emblemColours: ["f2f2f2"],
  emblem: packEmblem(presetEmblem("diamond")),
});

function paint(body: StandingBody): string[] {
  const { painter, calls } = recorder();
  paintStandingBody(painter, body);
  return calls;
}

describe("paintStandingBody (#1250)", () => {
  it("draws a sword and shield body as pinned", () => {
    expect(paint(BODY)).toMatchSnapshot();
  });

  it("draws a bow body as pinned, string included", () => {
    expect(
      paint({ ...BODY, team: "enemy", weaponId: "longbow", offhandId: undefined }),
    ).toMatchSnapshot();
  });

  it("rims only your own body", () => {
    const rim = "strokeCircle(100, 50, 12)";
    expect(paint(BODY)).toContain(rim);
    expect(paint({ ...BODY, team: "ally" })).not.toContain(rim);
  });

  it("draws the body alone with no weapon and no off-hand", () => {
    expect(paint({ ...BODY, weaponId: undefined, offhandId: undefined })).toEqual([
      "fillStyle(5882623, 1)",
      "fillCircle(100, 50, 14)",
      "lineStyle(1.5, 724756, 1)",
      "strokeCircle(100, 50, 13.25)",
      "lineStyle(2, 14147304, 1)",
      "strokeCircle(100, 50, 12)",
    ]);
  });

  it("draws a cape's cloth first, under the disc, its band over the rim (#1422, #1699)", () => {
    const calls = paint({
      ...BODY,
      cape: { look: LOOK, motion: newCapeMotion(), pattern: undefined, emblemFrame: undefined },
    });
    expect(calls[0]).toBe(`fillStyle(${String(0xa078e0)}, 1)`);
    expect(calls[1]).toMatch(/^fillPoints\(/);
    const disc = calls.indexOf("fillStyle(5882623, 1)");
    const band = calls.indexOf("lineStyle(3, 724756, 1)");
    expect(band).toBeGreaterThan(disc);
    // The body as without one, the band between the self rim and the marks.
    expect([...calls.slice(disc, band), ...calls.slice(band + 8)]).toEqual(paint(BODY));
  });

  it("draws a folded cape as pinned", () => {
    expect(
      paint({
        ...BODY,
        cape: { look: LOOK, motion: newCapeMotion(), pattern: undefined, emblemFrame: undefined },
      }),
    ).toMatchSnapshot();
  });

  it("draws a cape unfolded by a walk to +x as pinned, trailing to -x", () => {
    const motion = newCapeMotion();
    for (let i = 0; i < 60; i++) {
      stepCapeMotion(motion, 1 / 60, { x: 100, y: 50, r: 14, vx: 180, vy: 0 });
    }
    const calls = paint({
      ...BODY,
      cape: { look: LOOK, motion, pattern: undefined, emblemFrame: undefined },
    });
    // Root, then the left hem point, about 32 units behind the centre.
    expect(calls[1]).toMatch(/^fillPoints\([\d.]+ [\d.]+, 6\d/);
    expect(calls).toMatchSnapshot();
  });

  it("puts the marks on their own layer when given one", () => {
    const body = recorder();
    const marks = recorder();
    paintStandingBody(body.painter, BODY, marks.painter);
    expect([...body.calls, ...marks.calls]).toEqual(paint(BODY));
    expect(marks.calls.length).toBeGreaterThan(0);
  });
});

describe("a body in a form (#3229)", () => {
  it("glows under the disc in two faint cold steps, the outer one widest", () => {
    const { painter, calls } = recorder();
    paintFormAura(painter, 100, 50, 14 * 1.35, 1);
    expect(calls).toEqual([
      `fillStyle(${String(FORM_AURA_COLOUR)}, 0.12)`,
      "fillCircle(100, 50, 25.9)",
      `fillStyle(${String(FORM_AURA_COLOUR)}, 0.18)`,
      "fillCircle(100, 50, 22.4)",
    ]);
  });

  it("breathes between its low point and full, and holds full under reduced motion", () => {
    const breaths = Array.from({ length: 24 }, (_, i) =>
      formAuraBreath((i * FORM_AURA_BREATH_SECONDS) / 24, 0.3, false),
    );
    expect(Math.min(...breaths)).toBeGreaterThanOrEqual(0.6);
    expect(Math.max(...breaths)).toBeLessThanOrEqual(1);
    expect(Math.max(...breaths) - Math.min(...breaths)).toBeGreaterThan(0.3);
    for (const now of [0, 0.7, 1.9, 13]) {
      expect(formAuraBreath(now, 0.3, true)).toBe(1);
    }
  });

  it("tones a cape's colours to ash, its emblem's too, and keeps its emblem's grid (#3554)", () => {
    const ash = ashCape(LOOK);
    expect(ash.emblem).toBe(LOOK.emblem);
    const distance = (a: number, b: number): number =>
      Math.max(
        ...[16, 8, 0].map((shift) => Math.abs(((a >> shift) & 0xff) - ((b >> shift) & 0xff))),
      );
    expect(distance(ash.main, ASH)).toBeLessThan(distance(LOOK.main, ASH) / 2);
    expect(ash.palette).toHaveLength(LOOK.palette.length);
    for (const [index, colour] of LOOK.palette.entries()) {
      expect(distance(ash.palette[index] ?? 0, ASH)).toBeLessThan(distance(colour, ASH) / 2);
    }
    expect(distance(ash.trim, ASH)).toBeLessThan(distance(LOOK.trim, ASH) / 2);
    expect(ash.main).not.toBe(ash.trim);
  });

  it("paints a 1.35× body with its ash cape as pinned", () => {
    expect(
      paint({
        ...BODY,
        r: 14 * 1.35,
        cape: {
          look: ashCape(LOOK),
          motion: newCapeMotion(),
          pattern: undefined,
          emblemFrame: undefined,
        },
      }),
    ).toMatchSnapshot();
  });
});

/** An emblem frame from the catalog (#3581). */
function frameLook(id: string): EmblemFrameLook {
  const look = cosmeticById(id)?.look;
  if (look?.kind !== "emblemFrame") {
    throw new Error(`${id} is an emblem frame`);
  }
  return look;
}

/** A cape walked to +x for `seconds`: unfolding, then full. */
function walked(seconds: number): CapeMotion {
  const motion = newCapeMotion();
  for (let i = 0; i < seconds * 60; i++) {
    stepCapeMotion(motion, 1 / 60, { x: 100, y: 50, r: 14, vx: 180, vy: 0 });
  }
  return motion;
}

/** `point` in `grid`'s own frame, in cells from its centre. */
function inGrid(grid: EmblemGrid, point: Point): Point {
  const cell = grid.size / EMBLEM_GRID;
  const x = point.x - grid.centre.x;
  const y = point.y - grid.centre.y;
  const cos = Math.cos(grid.turn);
  const sin = Math.sin(grid.turn);
  return { x: (x * cos + y * sin) / cell, y: (-x * sin + y * cos) / cell };
}

/** Whether `point` lies in the polygon `points`, or on its edge. */
function inside(points: readonly Point[], point: Point): boolean {
  let crossings = 0;
  for (const [i, a] of points.entries()) {
    const b = points[(i + 1) % points.length] ?? a;
    const cross = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
    const within =
      Math.min(a.x, b.x) - 1e-9 <= point.x &&
      point.x <= Math.max(a.x, b.x) + 1e-9 &&
      Math.min(a.y, b.y) - 1e-9 <= point.y &&
      point.y <= Math.max(a.y, b.y) + 1e-9;
    if (Math.abs(cross) < 1e-9 && within) {
      return true;
    }
    if (a.y > point.y !== b.y > point.y) {
      const x = a.x + ((point.y - a.y) * (b.x - a.x)) / (b.y - a.y);
      if (x > point.x) {
        crossings += 1;
      }
    }
  }
  return crossings % 2 === 1;
}

describe("an emblem frame on the cape (#3581)", () => {
  const SILVER = frameLook("emblem-frame-silver");

  it("draws the emblem's pixels exactly as without it, the frame on the cloth before them", () => {
    const motion = walked(2);
    const bare = paint({
      ...BODY,
      cape: { look: LOOK, motion, pattern: undefined, emblemFrame: undefined },
    });
    const framed = paint({
      ...BODY,
      cape: { look: LOOK, motion, pattern: undefined, emblemFrame: SILVER },
    });
    const shape = capeMotionShape(motion, BODY, LOOK.emblem);
    if (shape.emblemGrid === undefined) {
      throw new Error("a full cape has room for its emblem");
    }
    const quads = emblemFrameShape(shape.emblemGrid, true);
    const frameCalls = framed.slice(2, 3 + quads.length);
    expect(frameCalls[0]).toBe(`fillStyle(${String(SILVER.colour)}, 1)`);
    expect(frameCalls).toHaveLength(1 + quads.length);
    // Cloth, then the frame, then everything else byte for byte: the emblem too.
    expect([...framed.slice(0, 2), ...framed.slice(3 + quads.length)]).toEqual(bare);
    expect(bare.length).toBeGreaterThan(2 + 4);
  });

  it("on a patterned cape, comes after the emblem's field, so the field never hides it", () => {
    const motion = walked(2);
    const plain = paint({
      ...BODY,
      cape: { look: LOOK, motion, pattern: "stripes", emblemFrame: undefined },
    });
    const framed = paint({
      ...BODY,
      cape: { look: LOOK, motion, pattern: "stripes", emblemFrame: SILVER },
    });
    const shape = capeMotionShape(motion, BODY, LOOK.emblem);
    if (shape.emblemGrid === undefined) {
      throw new Error("a full cape has room for its emblem");
    }
    const quads = emblemFrameShape(shape.emblemGrid, true);
    const at = framed.indexOf(`fillStyle(${String(SILVER.colour)}, 1)`);
    // The pattern in the trim's colour, then the field in the cape's, then the frame.
    expect(framed.indexOf(`fillStyle(${String(LOOK.trim)}, 1)`)).toBeLessThan(at - 2);
    expect(framed[at - 2]).toBe(`fillStyle(${String(LOOK.main)}, 1)`);
    expect([...framed.slice(0, at), ...framed.slice(at + 1 + quads.length)]).toEqual(plain);
  });

  it("lies outside the emblem's grid and on the cloth, unfolding or full, studs and all", () => {
    for (const seconds of [0.15, 0.25, 0.4, 0.7, 2]) {
      const shape = capeMotionShape(walked(seconds), BODY, LOOK.emblem);
      const grid = shape.emblemGrid;
      if (grid === undefined) {
        continue;
      }
      for (const quad of emblemFrameShape(grid, true)) {
        const local = quad.map((point) => inGrid(grid, point));
        const xs = local.map((point) => point.x);
        const ys = local.map((point) => point.y);
        const half = EMBLEM_GRID / 2 - 1e-6;
        const clear =
          Math.min(...xs) >= half ||
          Math.max(...xs) <= -half ||
          Math.min(...ys) >= half ||
          Math.max(...ys) <= -half;
        expect(clear, `a quad over the grid at ${String(seconds)} s`).toBe(true);
        for (const point of quad) {
          expect(inside(shape.cloth, point), `off the cloth at ${String(seconds)} s`).toBe(true);
        }
      }
    }
  });

  it("is at most one emblem cell wide", () => {
    const grid = { centre: { x: 0, y: 0 }, turn: 0, size: EMBLEM_GRID };
    const [top] = emblemFrameShape(grid, false);
    const ys = (top ?? []).map((point) => point.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(1);
  });

  it("frames an empty emblem's grid all the same, in the cape's trim for the trim frame", () => {
    const empty = { ...LOOK, emblem: packEmblem([]) };
    const motion = walked(2);
    const framed = paint({
      ...BODY,
      cape: {
        look: empty,
        motion,
        pattern: undefined,
        emblemFrame: frameLook("emblem-frame-trim"),
      },
    });
    expect(framed[2]).toBe(`fillStyle(${String(LOOK.trim)}, 1)`);
    expect(framed.slice(3, 7).every((call) => call.startsWith("fillPoints("))).toBe(true);
  });

  it("draws none while the cape is folded and its emblem has no room", () => {
    const motion = newCapeMotion();
    expect(capeMotionShape(motion, BODY, LOOK.emblem).emblemGrid).toBeUndefined();
    expect(
      paint({ ...BODY, cape: { look: LOOK, motion, pattern: undefined, emblemFrame: SILVER } }),
    ).toEqual(
      paint({ ...BODY, cape: { look: LOOK, motion, pattern: undefined, emblemFrame: undefined } }),
    );
  });
});
