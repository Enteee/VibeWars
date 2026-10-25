import { describe, expect, it } from "vitest";

import { mayRun } from "./guard.js";

describe("mayRun", () => {
  const frame = {};
  const game = {};

  it("runs only sandboxed and framed", () => {
    expect(mayRun("null", frame, game)).toBe(true);
  });

  it("refuses the game's own origin, framed without a sandbox (ADR-0028)", () => {
    expect(mayRun("http://127.0.0.1:2577", frame, game)).toBe(false);
  });

  it("refuses a top-level page, even one with an opaque origin", () => {
    expect(mayRun("null", frame, frame)).toBe(false);
    expect(mayRun("https://enteee.github.io", frame, frame)).toBe(false);
  });
});
