import { describe, expect, it } from "vitest";

import { pipArrows } from "./pips.js";

describe("pipArrows (#504)", () => {
  it("draws one arrow a pip, right for regeneration, left for degeneration, none at 0", () => {
    expect(pipArrows(-10)).toBe("‹".repeat(10));
    expect(pipArrows(-3)).toBe("‹‹‹");
    expect(pipArrows(0)).toBe("");
    expect(pipArrows(4)).toBe("››››");
    expect(pipArrows(10)).toBe("›".repeat(10));
  });
});
