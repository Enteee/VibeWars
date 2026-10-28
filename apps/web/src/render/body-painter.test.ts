import { describe, expect, it } from "vitest";

import { REST_FRAME } from "./attack-clock.js";
import { paintStandingBody, type BodyPainter, type StandingBody } from "./body-painter.js";

/** A painter that writes down every call, rounded, as `name(args)`. */
function recorder(calls: string[], layer: string): BodyPainter {
  const note =
    (name: string) =>
    (...args: readonly (number | readonly { x: number; y: number }[])[]) => {
      const shown = args.map((arg) =>
        typeof arg === "number"
          ? String(Math.round(arg * 100) / 100)
          : arg
              .map(
                (p) =>
                  `${String(Math.round(p.x * 100) / 100)},${String(Math.round(p.y * 100) / 100)}`,
              )
              .join(" "),
      );
      calls.push(`${layer}.${name}(${shown.join(", ")})`);
    };
  return {
    lineStyle: note("lineStyle"),
    fillStyle: note("fillStyle"),
    fillCircle: note("fillCircle"),
    strokeCircle: note("strokeCircle"),
    beginPath: note("beginPath"),
    moveTo: note("moveTo"),
    lineTo: note("lineTo"),
    arc: note("arc"),
    strokePath: note("strokePath"),
    fillPolygon: note("fillPolygon"),
  };
}

function paint(body: StandingBody): string[] {
  const calls: string[] = [];
  paintStandingBody({ body: recorder(calls, "body"), marks: recorder(calls, "marks") }, body);
  return calls;
}

const AT_REST = {
  x: 100,
  y: 50,
  r: 14,
  facing: 0,
  frame: REST_FRAME,
} as const;

describe("paintStandingBody (#1250)", () => {
  it("draws a sword-and-shield self body as pinned", () => {
    expect(
      paint({ ...AT_REST, team: "self", weaponId: "sword", offhandId: "shield" }),
    ).toMatchSnapshot();
  });

  it("draws a bow-wielding foe as pinned", () => {
    expect(
      paint({ ...AT_REST, team: "enemy", weaponId: "longbow", offhandId: undefined }),
    ).toMatchSnapshot();
  });

  it("puts the disc on the body layer and every mark over it", () => {
    const calls = paint({ ...AT_REST, team: "self", weaponId: "sword", offhandId: "focus" });
    const firstMark = calls.findIndex((call) => call.startsWith("marks."));
    expect(firstMark).toBeGreaterThan(0);
    expect(calls.slice(firstMark).every((call) => call.startsWith("marks."))).toBe(true);
  });

  it("draws no self rim on another's body, and no marks with empty hands", () => {
    const calls = paint({ ...AT_REST, team: "ally", weaponId: undefined, offhandId: undefined });
    expect(calls).toEqual([
      "body.fillStyle(5882623, 1)",
      "body.fillCircle(100, 50, 14)",
      "body.lineStyle(1.5, 724756, 1)",
      "body.strokeCircle(100, 50, 13.25)",
    ]);
  });
});
