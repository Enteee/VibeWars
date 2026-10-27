import type { WireCombat, WireCombatBatch } from "@vibewars/game-protocol";
import { describe, expect, it } from "vitest";

import { packCombat } from "./combat-batches.js";
import { messageBytes } from "./transport.js";

/** A weapon hit on `target`, `padding` characters of target id longer. */
function entry(target: number, padding = 0): WireCombat {
  return {
    casterId: "a",
    cause: "weapon",
    skillId: "",
    weaponId: "sword",
    attributeId: "",
    doubleStrike: false,
    area: null,
    events: [
      {
        kind: "damage",
        targetId: `${"x".repeat(padding)}${String(target)}`,
        amount: 12,
        skillId: null,
        statusId: null,
        durationSeconds: null,
        crit: null,
        fromId: null,
      },
    ],
  };
}

/** Every batch within both caps, and all of them together the input, in order. */
function expectPacked(
  batches: readonly WireCombatBatch[],
  entries: readonly WireCombat[],
  maxBytes: number,
  maxCount: number,
): void {
  for (const batch of batches) {
    expect(batch.length).toBeGreaterThan(0);
    expect(batch.length).toBeLessThanOrEqual(maxCount);
    expect(messageBytes(batch)).toBeLessThanOrEqual(maxBytes);
  }
  expect(batches.flat()).toEqual(entries);
}

describe("packCombat (#601)", () => {
  it("sends nothing for nothing", () => {
    expect(packCombat([], 1000, 64)).toEqual([]);
  });

  it("puts a tick that fits into one batch", () => {
    const entries = [entry(1), entry(2), entry(3)];
    expect(packCombat(entries, 16 * 1024, 64)).toEqual([entries]);
  });

  it("cuts a tick too big for one message into several that each fit, in log order", () => {
    const entries = Array.from({ length: 40 }, (_, i) => entry(i, 37 * (i % 5)));
    const maxBytes = 2000;
    const batches = packCombat(entries, maxBytes, 64);
    expect(batches.length).toBeGreaterThan(2);
    expectPacked(batches, entries, maxBytes, 64);
    // Greedy: no batch would have taken the next one's first entry.
    for (let i = 0; i + 1 < batches.length; i += 1) {
      const next = batches[i + 1]?.[0];
      expect(messageBytes([...(batches[i] ?? []), next])).toBeGreaterThan(maxBytes);
    }
  });

  it("fits an entry that brings a batch to exactly maxBytes", () => {
    const entries = [entry(1), entry(2)];
    const exact = messageBytes(entries);
    expect(packCombat(entries, exact, 64)).toEqual([entries]);
    expect(packCombat(entries, exact - 1, 64)).toEqual([[entries[0]], [entries[1]]]);
  });

  it("sends an entry over maxBytes on its own, whole", () => {
    const big = entry(2, 500);
    const entries = [entry(1), big, entry(3)];
    expect(packCombat(entries, 300, 64)).toEqual([[entries[0]], [big], [entries[2]]]);
  });

  it("still caps a batch at maxCount entries when they are tiny", () => {
    const entries = Array.from({ length: 65 }, (_, i) => entry(i));
    const batches = packCombat(entries, Number.POSITIVE_INFINITY, 64);
    expect(batches.map((batch) => batch.length)).toEqual([64, 1]);
    expectPacked(batches, entries, Number.POSITIVE_INFINITY, 64);
  });
});
