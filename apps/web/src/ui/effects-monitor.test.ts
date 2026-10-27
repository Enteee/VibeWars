import type { StatusSnapshot } from "@vibewars/game-session";
import { describe, expect, it } from "vitest";

import { STATUS_CATEGORY_NAME, effectRows } from "./effects-monitor.js";

/**
 * The effects monitor's rows (#834). The DOM it draws them into is the
 * e2e suite's (e2e/effects-monitor.spec.ts): the unit tests run in Node.
 */

const ME = "me";
const NAMES = new Map([
  [ME, "Ann"],
  ["bob", "Bob"],
]);

function status(
  id: StatusSnapshot["id"],
  endsAt: number,
  durationSeconds: number,
  casterId = "bob",
): StatusSnapshot {
  return { id, endsAt, durationSeconds, casterId };
}

describe("effectRows (#834)", () => {
  it("keeps the order the host sent, oldest first", () => {
    const rows = effectRows(
      [status("bleeding", 20, 10), status("armor-boost", 15, 10), status("crippled", 30, 10)],
      ME,
      NAMES,
      10,
    );
    expect(rows.map((row) => row.id)).toEqual(["bleeding", "armor-boost", "crippled"]);
  });

  it("drains the bar from full to empty, and never below it", () => {
    const at = (now: number) =>
      effectRows([status("bleeding", 20, 10)], ME, NAMES, now)[0]?.fraction;
    expect(at(10)).toBe(1);
    expect(at(15)).toBe(0.5);
    expect(at(20)).toBe(0);
    expect(at(25)).toBe(0);
    // A late snapshot may put the clock before the start: still full.
    expect(at(8)).toBe(1);
  });

  it("gives a status with no duration no bar", () => {
    expect(effectRows([status("armor-boost", 0, 0)], ME, NAMES, 10)[0]?.fraction).toBeUndefined();
  });

  it("counts whole seconds left, rounded up, never below 0", () => {
    const left = (now: number) =>
      effectRows([status("bleeding", 20, 10)], ME, NAMES, now)[0]?.secondsLeft;
    expect(left(10)).toBe(10);
    expect(left(10.1)).toBe(10);
    expect(left(19.9)).toBe(1);
    expect(left(21)).toBe(0);
  });

  it("marks yours only an enchantment you cast", () => {
    const rows = effectRows(
      [
        status("armor-boost", 20, 10, ME),
        status("armor-boost", 20, 10, "bob"),
        status("faintheartedness", 20, 10, ME),
      ],
      ME,
      NAMES,
      10,
    );
    expect(rows.map((row) => row.yours)).toEqual([true, false, false]);
  });

  it("names the caster: you, their name, or someone who has left", () => {
    const rows = effectRows(
      [
        status("armor-boost", 20, 10, ME),
        status("bleeding", 20, 10),
        status("poison", 20, 10, "gone"),
      ],
      ME,
      NAMES,
      10,
    );
    expect(rows.map((row) => row.casterName)).toEqual(["you", "Bob", "someone"]);
  });

  it("carries each status's name and category, and an empty list is no rows", () => {
    const [row] = effectRows([status("deep-wound", 20, 10)], ME, NAMES, 10);
    expect(row?.name).toBe("Deep Wound");
    expect(row !== undefined && STATUS_CATEGORY_NAME[row.category]).toBe("Condition");
    expect(effectRows([], ME, NAMES, 10)).toEqual([]);
  });
});
