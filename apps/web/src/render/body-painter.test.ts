import { describe, expect, it } from "vitest";

import { REST_FRAME } from "./attack-clock.js";
import { paintStandingBody, type Painter, type StandingBody } from "./body-painter.js";
import { newCapeMotion, stepCapeMotion } from "./cape-motion.js";
import type { CapeLook } from "./cape-shape.js";

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

const LOOK: CapeLook = { main: 0xa078e0, trim: 0xf2f2f2, emblem: "diamond" };

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
    const calls = paint({ ...BODY, cape: { look: LOOK, motion: newCapeMotion() } });
    expect(calls[0]).toBe(`fillStyle(${String(0xa078e0)}, 1)`);
    expect(calls[1]).toMatch(/^fillPoints\(/);
    const disc = calls.indexOf("fillStyle(5882623, 1)");
    const band = calls.indexOf("lineStyle(3, 724756, 1)");
    expect(band).toBeGreaterThan(disc);
    // The body as without one, the band between the self rim and the marks.
    expect([...calls.slice(disc, band), ...calls.slice(band + 8)]).toEqual(paint(BODY));
  });

  it("draws a folded cape as pinned", () => {
    expect(paint({ ...BODY, cape: { look: LOOK, motion: newCapeMotion() } })).toMatchSnapshot();
  });

  it("draws a cape unfolded by a walk to +x as pinned, trailing to -x", () => {
    const motion = newCapeMotion();
    for (let i = 0; i < 60; i++) {
      stepCapeMotion(motion, 1 / 60, { x: 100, y: 50, r: 14, vx: 180, vy: 0 });
    }
    const calls = paint({ ...BODY, cape: { look: LOOK, motion } });
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
