import type { ChainMark } from "@vibewars/game-core";
import type { WireChainMark } from "@vibewars/game-protocol";
import { describe, expect, it } from "vitest";

import { chainMarks, chainMarksPredicted } from "./chain-marks.js";

const mark = (
  targetId: string,
  role: WireChainMark["role"],
  remainingSeconds: number,
): WireChainMark => ({ targetId, role, remainingSeconds });

describe("chainMarks (#916)", () => {
  it("lists each target's mark, its role and the time it has left", () => {
    const marks = new Map<string, ChainMark>([
      ["bob", { role: "lead", remainingSeconds: 15 }],
      ["cy", { role: "off-hand", remainingSeconds: 2.5 }],
    ]);
    expect(chainMarks({ chainMarks: marks })).toEqual([
      mark("bob", "lead", 15),
      mark("cy", "off-hand", 2.5),
    ]);
    expect(chainMarks({ chainMarks: new Map() })).toEqual([]);
  });
});

describe("chainMarksPredicted (#916)", () => {
  it("is true while the marks only count down", () => {
    expect(chainMarksPredicted([mark("bob", "lead", 15)], 4, [mark("bob", "lead", 11)])).toBe(true);
    expect(chainMarksPredicted([], 4, [])).toBe(true);
  });

  it("is true when a mark runs out as counted", () => {
    expect(chainMarksPredicted([mark("bob", "lead", 3)], 3, [])).toBe(true);
    expect(chainMarksPredicted([mark("bob", "lead", 3)], 5, [])).toBe(true);
  });

  it("is false for a new mark, or one on a new target", () => {
    expect(chainMarksPredicted([], 1, [mark("bob", "lead", 15)])).toBe(false);
    expect(
      chainMarksPredicted([mark("bob", "lead", 15)], 1, [
        mark("bob", "lead", 14),
        mark("cy", "lead", 15),
      ]),
    ).toBe(false);
  });

  it("is false for a new role, even at the very time left", () => {
    expect(chainMarksPredicted([mark("bob", "lead", 15)], 0, [mark("bob", "off-hand", 15)])).toBe(
      false,
    );
  });

  it("is false for a refresh: the same role landed again, back to the full time", () => {
    expect(chainMarksPredicted([mark("bob", "lead", 15)], 4, [mark("bob", "lead", 15)])).toBe(
      false,
    );
  });

  it("is false for a mark gone early, as with a death", () => {
    expect(chainMarksPredicted([mark("bob", "dual", 15)], 4, [])).toBe(false);
  });
});
