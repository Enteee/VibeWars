import { describe, expect, it } from "vitest";

import { FIRST_CAPE, isInvalidGuildTag, pickCape, showsCapeDesigner } from "./player-section.js";

describe("the guild tag field (#1406)", () => {
  it("shows as invalid only what is typed and is no tag", () => {
    expect(isInvalidGuildTag("")).toBe(false);
    expect(isInvalidGuildTag("  ")).toBe(false);
    expect(isInvalidGuildTag("VIBE")).toBe(false);
    expect(isInvalidGuildTag("V")).toBe(true);
    expect(isInvalidGuildTag("V B")).toBe(true);
    expect(isInvalidGuildTag("[V]")).toBe(true);
  });
});

describe("the cape designer (#1422)", () => {
  it("shows only while the tag is a valid one", () => {
    expect(showsCapeDesigner("")).toBe(false);
    expect(showsCapeDesigner("V")).toBe(false);
    expect(showsCapeDesigner("[VB]")).toBe(false);
    expect(showsCapeDesigner(" Vb ")).toBe(true);
  });

  it("starts a first pick from the sample, changes one part a pick, and No cape clears it", () => {
    const gold = pickCape(null, { part: "main", colour: "gold" });
    expect(gold).toEqual({ ...FIRST_CAPE, main: "gold" });
    expect(pickCape(gold, { part: "trim", colour: "gold" })).toEqual({
      ...FIRST_CAPE,
      main: "gold",
      trim: "gold",
    });
    expect(pickCape(gold, { part: "emblem", emblem: "ring" })).toEqual({
      ...FIRST_CAPE,
      main: "gold",
      emblem: "ring",
    });
    expect(pickCape(gold, { part: "none" })).toBeNull();
  });
});
