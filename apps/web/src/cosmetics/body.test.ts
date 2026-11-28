import { describe, expect, it } from "vitest";

import { BUILDS, HEIGHTS, bodyFromKey, bodyOf } from "./body.js";

/** `count` keys as random as a player key, from a fixed seed. */
function keys(count: number): string[] {
  let state = 0x2545f491;
  const hex = (): string => {
    state = (Math.imul(state, 1_103_515_245) + 12_345) >>> 0;
    return state.toString(16).padStart(8, "0");
  };
  return Array.from({ length: count }, () => Array.from({ length: 8 }, hex).join(""));
}

describe("a body from a key (#4250)", () => {
  it("is the same for the same key, every time", () => {
    expect(bodyFromKey("ab".repeat(32))).toEqual(bodyFromKey("ab".repeat(32)));
    expect(bodyFromKey("bot-2")).toEqual(bodyFromKey("bot-2"));
  });

  it("spreads each axis evenly over its values, and the two independently", () => {
    const bodies = keys(3000).map(bodyFromKey);
    const share = (match: (body: (typeof bodies)[number]) => boolean): number =>
      bodies.filter(match).length / bodies.length;
    for (const height of HEIGHTS) {
      expect(Math.abs(share((body) => body.height === height) - 1 / 3)).toBeLessThan(0.05);
    }
    for (const build of BUILDS) {
      expect(Math.abs(share((body) => body.build === build) - 1 / 3)).toBeLessThan(0.05);
      for (const height of HEIGHTS) {
        const pair = share((body) => body.height === height && body.build === build);
        expect(Math.abs(pair - 1 / 9), `${height} ${build}`).toBeLessThan(0.03);
      }
    }
  });

  it("fills in only the axes never picked", () => {
    const derived = bodyFromKey("cd".repeat(32));
    expect(bodyOf({ height: null, build: null }, "cd".repeat(32))).toEqual(derived);
    expect(bodyOf({ height: "tall", build: null }, "cd".repeat(32))).toEqual({
      height: "tall",
      build: derived.build,
    });
    expect(bodyOf({ height: "short", build: "lean" }, "cd".repeat(32))).toEqual({
      height: "short",
      build: "lean",
    });
  });
});
