import { packEmblem } from "@vibewars/game-protocol";
import { describe, expect, it } from "vitest";

import { CAPE_PATTERNS } from "../cosmetics/catalog.js";

import { REST_FRAME } from "./attack-clock.js";
import { paintStandingBody, type Painter, type StandingBody } from "./body-painter.js";
import { capePatternShapes } from "./cape-pattern.js";
import { capeMotionShape, newCapeMotion, stepCapeMotion } from "./cape-motion.js";
import { capeLook, presetEmblem } from "./cape-shape.js";
import type { Point } from "./weapon-mark-geometry.js";

const LOOK = capeLook({
  main: "a078e0",
  trim: "f2f2f2",
  emblemColours: ["301050"],
  emblem: packEmblem(presetEmblem("diamond")),
});
const AT = { x: 100, y: 50, r: 14 };

/** A cape unfolded by a run to +x, trailing to -x. */
function running(): ReturnType<typeof newCapeMotion> {
  const motion = newCapeMotion();
  for (let i = 0; i < 60; i++) {
    stepCapeMotion(motion, 1 / 60, { ...AT, vx: 180, vy: 0 });
  }
  return motion;
}

/** Whether `point` lies inside the convex-or-not polygon `shape`, or within `slack` of it. */
function inside(point: Point, shape: readonly Point[], slack = 0.05): boolean {
  let crossings = 0;
  for (let i = 0; i < shape.length; i += 1) {
    const a = shape[i];
    const b = shape[(i + 1) % shape.length];
    if (a === undefined || b === undefined) {
      continue;
    }
    // Near an edge counts as on it.
    const lx = b.x - a.x;
    const ly = b.y - a.y;
    const t = Math.max(
      0,
      Math.min(1, ((point.x - a.x) * lx + (point.y - a.y) * ly) / (lx * lx + ly * ly)),
    );
    if (Math.hypot(a.x + lx * t - point.x, a.y + ly * t - point.y) <= slack) {
      return true;
    }
    if (a.y > point.y !== b.y > point.y) {
      const x = a.x + ((point.y - a.y) / (b.y - a.y)) * (b.x - a.x);
      if (x > point.x) {
        crossings += 1;
      }
    }
  }
  return crossings % 2 === 1;
}

describe("capePatternShapes (#3579)", () => {
  const shape = capeMotionShape(running(), AT, LOOK.emblem);

  it.each(CAPE_PATTERNS)("lays %s on the cloth, inside it", (pattern) => {
    const pieces = capePatternShapes(pattern, shape.tab);
    expect(pieces.length).toBeGreaterThan(0);
    for (const piece of pieces) {
      for (const point of piece) {
        expect(inside(point, shape.cloth), `${pattern} ${String(point.x)},${String(point.y)}`).toBe(
          true,
        );
      }
    }
  });

  it("is nothing while the cape has no length past its root", () => {
    const folded = capeMotionShape(newCapeMotion(), AT, LOOK.emblem);
    for (const pattern of CAPE_PATTERNS) {
      for (const piece of capePatternShapes(pattern, { ...folded.tab, notch: folded.tab.root })) {
        expect(piece).toEqual([]);
      }
    }
  });
});

describe("a patterned cape keeps its emblem readable (#3579)", () => {
  function record(body: StandingBody): string[] {
    const calls: string[] = [];
    const n = (value: number): string => String(Math.round(value * 100) / 100);
    const log =
      (name: string) =>
      (...args: number[]): void => {
        calls.push(`${name}(${args.map(n).join(", ")})`);
      };
    const painter: Painter = {
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
    };
    paintStandingBody(painter, body);
    return calls;
  }
  const BODY: StandingBody = {
    ...AT,
    facing: 0,
    team: "self",
    weaponId: "sword",
    offhandId: undefined,
    frame: REST_FRAME,
    cape: undefined,
  };

  it("sets every emblem part inside the emblem's field", () => {
    const shape = capeMotionShape(running(), AT, LOOK.emblem);
    expect(shape.emblem.length).toBeGreaterThan(0);
    for (const part of shape.emblem) {
      for (const point of part.points) {
        expect(inside(point, shape.emblemField)).toBe(true);
      }
    }
  });

  it.each(CAPE_PATTERNS)(
    "draws %s in the trim, then the field in the cape's colour, then all else as on a plain cape",
    (pattern) => {
      const motion = running();
      const plain = record({ ...BODY, cape: { look: LOOK, motion, pattern: undefined } });
      const worn = record({ ...BODY, cape: { look: LOOK, motion, pattern } });
      const pieces = capePatternShapes(pattern, capeMotionShape(motion, AT, LOOK.emblem).tab);
      // The cloth, then the pattern in the trim's colour, then the field in the cape's.
      expect(worn.slice(0, 2)).toEqual(plain.slice(0, 2));
      expect(worn[2]).toBe(`fillStyle(${String(LOOK.trim)}, 1)`);
      const field = 3 + pieces.length;
      expect(worn[field]).toBe(`fillStyle(${String(LOOK.main)}, 1)`);
      expect(worn[field + 1]).toMatch(/^fillPoints\(/);
      // The outline, the trim and the emblem in its own colours on top, as without a pattern.
      expect(worn.slice(field + 2)).toEqual(plain.slice(2));
    },
  );
});
