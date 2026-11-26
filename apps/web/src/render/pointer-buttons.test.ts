import { describe, expect, it } from "vitest";

import { buttonChanges } from "./pointer-buttons.js";

describe("buttonChanges", () => {
  it("reports a single press and its release", () => {
    expect(buttonChanges(0, 1)).toEqual({ pressed: ["left"], released: [] });
    expect(buttonChanges(1, 0)).toEqual({ pressed: [], released: ["left"] });
  });

  it("reports a left press while the right is held, and nothing for the right", () => {
    expect(buttonChanges(2, 3)).toEqual({ pressed: ["left"], released: [] });
  });

  it("reports releasing one of two, and keeps the other held", () => {
    expect(buttonChanges(3, 2)).toEqual({ pressed: [], released: ["left"] });
  });

  it("reports releasing both at once", () => {
    expect(buttonChanges(3, 0)).toEqual({ pressed: [], released: ["left", "right"] });
  });

  it("reports nothing for a move with the same buttons", () => {
    expect(buttonChanges(2, 2)).toEqual({ pressed: [], released: [] });
  });

  it("ignores the back and forward buttons", () => {
    expect(buttonChanges(0, 8 | 16)).toEqual({ pressed: [], released: [] });
  });
});
