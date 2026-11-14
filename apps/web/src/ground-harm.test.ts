import { describe, expect, it } from "vitest";
import { harmsViewer } from "./ground-harm.js";

describe("harmsViewer (#3283, Q75 option A)", () => {
  it("dashes a foe's harm, not your own nor a foe's help", () => {
    expect(harmsViewer("foes", "enemy", false)).toBe(true);
    expect(harmsViewer("foes", "ally", false)).toBe(false);
    expect(harmsViewer("allies", "enemy", false)).toBe(false);
    expect(harmsViewer("allies", "ally", false)).toBe(false);
  });

  it("dashes an area that reaches all for every viewer", () => {
    expect(harmsViewer("all", "ally", false)).toBe(true);
    expect(harmsViewer("all", "enemy", false)).toBe(true);
    expect(harmsViewer("all", "ally", true)).toBe(true);
  });

  it("shows a watcher the skill's own reach", () => {
    expect(harmsViewer("foes", "ally", true)).toBe(true);
    expect(harmsViewer("allies", "enemy", true)).toBe(false);
  });
});
