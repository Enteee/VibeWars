import { describe, expect, it } from "vitest";

import { ARENA_RENDER } from "./arena-viewport.js";

describe("arena viewport (#3627)", () => {
  it("keeps every path point, so a cape emblem's sub-pixel cells are drawn", () => {
    expect(ARENA_RENDER.pathDetailThreshold).toBe(0);
  });
});
