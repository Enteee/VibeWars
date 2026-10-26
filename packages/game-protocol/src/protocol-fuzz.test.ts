import { describe, expect, it } from "vitest";

import { parseClientIntent } from "./protocol.js";

/**
 * Hostile payloads at the intent parser (brief §32), moved here from the
 * old server's fuzz test with the server (#404): a host parses every
 * peer's intent with it, so it must never throw and never hand back
 * something malformed. The corpus is seeded, so a failure reproduces.
 * The same payloads through a running host are `match-hostile.test.ts`
 * in game-session.
 */

/** A small seeded generator (mulberry32): this package depends on nothing. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Values chosen to break naive parsers. */
function hostileValues(): unknown[] {
  return [
    undefined,
    null,
    0,
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.MAX_SAFE_INTEGER,
    "",
    "   ",
    "0",
    "null",
    "[]",
    "\u0000",
    "x".repeat(500),
    true,
    false,
    [],
    [1, 2, 3],
    {},
    { kind: "move" },
    { kind: "move", dirX: "1", dirY: "1" },
    { kind: "move", dirX: Number.NaN, dirY: 0 },
    { kind: "move", dirX: 1e308, dirY: 1e308 },
    { kind: "target" },
    { kind: "target", targetSessionId: 42 },
    { kind: "use-skill" },
    { kind: "use-skill", slot: -1 },
    { kind: "use-skill", slot: 1.5 },
    { kind: "use-skill", slot: Number.MAX_SAFE_INTEGER },
    { kind: "use-skill", slot: "0" },
    { kind: "__proto__" },
    { kind: "constructor" },
    { kind: "move", dirX: 1, dirY: 0, extra: { deeply: { nested: "junk" } } },
  ];
}

describe("parseClientIntent fuzzing", () => {
  it("never throws, whatever it is handed", () => {
    for (const value of hostileValues()) {
      expect(() => parseClientIntent(value)).not.toThrow();
    }
  });

  it("only ever returns a recognised intent kind or undefined", () => {
    const allowed = new Set(["move", "stop", "target", "use-skill", "attack", "cancel", "walk-to"]);
    for (const value of hostileValues()) {
      const parsed = parseClientIntent(value);
      if (parsed !== undefined) {
        expect(allowed.has(parsed.kind)).toBe(true);
      }
    }
  });

  it("never returns a move intent carrying a non-finite direction", () => {
    for (const value of hostileValues()) {
      const parsed = parseClientIntent(value);
      if (parsed?.kind === "move") {
        expect(Number.isFinite(parsed.dirX)).toBe(true);
        expect(Number.isFinite(parsed.dirY)).toBe(true);
      }
    }
  });

  it("never returns a use-skill intent with a negative or fractional slot", () => {
    for (const value of hostileValues()) {
      const parsed = parseClientIntent(value);
      if (parsed?.kind === "use-skill") {
        expect(Number.isInteger(parsed.slot)).toBe(true);
        expect(parsed.slot).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("does not pollute Object.prototype via a hostile payload", () => {
    parseClientIntent(
      JSON.parse('{"kind":"move","dirX":1,"dirY":0,"__proto__":{"pwned":1}}') as unknown,
    );
    expect(({} as Record<string, unknown>).pwned).toBeUndefined();
  });

  it("survives a large randomised corpus", () => {
    const random = seeded(0x5eed);
    const pieces = hostileValues();
    for (let i = 0; i < 2000; i += 1) {
      const payload: Record<string, unknown> = {};
      for (const field of ["kind", "dirX", "dirY", "slot", "targetSessionId", "x", "y"]) {
        if (random() < 0.6) {
          payload[field] = pieces[Math.floor(random() * pieces.length)];
        }
      }
      expect(() => parseClientIntent(payload)).not.toThrow();
    }
  });
});
